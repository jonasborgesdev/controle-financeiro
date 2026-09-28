import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, isFinanceClassification, monthLabel, parseMonthKey, summarizeEntries } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, MonthlyBalance } from "@/types/database";

type EntryForm = {
  entry_type: "income" | "expense";
  status: "planned" | "paid";
  description: string;
  expected_amount: string;
  actual_amount: string;
  due_date: string;
  paid_date: string;
  account_id: string;
  category_id: string;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

const emptyForm: EntryForm = {
  entry_type: "expense",
  status: "planned",
  description: "",
  expected_amount: "",
  actual_amount: "",
  due_date: today,
  paid_date: "",
  account_id: "",
  category_id: "",
  notes: "",
};

const statusLabel = {
  planned: "Previsto",
  paid: "Realizado",
} satisfies Record<EntryForm["status"], string>;

const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,notes,created_at,updated_at";
const balanceColumns = "id,user_id,year,month,label,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";

export const Route = createFileRoute("/transacoes")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: EntriesPage,
});

function EntriesPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [balances, setBalances] = useState<MonthlyBalance[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = categories.filter((category) => category.type === form.entry_type && isFinanceClassification(category, user.id));
  const summary = summarizeEntries(entries);
  const incomeEntries = entries.filter((entry) => entry.entry_type === "income");
  const expenseEntries = entries.filter((entry) => entry.entry_type === "expense");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const { year, month } = parseMonthKey(selectedMonth);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const [entriesResult, balancesResult, accountsResult, categoriesResult] = await Promise.all([
      supabase.from("financial_entries").select(entryColumns).gte("due_date", startDate).lte("due_date", endDate).order("due_date"),
      supabase.from("monthly_balances").select(balanceColumns).eq("year", year).eq("month", month),
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).order("type").order("name"),
    ]);

    if (entriesResult.error) setError(entriesResult.error.message);
    if (balancesResult.error) setError(balancesResult.error.message);
    if (accountsResult.error) setError(accountsResult.error.message);
    if (categoriesResult.error) setError(categoriesResult.error.message);
    setEntries(entriesResult.data ?? []);
    setBalances(balancesResult.data ?? []);
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth]);

  const ensureMonthlyBalance = async (date: string) => {
    const { year, month } = parseMonthKey(date.slice(0, 7));
    const existing = balances.find((balance) => balance.year === year && balance.month === month);
    if (existing) return existing;

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

  const openNewEntry = (entryType?: "income" | "expense") => {
    setEditingId(null);
    setForm({ ...emptyForm, entry_type: entryType ?? "expense", due_date: `${selectedMonth}-${String(new Date().getDate()).padStart(2, "0")}` });
    setModalOpen(true);
  };

  const openEdit = (entry: FinancialEntry) => {
    setEditingId(entry.id);
    setForm({
      entry_type: entry.entry_type,
      status: entry.status,
      description: entry.description,
      expected_amount: String(entry.expected_amount),
      actual_amount: entry.actual_amount == null ? "" : String(entry.actual_amount),
      due_date: entry.due_date,
      paid_date: entry.paid_date ?? "",
      account_id: entry.account_id ?? "",
      category_id: entry.category_id ?? "",
      notes: entry.notes ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const monthlyBalance = await ensureMonthlyBalance(form.due_date);
      const expectedAmount = Number(form.expected_amount || 0);
      const actualAmount = form.status === "paid" ? Number(form.actual_amount || form.expected_amount || 0) : null;
      const payload = {
        user_id: user.id,
        monthly_balance_id: monthlyBalance.id,
        account_id: form.account_id || null,
        category_id: form.category_id || null,
        entry_type: form.entry_type,
        status: form.status,
        description: form.description.trim(),
        expected_amount: expectedAmount,
        actual_amount: actualAmount,
        due_date: form.due_date,
        paid_date: form.status === "paid" ? form.paid_date || form.due_date : null,
        source: "manual" as const,
        recurring_rule_id: null,
        notes: form.notes.trim() || null,
      };

      const result = editingId
        ? await supabase.from("financial_entries").update(payload).eq("id", editingId)
        : await supabase.from("financial_entries").insert(payload);

      if (result.error) throw result.error;
      setModalOpen(false);
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao salvar lançamento.");
    }

    setSaving(false);
  };

  const deleteEntry = async (entry: FinancialEntry) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;
    const { error } = await supabase.from("financial_entries").delete().eq("id", entry.id);
    if (error) setError(error.message);
    await loadData();
  };

  const toggleStatus = async (entry: FinancialEntry) => {
    setSaving(true);
    setError(null);
    const nextStatus = entry.status === "paid" ? "planned" : "paid";
    const payload = nextStatus === "paid"
      ? { status: nextStatus, actual_amount: Number(entry.actual_amount ?? entry.expected_amount), paid_date: today }
      : { status: nextStatus, actual_amount: null, paid_date: null };
    const { error: updateError } = await supabase.from("financial_entries").update(payload).eq("id", entry.id);
    if (updateError) setError(updateError.message);
    await loadData();
    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-300">Ganhos e gastos</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-5xl">Lançamentos por competência.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">Cada item tem valor previsto, status e valor real, igual ao seu controle no Notion.</p>
            </div>
            <div className="rounded-[1.5rem] bg-white p-3 text-slate-950 shadow-2xl lg:min-w-80">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-1">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="entries-month">Mês de competência</label>
                  <Input id="entries-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-11 bg-slate-50 text-slate-950" />
                </div>
                <Button type="button" className="h-11 sm:self-end" onClick={() => openNewEntry()}>Novo lançamento</Button>
              </div>
            </div>
          </div>
        </section>

        <SummaryCharts summary={summary} />

        <Card>
          <CardHeader>
            <CardTitle>Lançamentos de {monthLabel(parseMonthKey(selectedMonth).year, parseMonthKey(selectedMonth).month)}</CardTitle>
            <CardDescription>{entries.length} ganho(s)/gasto(s) no mês selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}
            <div className="grid gap-5">
              <EntryGroup
                title="Ganhos"
                description={`${incomeEntries.length} entrada(s) no mês`}
                entries={incomeEntries}
                emptyText="Nenhum ganho neste mês."
                tone="income"
                accountById={accountById}
                categoryById={categoryById}
                saving={saving}
                onToggleStatus={toggleStatus}
                onEdit={openEdit}
                onDelete={deleteEntry}
              />
              <EntryGroup
                title="Gastos"
                description={`${expenseEntries.length} saída(s) no mês`}
                entries={expenseEntries}
                emptyText="Nenhum gasto neste mês."
                tone="expense"
                accountById={accountById}
                categoryById={categoryById}
                saving={saving}
                onToggleStatus={toggleStatus}
                onEdit={openEdit}
                onDelete={deleteEntry}
              />
              {!loading && entries.length === 0 ? <p className="text-sm text-slate-500">Nenhum lançamento neste mês.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal title={editingId ? "Editar lançamento" : "Novo lançamento"} description="Cadastre ganhos e gastos com valor previsto e, quando acontecer, valor real." open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-type">Tipo</Label>
              <select id="entry-type" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value as EntryForm["entry_type"], category_id: "" })}>
                <option value="income">Ganho</option>
                <option value="expense">Gasto</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EntryForm["status"] })}>
                <option value="planned">Previsto</option>
                <option value="paid">Realizado</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expected">Valor previsto</Label>
              <Input id="expected" type="number" min="0" step="0.01" value={form.expected_amount} onChange={(event) => setForm({ ...form, expected_amount: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actual">Valor real</Label>
              <Input id="actual" type="number" min="0" step="0.01" value={form.actual_amount} onChange={(event) => setForm({ ...form, actual_amount: event.target.value })} disabled={form.status !== "paid"} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="due">Data prevista</Label>
              <Input id="due" type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid-date">Data realizada</Label>
              <Input id="paid-date" type="date" value={form.paid_date} onChange={(event) => setForm({ ...form, paid_date: event.target.value })} disabled={form.status !== "paid"} />
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
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar lançamento"}</Button>
        </form>
      </Modal>
    </AppShell>
  );
}

function SummaryCharts({ summary }: { summary: ReturnType<typeof summarizeEntries> }) {
  const balanceMax = Math.max(Math.abs(summary.expectedBalance), Math.abs(summary.actualBalance), 1);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <SummaryBarCard
        title="Ganhos"
        plannedLabel="Previsto"
        actualLabel="Realizado"
        planned={summary.expectedIncome}
        actual={summary.actualIncome}
        tone="income"
      />
      <SummaryBarCard
        title="Gastos"
        plannedLabel="Previsto"
        actualLabel="Realizado"
        planned={summary.expectedExpenses}
        actual={summary.actualExpenses}
        tone={summary.actualExpenses > summary.expectedExpenses ? "danger" : "expense"}
      />
      <BalanceBarCard planned={summary.expectedBalance} actual={summary.actualBalance} max={balanceMax} />
    </div>
  );
}

