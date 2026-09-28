import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const { year, month } = parseMonthKey(selectedMonth);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const [entriesResult, balancesResult, accountsResult, categoriesResult] = await Promise.all([
      supabase.from("financial_entries").select("*").gte("due_date", startDate).lte("due_date", endDate).order("due_date"),
      supabase.from("monthly_balances").select("*").eq("year", year).eq("month", month),
      supabase.from("accounts").select("*").eq("is_active", true).order("name"),
      supabase.from("categories").select("*").order("type").order("name"),
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

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-300">Ganhos e gastos</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-5xl">Lançamentos por competência.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">Cada item tem valor previsto, status e valor real, igual ao seu controle no Notion.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-11 border-white/20 bg-white text-slate-950" />
              <Button type="button" onClick={() => openNewEntry("income")}>Novo ganho</Button>
              <Button type="button" variant="outline" className="bg-white text-cyan-950 hover:bg-cyan-50" onClick={() => openNewEntry("expense")}>Novo gasto</Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700">Ganhos previstos / realizados</p>
            <p className="text-xl font-bold text-emerald-900">{formatCurrency(summary.expectedIncome)} / {formatCurrency(summary.actualIncome)}</p>
          </div>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-sm text-red-700">Gastos previstos / realizados</p>
            <p className="text-xl font-bold text-red-900">{formatCurrency(summary.expectedExpenses)} / {formatCurrency(summary.actualExpenses)}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-sm text-slate-600">Saldo previsto / realizado</p>
            <p className="text-xl font-bold text-slate-950">{formatCurrency(summary.expectedBalance)} / {formatCurrency(summary.actualBalance)}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lançamentos de {monthLabel(parseMonthKey(selectedMonth).year, parseMonthKey(selectedMonth).month)}</CardTitle>
            <CardDescription>{entries.length} ganho(s)/gasto(s) no mês selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}
            <div className="grid gap-3">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{entry.description}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{statusLabel[entry.status]}</span>
                        <span className={entry.entry_type === "income" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700" : "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"}>{entry.entry_type === "income" ? "Ganho" : "Gasto"}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountById.get(entry.account_id)?.name ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryById.get(entry.category_id)?.name ?? "Categoria" : "Sem categoria"}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 lg:justify-end">
                      <div className="text-right">
                        <p className="font-bold text-slate-950">Previsto: {formatCurrency(Number(entry.expected_amount))}</p>
                        <p className="text-sm text-slate-500">Real: {entry.status === "paid" ? formatCurrency(Number(entry.actual_amount ?? entry.expected_amount)) : "-"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => openEdit(entry)}>Editar</Button>
                        <Button type="button" variant="destructive" onClick={() => deleteEntry(entry)}>Excluir</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
