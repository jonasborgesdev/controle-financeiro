import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { dueDateForMonth, formatCurrency, monthLabel, monthKey, parseMonthKey, recurringRuleAppliesToMonth } from "@/lib/finance";
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
  const visibleCategories = categories.filter((category) => category.type === form.entry_type && category.is_active && category.parent_id === null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [rulesResult, accountsResult, categoriesResult] = await Promise.all([
      supabase.from("recurring_rules").select("*").order("is_active", { ascending: false }).order("description"),
      supabase.from("accounts").select("*").eq("is_active", true).order("name"),
      supabase.from("categories").select("*").order("type").order("name"),
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
      .select("*")
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
        notes: rule.notes,
      });
    }

    if (rows.length === 0) return;
    const { error } = await supabase.from("financial_entries").upsert(rows, { onConflict: "recurring_rule_id,monthly_balance_id" });
    if (error) throw error;
  };

  const openNew = (entryType?: "income" | "expense") => {
    setEditingId(null);
    setForm({ ...emptyForm, entry_type: entryType ?? "expense" });
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
      const payload = {
        user_id: user.id,
        account_id: form.account_id || null,
        category_id: form.category_id || null,
        entry_type: form.entry_type,
        description: form.description.trim(),
        amount: Number(form.amount),
        day_of_month: Number(form.day_of_month),
        start_year: start.year,
        start_month: start.month,
        end_year: end.year,
        end_month: end.month,
        is_active: true,
        notes: form.notes.trim() || null,
      };

      const result = editingId
        ? await supabase.from("recurring_rules").update(payload).eq("id", editingId).select("*").single()
        : await supabase.from("recurring_rules").insert(payload).select("*").single();

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
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-300">Automação do Notion</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-[-0.05em] sm:text-5xl">Recorrência cria lançamentos mensais.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">Diferente da versão anterior, a regra não fica só como previsão solta: ela gera ganhos/gastos vinculados ao balanço de cada mês.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => openNew("income")}>Nova receita fixa</Button>
              <Button type="button" variant="outline" className="bg-white text-cyan-950 hover:bg-cyan-50" onClick={() => openNew("expense")}>Nova despesa fixa</Button>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Regras recorrentes</CardTitle>
            <CardDescription>{rules.filter((rule) => rule.is_active).length} regra(s) ativa(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}
            <div className="grid gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{rule.description}</p>
                        <span className={rule.entry_type === "income" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700" : "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"}>{rule.entry_type === "income" ? "Ganho" : "Gasto"}</span>
                        {!rule.is_active ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">inativa</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">Todo dia {rule.day_of_month} · início {monthLabel(rule.start_year, rule.start_month)} · {rule.account_id ? accountById.get(rule.account_id)?.name ?? "Conta" : "Sem conta"} · {rule.category_id ? categoryById.get(rule.category_id)?.name ?? "Categoria" : "Sem categoria"}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <p className={rule.entry_type === "income" ? "font-bold text-emerald-600" : "font-bold text-red-600"}>{formatCurrency(Number(rule.amount))}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => regenerateRule(rule)} disabled={saving}>Gerar 12 meses</Button>
                        <Button type="button" variant="outline" onClick={() => openEdit(rule)}>Editar</Button>
                        <Button type="button" variant="destructive" onClick={() => toggleActive(rule)}>{rule.is_active ? "Pausar" : "Ativar"}</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && rules.length === 0 ? <p className="text-sm text-slate-500">Nenhuma regra recorrente cadastrada.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal title={editingId ? "Editar recorrência" : "Nova recorrência"} description="A regra cria automaticamente lançamentos mensais com status previsto." open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {error ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-type">Tipo</Label>
              <select id="entry-type" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value as RuleForm["entry_type"], category_id: "" })}>
                <option value="income">Ganho</option>
                <option value="expense">Gasto</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor previsto</Label>
              <Input id="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
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
              <Label htmlFor="start-month">Início</Label>
              <Input id="start-month" type="month" value={form.start_month} onChange={(event) => setForm({ ...form, start_month: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-month">Fim opcional</Label>
              <Input id="end-month" type="month" value={form.end_month} onChange={(event) => setForm({ ...form, end_month: event.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account">Conta</Label>
              <select id="account" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })}>
                <option value="">Sem conta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <select id="category" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
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