function SummaryBarCard({ title, plannedLabel, actualLabel, planned, actual, tone }: { title: string; plannedLabel: string; actualLabel: string; planned: number; actual: number; tone: "income" | "expense" | "danger" }) {
  const palette = {
    income: { card: "bg-emerald-50", text: "text-emerald-900", muted: "text-emerald-700", track: "bg-emerald-200", fill: "bg-emerald-600" },
    expense: { card: "bg-red-50", text: "text-red-900", muted: "text-red-700", track: "bg-red-200", fill: "bg-red-600" },
    danger: { card: "bg-amber-50", text: "text-amber-900", muted: "text-amber-700", track: "bg-amber-200", fill: "bg-red-600" },
  }[tone];
  const plannedWidth = planned > 0 ? 100 : 0;
  const actualWidth = planned > 0 ? Math.min(100, Math.max((actual / planned) * 100, actual > 0 ? 8 : 0)) : actual > 0 ? 100 : 0;

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${palette.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${palette.muted}`}>{title}</p>
          <p className={`mt-2 text-xl font-black tracking-[-0.04em] ${palette.text}`}>{formatCurrency(actual)}</p>
        </div>
        <p className={`text-right text-xs ${palette.muted}`}>de {formatCurrency(planned)}</p>
      </div>
      <div className="mt-4 h-9 overflow-hidden rounded-xl bg-white/70 p-1">
        <div className={`relative h-full rounded-lg ${palette.track}`} style={{ width: `${plannedWidth}%` }}>
          <div className={`absolute inset-y-0 left-0 rounded-lg ${palette.fill}`} style={{ width: `${actualWidth}%` }} />
        </div>
      </div>
      <div className={`mt-3 flex justify-between text-xs ${palette.muted}`}>
        <span>{plannedLabel}: {formatCurrency(planned)}</span>
        <span>{actualLabel}: {formatCurrency(actual)}</span>
      </div>
    </div>
  );
}

function BalanceBarCard({ planned, actual, max }: { planned: number; actual: number; max: number }) {
  const actualTone = actual < 0 ? "text-red-700" : "text-cyan-900";
  const actualFill = actual < 0 ? "bg-red-600" : "bg-cyan-700";
  const plannedWidth = Math.max((Math.abs(planned) / max) * 100, planned !== 0 ? 8 : 0);
  const actualWidth = Math.max((Math.abs(actual) / max) * 100, actual !== 0 ? 8 : 0);

  return (
    <div className="rounded-2xl bg-slate-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">Saldo</p>
          <p className={`mt-2 text-xl font-black tracking-[-0.04em] ${actualTone}`}>{formatCurrency(actual)}</p>
        </div>
        <p className="text-right text-xs text-slate-500">previsto {formatCurrency(planned)}</p>
      </div>
      <div className="mt-4 grid gap-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Previsto</span><span>{formatCurrency(planned)}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-slate-500" style={{ width: `${plannedWidth}%` }} /></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Realizado</span><span>{formatCurrency(actual)}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${actualFill}`} style={{ width: `${actualWidth}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function EntryGroup({
  title,
  description,
  entries,
  emptyText,
  tone,
  accountById,
  categoryById,
  saving,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  entries: FinancialEntry[];
  emptyText: string;
  tone: "income" | "expense";
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  saving: boolean;
  onToggleStatus: (entry: FinancialEntry) => void;
  onEdit: (entry: FinancialEntry) => void;
  onDelete: (entry: FinancialEntry) => void;
}) {
  const totalExpected = entries.reduce((total, entry) => total + Number(entry.expected_amount), 0);
  const totalActual = entries.filter((entry) => entry.status === "paid").reduce((total, entry) => total + Number(entry.actual_amount ?? entry.expected_amount), 0);
  const wrapperClassName = tone === "income" ? "border-emerald-100 bg-emerald-50/50" : "border-red-100 bg-red-50/50";
  const valueClassName = tone === "income" ? "text-emerald-700" : "text-red-700";

  return (
    <section className={`rounded-2xl border p-3 ${wrapperClassName}`}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h3 className="font-bold text-slate-950">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="text-right">
          <p className={`font-black ${valueClassName}`}>{formatCurrency(totalActual)}</p>
          <p className="text-xs text-slate-500">de {formatCurrency(totalExpected)}</p>
        </div>
      </div>
      <div className="grid gap-3">
        {entries.map((entry) => (
          <EntryListItem
            key={entry.id}
            entry={entry}
            tone={tone}
            accountById={accountById}
            categoryById={categoryById}
            saving={saving}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {entries.length === 0 ? <p className="rounded-xl bg-white/70 p-3 text-sm text-slate-500">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function EntryListItem({
  entry,
  tone,
  accountById,
  categoryById,
  saving,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  entry: FinancialEntry;
  tone: "income" | "expense";
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  saving: boolean;
  onToggleStatus: (entry: FinancialEntry) => void;
  onEdit: (entry: FinancialEntry) => void;
  onDelete: (entry: FinancialEntry) => void;
}) {
  const paidTone = tone === "income" ? "emerald" : "red";
  const statusClassName = entry.status === "paid"
    ? paidTone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
    : "bg-amber-100 text-amber-700";
  const typeClassName = tone === "income" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const itemClassName = entry.status === "paid"
    ? paidTone === "emerald" ? "border-emerald-200 bg-emerald-50/60 shadow-emerald-950/5" : "border-red-200 bg-red-50/60 shadow-red-950/5"
    : "border-white bg-white shadow-slate-950/5";
  const statusButtonClassName = entry.status === "paid"
    ? paidTone === "emerald"
      ? "shrink-0 border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 sm:min-w-36"
      : "shrink-0 border-red-200 bg-red-100 text-red-800 hover:bg-red-200 sm:min-w-36"
    : "shrink-0 sm:min-w-36";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${itemClassName}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={() => onToggleStatus(entry)} disabled={saving} className={statusButtonClassName}>
              {entry.status === "paid" ? "Voltar previsto" : "Marcar realizado"}
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950">{entry.description}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusClassName}`}>{statusLabel[entry.status]}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${typeClassName}`}>{entry.entry_type === "income" ? "Ganho" : "Gasto"}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountById.get(entry.account_id)?.name ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryById.get(entry.category_id)?.name ?? "Categoria" : "Sem categoria"}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center xl:min-w-[20rem]">
          <div className="sm:text-right">
            <p className="font-bold text-slate-950">Previsto: {formatCurrency(Number(entry.expected_amount))}</p>
            <p className="text-sm text-slate-500">Real: {entry.status === "paid" ? formatCurrency(Number(entry.actual_amount ?? entry.expected_amount)) : "-"}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="icon" aria-label={`Editar ${entry.description}`} onClick={() => onEdit(entry)} className="relative group/edit">
              <Pencil className="size-4" aria-hidden="true" />
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-950 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100">Editar</span>
            </Button>
            <Button type="button" variant="destructive" size="icon" aria-label={`Excluir ${entry.description}`} onClick={() => onDelete(entry)} className="relative group/delete">
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-950 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover/delete:opacity-100 group-focus-visible/delete:opacity-100">Excluir</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
