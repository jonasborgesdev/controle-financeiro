import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { compactEntryDateLabel, entryDisplayAmount, entryEffectiveDate, entryStatusPatch, formatCurrency, groupEntriesByEffectiveDate, isFinanceClassification, monthLabel, parseMonthKey, summarizeEntries } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, Financing, MonthlyBalance } from "@/types/database";

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

const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,financing_id,installment_year,installment_month,notes,created_at,updated_at";
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
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = categories.filter((category) => category.type === form.entry_type && isFinanceClassification(category, user.id));
  const summary = summarizeEntries(entries);
  const groupedEntries = groupEntriesByEffectiveDate(entries);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const { year, month } = parseMonthKey(selectedMonth);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    try {
      const [entriesResult, balancesResult, accountsResult, categoriesResult] = await Promise.all([
        supabase.from("financial_entries").select(entryColumns),
        supabase.from("monthly_balances").select(balanceColumns).eq("year", year).eq("month", month),
        supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
        supabase.from("categories").select(categoryColumns).order("type").order("name"),
      ]);

      if (entriesResult.error) setError(entriesResult.error.message);
      if (balancesResult.error) setError(balancesResult.error.message);
      if (accountsResult.error) setError(accountsResult.error.message);
      if (categoriesResult.error) setError(categoriesResult.error.message);
      setEntries((entriesResult.data ?? []).filter((entry) => {
        const effectiveDate = entryEffectiveDate(entry);
        return effectiveDate >= startDate && effectiveDate <= endDate;
      }));
      setBalances(balancesResult.data ?? []);
      setAccounts(accountsResult.data ?? []);
      setCategories(categoriesResult.data ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao carregar lançamentos.");
    }
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
    setOpenActionMenuId(null);
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
      const effectiveDate = form.status === "paid" ? form.paid_date || form.due_date : form.due_date;
      const monthlyBalance = await ensureMonthlyBalance(effectiveDate);
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
        paid_date: form.status === "paid" ? effectiveDate : null,
        source: "manual" as const,
        recurring_rule_id: null,
        external_id: null,
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
    setOpenActionMenuId(null);
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;
    const { error } = await supabase.from("financial_entries").delete().eq("id", entry.id);
    if (error) setError(error.message);
    await loadData();
  };

  const toggleStatus = async (entry: FinancialEntry) => {
    setOpenActionMenuId(null);
    setSaving(true);
    setError(null);
    const statusPatch = entryStatusPatch(entry, today);
    const effectiveDate = statusPatch.status === "paid" ? statusPatch.paid_date : entry.due_date;
    const monthlyBalance = await ensureMonthlyBalance(effectiveDate);
    const payload = { ...statusPatch, monthly_balance_id: monthlyBalance.id };
    const { error: updateError } = await supabase.from("financial_entries").update(payload).eq("id", entry.id);
    if (updateError) setError(updateError.message);
    if (!updateError && entry.financing_id) {
      const { data: financing } = await supabase
        .from("financings")
        .select("id,user_id,account_id,category_id,name,original_amount,installment_amount,total_installments,paid_installments,due_day,start_date,status,notes,created_at,updated_at")
        .eq("id", entry.financing_id)
        .single();
      if (financing) {
        const current = financing as Financing;
        const paidInstallments = statusPatch.status === "paid"
          ? Math.min(current.total_installments, current.paid_installments + 1)
          : Math.max(0, current.paid_installments - 1);
        const status = paidInstallments >= current.total_installments ? "finished" : current.status === "finished" ? "active" : current.status;
        const { error: financingError } = await supabase.from("financings").update({ paid_installments: paidInstallments, status }).eq("id", current.id);
        if (financingError) setError(financingError.message);
      }
    }
    await loadData();
    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero eyebrow="Ganhos e gastos" title="Lançamentos por competência." description="Cada item tem valor previsto, status e valor real, igual ao seu controle no Notion.">
          <div className="grid gap-4">
            <MonthPicker id="entries-month" label="Mês de competência" value={selectedMonth} onChange={setSelectedMonth} />
            <Button type="button" onClick={() => openNewEntry()}>Novo lançamento</Button>
          </div>
        </PageHero>

        <SummaryCharts summary={summary} />

        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Lançamentos de {monthLabel(parseMonthKey(selectedMonth).year, parseMonthKey(selectedMonth).month)}</CardTitle>
            <CardDescription>{entries.length} ganho(s)/gasto(s) no mês selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-400">Carregando lançamentos...</p> : null}
            <div className="grid gap-4" data-testid="compact-entry-list">
              {groupedEntries.map((group) => (
                <EntryListGroup
                  key={group.date}
                  date={group.date}
                  entries={group.items}
                  accountById={accountById}
                  categoryById={categoryById}
                  saving={saving}
                  openActionMenuId={openActionMenuId}
                  onToggleActionMenu={(entryId) => setOpenActionMenuId((current) => current === entryId ? null : entryId)}
                  onToggleStatus={toggleStatus}
                  onEdit={openEdit}
                  onDelete={deleteEntry}
                />
              ))}
              {!loading && entries.length === 0 ? <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm text-cyan-100">Você ainda não lançou nada neste mês. Use o botão de novo lançamento para começar.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal title={editingId ? "Editar lançamento" : "Novo lançamento"} description="Cadastre ganhos e gastos com valor previsto e, quando acontecer, valor real." open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-type">Tipo</Label>
              <select id="entry-type" className="finance-select" value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value as EntryForm["entry_type"], category_id: "" })}>
                <option value="income">Ganho</option>
                <option value="expense">Gasto</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" className="finance-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EntryForm["status"] })}>
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
              <Input id="expected" type="number" min="0" step="0.01" inputMode="decimal" value={form.expected_amount} onChange={(event) => setForm({ ...form, expected_amount: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actual">Valor real</Label>
              <Input id="actual" type="number" min="0" step="0.01" inputMode="decimal" value={form.actual_amount} onChange={(event) => setForm({ ...form, actual_amount: event.target.value })} disabled={form.status !== "paid"} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <DatePicker id="due" label="Data prevista" value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} required />
            </div>
            <div className="space-y-2">
              <DatePicker id="paid-date" label="Data realizada" value={form.paid_date} onChange={(value) => setForm({ ...form, paid_date: value })} disabled={form.status !== "paid"} />
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
    income: { card: "border-emerald-300/18 bg-emerald-400/[0.08]", text: "text-emerald-200", muted: "text-emerald-300", track: "bg-emerald-400/15", fill: "bg-emerald-400" },
    expense: { card: "border-rose-300/18 bg-rose-400/[0.08]", text: "text-rose-200", muted: "text-rose-300", track: "bg-rose-400/15", fill: "bg-rose-400" },
    danger: { card: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08]", text: "text-[#fff3c4]", muted: "text-[#f5c76b]", track: "bg-[#f5c76b]/15", fill: "bg-rose-400" },
  }[tone];
  const plannedWidth = planned > 0 ? 100 : 0;
  const actualWidth = planned > 0 ? Math.min(100, Math.max((actual / planned) * 100, actual > 0 ? 8 : 0)) : actual > 0 ? 100 : 0;

  return (
    <div className={`rounded-2xl border p-4 shadow-lg shadow-slate-950/15 ${palette.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${palette.muted}`}>{title}</p>
          <p className={`mt-2 text-xl font-black tracking-[-0.04em] ${palette.text}`}>{formatCurrency(actual)}</p>
        </div>
        <p className={`text-right text-xs ${palette.muted}`}>de {formatCurrency(planned)}</p>
      </div>
      <div className="mt-4 h-9 overflow-hidden rounded-xl bg-white/10 p-1">
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
  const plannedTone = planned < 0 ? "text-rose-300" : "text-cyan-200";
  const actualFill = actual < 0 ? "bg-rose-400" : "bg-cyan-300";
  const plannedWidth = Math.max((Math.abs(planned) / max) * 100, planned !== 0 ? 8 : 0);
  const actualWidth = Math.max((Math.abs(actual) / max) * 100, actual !== 0 ? 8 : 0);

  return (
    <div className="rounded-2xl border border-cyan-300/18 bg-cyan-400/[0.08] p-4 shadow-lg shadow-slate-950/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-cyan-200">Saldo previsto</p>
          <p className={`mt-2 text-xl font-black tracking-[-0.04em] ${plannedTone}`}>{formatCurrency(planned)}</p>
        </div>
        <p className="text-right text-xs text-slate-400">realizado {formatCurrency(actual)}</p>
      </div>
      <div className="mt-4 grid gap-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Previsto</span><span>{formatCurrency(planned)}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-slate-400" style={{ width: `${plannedWidth}%` }} /></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Realizado</span><span>{formatCurrency(actual)}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${actualFill}`} style={{ width: `${actualWidth}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function EntryListGroup({
  date,
  entries,
  accountById,
  categoryById,
  saving,
  openActionMenuId,
  onToggleActionMenu,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  date: string;
  entries: FinancialEntry[];
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  saving: boolean;
  openActionMenuId: string | null;
  onToggleActionMenu: (entryId: string) => void;
  onToggleStatus: (entry: FinancialEntry) => void;
  onEdit: (entry: FinancialEntry) => void;
  onDelete: (entry: FinancialEntry) => void;
}) {
  return (
    <section className="grid gap-2" data-testid="entry-date-group">
      <h3 className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{compactEntryDateLabel(date, today)}</h3>
      <div className="overflow-visible rounded-2xl border border-white/10 bg-slate-950/25 shadow-lg shadow-slate-950/15">
        {entries.map((entry) => (
          <EntryListItem
            key={entry.id}
            entry={entry}
            accountById={accountById}
            categoryById={categoryById}
            saving={saving}
            actionMenuOpen={openActionMenuId === entry.id}
            onToggleActionMenu={() => onToggleActionMenu(entry.id)}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function EntryListItem({
  entry,
  accountById,
  categoryById,
  saving,
  actionMenuOpen,
  onToggleActionMenu,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  entry: FinancialEntry;
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  saving: boolean;
  actionMenuOpen: boolean;
  onToggleActionMenu: () => void;
  onToggleStatus: (entry: FinancialEntry) => void;
  onEdit: (entry: FinancialEntry) => void;
  onDelete: (entry: FinancialEntry) => void;
}) {
  const accountName = entry.account_id ? accountById.get(entry.account_id)?.name ?? "Conta" : "Sem conta";
  const categoryName = entry.category_id ? categoryById.get(entry.category_id)?.name ?? "Classificação" : "Sem classificação";
  const isIncome = entry.entry_type === "income";
  const amount = entryDisplayAmount(entry);
  const isPaid = entry.status === "paid";
  const statusClassName = isPaid ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/15" : "bg-[#f5c76b]/10 text-[#f5c76b] ring-1 ring-[#f5c76b]/15";
  const valueClassName = isIncome ? "text-emerald-300" : "text-rose-300";
  const rowToneClassName = isIncome
    ? isPaid ? "bg-emerald-400/[0.055]" : "bg-emerald-400/[0.025]"
    : isPaid ? "bg-rose-400/[0.055]" : "bg-rose-400/[0.025]";
  const accentBarClassName = isIncome
    ? isPaid ? "bg-emerald-300/80" : "bg-emerald-300/40"
    : isPaid ? "bg-rose-300/80" : "bg-rose-300/40";
  const checkboxClassName = isPaid ? "accent-emerald-400" : "accent-[#f5c76b]";

  return (
    <div className={`group relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-1.5 border-b border-b-white/8 px-2 py-2.5 pl-3.5 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 sm:min-h-[3.75rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:gap-3 sm:px-3 sm:pl-4 ${rowToneClassName}`} data-testid="entry-list-item">
      <span aria-hidden="true" className={`absolute top-2.5 bottom-2.5 left-1.5 w-1 rounded-full ${accentBarClassName}`} />
      <div className="col-start-1 row-start-1 row-span-2 flex items-center justify-center sm:row-span-1">
        <input
          type="checkbox"
          checked={entry.status === "paid"}
          disabled={saving}
          onChange={() => onToggleStatus(entry)}
          aria-label={entry.status === "paid" ? `Voltar ${entry.description} para previsto` : `Marcar ${entry.description} como realizado`}
          className={`size-5 rounded-md border-white/20 bg-slate-950 text-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${checkboxClassName}`}
        />
      </div>
      <button type="button" onClick={() => onEdit(entry)} className="col-start-2 row-start-1 row-span-2 min-w-0 text-left focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:row-span-1">
        <p className="break-words text-[0.85rem] font-semibold leading-5 text-slate-50 line-clamp-2 sm:text-[0.95rem]">{entry.description}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[0.7rem] leading-4 text-slate-400 sm:text-xs">
          <span className="min-w-0 flex-1 truncate">{accountName} · {categoryName}</span>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold sm:px-2 sm:text-[0.68rem] ${statusClassName}`}>{statusLabel[entry.status]}</span>
          <span className={`shrink-0 text-xs font-black tracking-[-0.03em] sm:hidden ${valueClassName}`}>{isIncome ? "+" : "-"}{formatCurrency(amount)}</span>
        </div>
      </button>
      <div className="hidden min-w-28 text-right sm:col-start-3 sm:row-start-1 sm:block">
        <p className={`text-sm font-black tracking-[-0.03em] ${valueClassName}`}>{isIncome ? "+" : "-"}{formatCurrency(amount)}</p>
      </div>
      <div className="col-start-3 row-start-1 row-span-2 flex items-center sm:col-start-4 sm:row-span-1">
        <EntryActionsMenu entry={entry} open={actionMenuOpen} onToggle={onToggleActionMenu} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function EntryActionsMenu({ entry, open, onToggle, onEdit, onDelete }: { entry: FinancialEntry; open: boolean; onToggle: () => void; onEdit: (entry: FinancialEntry) => void; onDelete: (entry: FinancialEntry) => void }) {
  return (
    <div className="relative flex justify-end">
      <button type="button" className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:size-9" aria-label={`Ações do lançamento ${entry.description}`} aria-expanded={open} onClick={onToggle}>
        <MoreVertical className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 grid min-w-36 overflow-hidden rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl shadow-slate-950/50">
          <button type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" onClick={() => onEdit(entry)}>
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </button>
          <button type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300" onClick={() => onDelete(entry)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir
          </button>
        </div>
      ) : null}
    </div>
  );
}
