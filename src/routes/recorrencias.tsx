import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useAccountScope } from "@/lib/account-scope";
import { dueDateForMonth, formatCurrency, isFinanceClassification, monthLabel, monthKey, parseMonthKey, recurringRuleAppliesToMonth } from "@/lib/finance";
import { DESCRIPTION_MAX_LENGTH, NOTES_MAX_LENGTH, parseMoneyAmount, sanitizeText } from "@/lib/security";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, MonthlyBalance, RecurringRule } from "@/types/database";

type RuleForm = {
  entry_type: "income" | "expense";
  description: string;
  amount: string;
  day_of_month: string;
  start_month: string;
  end_month: string;
  account_id: string;
  category_id: string;
  notes: string;
};

const currentMonth = new Date().toISOString().slice(0, 7);

const emptyForm: RuleForm = {
  entry_type: "expense",
  description: "",
  amount: "",
  day_of_month: "5",
  start_month: currentMonth,
  end_month: "",
  account_id: "",
  category_id: "",
  notes: "",
};

function errorMessage(caughtError: unknown, fallback: string) {
  if (caughtError instanceof Error) return caughtError.message;
  if (caughtError && typeof caughtError === "object" && "message" in caughtError) return String(caughtError.message);
  return fallback;
}

export const Route = createFileRoute("/recorrencias")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: RecurringRulesPage,
});

function RecurringRulesPage() {
  const { user } = Route.useRouteContext();
  const { accountId: selectedAccountId } = useAccountScope();
  const supabase = createClient();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = categories.filter((category) => category.type === form.entry_type && isFinanceClassification(category, user.id));
  const filteredRules = selectedAccountId === "all" ? rules : rules.filter((rule) => rule.account_id === selectedAccountId);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [rulesResult, accountsResult, categoriesResult] = await Promise.all([
      supabase.from("recurring_rules").select("id,user_id,account_id,category_id,entry_type,description,amount,day_of_month,start_year,start_month,end_year,end_month,is_active,notes,created_at,updated_at").order("is_active", { ascending: false }).order("description"),
      supabase.from("accounts").select("id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at").order("type").order("name"),
    ]);

    if (rulesResult.error) setError(rulesResult.error.message);
    if (accountsResult.error) setError(accountsResult.error.message);
    if (categoriesResult.error) setError(categoriesResult.error.message);
    setRules(rulesResult.data ?? []);
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const ensureMonthlyBalance = async (year: number, month: number) => {
    const payload = {
      user_id: user.id,
      year,
      month,
      label: monthLabel(year, month),
    };

    const { data, error } = await supabase
      .from("monthly_balances")
      .upsert(payload, { onConflict: "user_id,year,month" })
      .select("id,user_id,year,month,label,created_at,updated_at")
      .single();

    if (error) throw error;
    return data as MonthlyBalance;
  };

  const generateEntriesForRule = async (rule: RecurringRule, monthsAhead = 12) => {
    const start = new Date(rule.start_year, rule.start_month - 1, 1);
    const today = new Date();
    const generationStart = start > today ? start : new Date(today.getFullYear(), today.getMonth(), 1);
    const rows = [];

    for (let index = 0; index < monthsAhead; index += 1) {
      const date = new Date(generationStart.getFullYear(), generationStart.getMonth() + index, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      if (!recurringRuleAppliesToMonth(rule, year, month)) continue;
      const balance = await ensureMonthlyBalance(year, month);
      rows.push({
        user_id: user.id,
        monthly_balance_id: balance.id,
        account_id: rule.account_id,
        category_id: rule.category_id,
        entry_type: rule.entry_type,
        status: "planned" as const,
        description: rule.description,
        expected_amount: Number(rule.amount),
        actual_amount: null,
        due_date: dueDateForMonth(rule.day_of_month, year, month),
        paid_date: null,
        source: "recurring" as const,
        recurring_rule_id: rule.id,
        external_id: null,
        notes: rule.notes,
      });
    }

    if (rows.length === 0) return;
    const { error } = await supabase.from("financial_entries").upsert(rows, { onConflict: "recurring_rule_id,monthly_balance_id" });
    if (error) throw error;
  };

  const openNew = (entryType?: "income" | "expense") => {
    setEditingId(null);
    const defaultAccountId = selectedAccountId === "all" ? "" : selectedAccountId;
    setForm({ ...emptyForm, entry_type: entryType ?? "expense", account_id: defaultAccountId });
    setModalOpen(true);
  };

  const openEdit = (rule: RecurringRule) => {
    setEditingId(rule.id);
    setForm({
      entry_type: rule.entry_type,
      description: rule.description,
      amount: String(rule.amount),
      day_of_month: String(rule.day_of_month),
      start_month: monthKey(rule.start_year, rule.start_month),
      end_month: rule.end_year && rule.end_month ? monthKey(rule.end_year, rule.end_month) : "",
      account_id: rule.account_id ?? "",
      category_id: rule.category_id ?? "",
      notes: rule.notes ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const start = parseMonthKey(form.start_month);
      const end = form.end_month ? parseMonthKey(form.end_month) : { year: null, month: null };
      const description = sanitizeText(form.description, DESCRIPTION_MAX_LENGTH);
      if (description.length < 2) throw new Error("Descreva a recorrência com pelo menos 2 caracteres.");
      const amount = parseMoneyAmount(form.amount);
      if (amount === null) throw new Error("Informe um valor válido maior que zero.");
      const dayOfMonth = Number(form.day_of_month);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error("Dia do mês inválido (1 a 31).");
      const payload = {
        user_id: user.id,
        account_id: form.account_id || null,
        category_id: form.category_id || null,
        entry_type: form.entry_type,
        description,
        amount,
        day_of_month: dayOfMonth,
        start_year: start.year,
        start_month: start.month,
        end_year: end.year,
        end_month: end.month,
        is_active: true,
        notes: form.notes.trim() ? sanitizeText(form.notes, NOTES_MAX_LENGTH) : null,
      };

      const result = editingId
        ? await supabase.from("recurring_rules").update(payload).eq("id", editingId).select("id,user_id,account_id,category_id,entry_type,description,amount,day_of_month,start_year,start_month,end_year,end_month,is_active,notes,created_at,updated_at").single()
        : await supabase.from("recurring_rules").insert(payload).select("id,user_id,account_id,category_id,entry_type,description,amount,day_of_month,start_year,start_month,end_year,end_month,is_active,notes,created_at,updated_at").single();

      if (result.error) throw result.error;
      await generateEntriesForRule(result.data as RecurringRule);
      setModalOpen(false);
      await loadData();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "Erro ao salvar recorrência."));
    }

    setSaving(false);
  };

  const toggleActive = async (rule: RecurringRule) => {
    const { error } = await supabase.from("recurring_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) setError(error.message);
    await loadData();
  };

  const regenerateRule = async (rule: RecurringRule) => {
    setSaving(true);
    setError(null);
    try {
      await generateEntriesForRule(rule);
      await loadData();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "Erro ao gerar lançamentos."));
    }
    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHero eyebrow="Automação do Notion" title="Recorrência cria lançamentos mensais." description="Diferente da versão anterior, a regra não fica só como previsão solta: ela gera ganhos/gastos vinculados ao balanço de cada mês.">
            <div className="grid gap-2">
              <Button type="button" onClick={() => openNew("income")}>Nova receita fixa</Button>
              <Button type="button" variant="outline" onClick={() => openNew("expense")}>Nova despesa fixa</Button>
            </div>
        </PageHero>

        <Card>
          <CardHeader>
            <CardTitle>Regras recorrentes</CardTitle>
            <CardDescription>{filteredRules.filter((rule) => rule.is_active).length} regra(s) ativa(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-400">Carregando...</p> : null}
            <div className="grid gap-3">
              {filteredRules.map((rule) => (
                <div key={rule.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 shadow-sm sm:p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-50">{rule.description}</p>
                        <span className={rule.entry_type === "income" ? "rounded-full bg-emerald-400/12 px-2 py-0.5 text-xs text-emerald-200" : "rounded-full bg-rose-400/12 px-2 py-0.5 text-xs text-rose-200"}>{rule.entry_type === "income" ? "Ganho" : "Gasto"}</span>
                        {!rule.is_active ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">inativa</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-slate-400">Todo dia {rule.day_of_month} · início {monthLabel(rule.start_year, rule.start_month)}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">{rule.account_id ? accountById.get(rule.account_id)?.name ?? "Conta" : "Sem conta"} · {rule.category_id ? categoryById.get(rule.category_id)?.name ?? "Categoria" : "Sem categoria"}</p>
                    </div>
                    <div className="grid gap-3 lg:min-w-80">
                      <p className={rule.entry_type === "income" ? "text-xl font-black tracking-[-0.03em] text-emerald-300 lg:text-right" : "text-xl font-black tracking-[-0.03em] text-rose-300 lg:text-right"}>{formatCurrency(Number(rule.amount))}</p>
                      <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:justify-end">
                        <Button type="button" variant="outline" onClick={() => regenerateRule(rule)} disabled={saving}>Gerar 12 meses</Button>
                        <Button type="button" variant="outline" onClick={() => openEdit(rule)}>Editar</Button>
                        <Button type="button" variant="destructive" onClick={() => toggleActive(rule)}>{rule.is_active ? "Pausar" : "Ativar"}</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && filteredRules.length === 0 ? <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm text-cyan-100">Nenhuma regra recorrente cadastrada.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal title={editingId ? "Editar recorrência" : "Nova recorrência"} description="A regra cria automaticamente lançamentos mensais com status previsto." open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {error ? <div className="rounded-xl border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-type">Tipo</Label>
              <select id="entry-type" className="finance-select" value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value as RuleForm["entry_type"], category_id: "" })}>
                <option value="income">Ganho</option>
                <option value="expense">Gasto</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor previsto</Label>
              <Input id="amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="day">Dia do mês</Label>
              <Input id="day" type="number" min="1" max="31" value={form.day_of_month} onChange={(event) => setForm({ ...form, day_of_month: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <MonthPicker id="start-month" label="Início" value={form.start_month} onChange={(value) => setForm({ ...form, start_month: value })} showArrows={false} />
            </div>
            <div className="space-y-2">
              <MonthPicker id="end-month" label="Fim opcional" value={form.end_month || form.start_month} onChange={(value) => setForm({ ...form, end_month: value })} showArrows={false} />
              <button type="button" onClick={() => setForm({ ...form, end_month: "" })} className="text-xs font-semibold text-cyan-200 transition hover:text-cyan-100">Deixar sem data final</button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account">Conta</Label>
              <select id="account" className="finance-select" value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })}>
                <option value="">Sem conta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <select id="category" className="finance-select" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
                <option value="">Sem categoria</option>
                {visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Salvando e gerando..." : "Salvar e gerar lançamentos"}</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
