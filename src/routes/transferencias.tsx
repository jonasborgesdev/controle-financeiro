import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { entryEffectiveDate, entryStatusPatch, formatCurrency, monthLabel, parseMonthKey } from "@/lib/finance";
import { DESCRIPTION_MAX_LENGTH, sanitizeText } from "@/lib/security";
import { TRANSFER_CATEGORY_NAME, buildTransferPair, defaultTransferDescription, findTransferPair, splitEntries, summarizeInternalMovements, tryAcquireTransferLock, validateTransferInput, type TransferStatus } from "@/lib/transfers";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, MonthlyBalance } from "@/types/database";

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,transfer_group_id,financing_id,installment_year,installment_month,notes,created_at,updated_at";
const balanceColumns = "id,user_id,year,month,label,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";

type TransferForm = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  description: string;
  descriptionTouched: boolean;
  status: TransferStatus;
};

const emptyForm: TransferForm = {
  fromAccountId: "",
  toAccountId: "",
  amount: "",
  date: today,
  description: "",
  descriptionTouched: false,
  status: "paid",
};

export const Route = createFileRoute("/transferencias")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: TransfersPage,
});

function TransfersPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [balances, setBalances] = useState<MonthlyBalance[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<TransferForm>(emptyForm);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const { internal } = useMemo(() => splitEntries(entries, categories), [entries, categories]);
  const groups = useMemo(() => groupPairs(internal), [internal]);
  const movementTotals = useMemo(() => summarizeInternalMovements(internal), [internal]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const { year, month } = parseMonthKey(selectedMonth);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    try {
      const [entriesResult, balancesResult, accountsResult, categoriesResult] = await Promise.all([
        supabase.from("financial_entries").select(entryColumns)
          .eq("user_id", user.id)
          .or(`and(due_date.gte.${startDate},due_date.lte.${endDate}),and(paid_date.gte.${startDate},paid_date.lte.${endDate})`)
          .order("due_date", { ascending: false })
          .limit(1000),
        supabase.from("monthly_balances").select(balanceColumns).eq("year", year).eq("month", month),
        supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
        supabase.from("categories").select(categoryColumns).order("type").order("name"),
      ]);

      if (entriesResult.error) setError(entriesResult.error.message);
      if (balancesResult.error) setError(balancesResult.error.message);
      if (accountsResult.error) setError(accountsResult.error.message);
      if (categoriesResult.error) setError(categoriesResult.error.message);
      setEntries(((entriesResult.data ?? []) as FinancialEntry[]).filter((entry) => {
        const effectiveDate = entryEffectiveDate(entry);
        return effectiveDate >= startDate && effectiveDate <= endDate;
      }));
      setBalances(balancesResult.data ?? []);
      setAccounts(accountsResult.data ?? []);
      setCategories(categoriesResult.data ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao carregar transferências.");
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

    const { data, error } = await supabase
      .from("monthly_balances")
      .upsert({ user_id: user.id, year, month, label: monthLabel(year, month) }, { onConflict: "user_id,year,month" })
      .select(balanceColumns)
      .single();

    if (error) throw error;
    return data as MonthlyBalance;
  };

  const transferCategoryId = () => {
    const global = categories.find((category) => category.name === TRANSFER_CATEGORY_NAME && category.user_id === null);
    if (global) return global.id;
    return categories.find((category) => category.name === TRANSFER_CATEGORY_NAME)?.id ?? null;
  };

  const suggestDescription = (fromId: string, toId: string) => {
    const origin = fromId ? accountById.get(fromId)?.name ?? "" : "";
    const destination = toId ? accountById.get(toId)?.name ?? "" : "";
    if (!origin || !destination) return "";
    return defaultTransferDescription(origin, destination);
  };

  const openNewTransfer = () => {
    setEditingGroupId(null);
    setForm({ ...emptyForm, date: `${selectedMonth}-${String(new Date().getDate()).padStart(2, "0")}` });
    setModalOpen(true);
  };

  const openEditPair = (groupId: string) => {
    const pair = findTransferPair(entries, groupId);
    const expenseLeg = pair.find((entry) => entry.entry_type === "expense") ?? pair[0];
    if (!expenseLeg) return;
    const incomeLeg = pair.find((entry) => entry.entry_type === "income");
    setEditingGroupId(groupId);
    setForm({
      fromAccountId: expenseLeg.account_id ?? "",
      toAccountId: incomeLeg?.account_id ?? "",
      amount: String(expenseLeg.expected_amount),
      date: expenseLeg.due_date,
      description: expenseLeg.description,
      descriptionTouched: true,
      status: expenseLeg.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const validated = validateTransferInput({
        fromAccountId: form.fromAccountId,
        toAccountId: form.toAccountId,
        amountRaw: form.amount,
        date: form.date,
        descriptionRaw: form.description,
        status: form.status,
      });

      if (!tryAcquireTransferLock(user.id, validated)) {
        throw new Error("Essa transferência acabou de ser enviada. Aguarde alguns segundos antes de tentar de novo.");
      }

      const monthlyBalance = await ensureMonthlyBalance(validated.date);
      const description = validated.description;

      if (editingGroupId) {
        const pair = findTransferPair(entries, editingGroupId);
        if (pair.length === 0) throw new Error("Par da transferência não encontrado. Recarregue a página.");
        for (const leg of pair) {
          const payload = {
            monthly_balance_id: monthlyBalance.id,
            account_id: leg.entry_type === "expense" ? validated.fromAccountId : validated.toAccountId,
            category_id: transferCategoryId(),
            description,
            expected_amount: validated.amount,
            actual_amount: validated.status === "paid" ? validated.amount : null,
            due_date: validated.date,
            paid_date: validated.status === "paid" ? validated.date : null,
            status: validated.status,
            notes: sanitizeText(`Transferência entre contas (par ${editingGroupId}).`, 500),
          };
          const { error: updateError } = await supabase.from("financial_entries").update(payload).eq("id", leg.id);
          if (updateError) throw updateError;
        }
      } else {
        const [expenseLeg, incomeLeg] = buildTransferPair({
          userId: user.id,
          monthlyBalanceId: monthlyBalance.id,
          categoryId: transferCategoryId(),
          validated,
        });
        const { error: insertError } = await supabase.from("financial_entries").insert([expenseLeg, incomeLeg]);
        if (insertError) throw insertError;
      }

      setModalOpen(false);
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao salvar transferência.");
    }

    setSaving(false);
  };

  const togglePairStatus = async (groupId: string) => {
    const pair = findTransferPair(entries, groupId);
    if (pair.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const reference = pair[0]!;
      const statusPatch = entryStatusPatch(reference, today);
      const effectiveDate = statusPatch.status === "paid" ? statusPatch.paid_date : reference.due_date;
      const monthlyBalance = await ensureMonthlyBalance(effectiveDate!);
      const payload = { ...statusPatch, monthly_balance_id: monthlyBalance.id };
      const { error: updateError } = await supabase.from("financial_entries").update(payload).in("id", pair.map((leg) => leg.id));
      if (updateError) throw updateError;
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao alternar status da transferência.");
    }
    setSaving(false);
  };

  const deletePair = async (groupId: string, pairCount: number) => {
    if (!window.confirm(`Excluir a transferência (os ${pairCount} lançamentos do par)?`)) {
      if (pairCount > 1 && window.confirm("Excluir só UM lado e manter o outro? (não recomendado)")) {
        const pair = findTransferPair(entries, groupId);
        const single = pair[0];
        if (!single) return;
        const { error: deleteError } = await supabase.from("financial_entries").delete().eq("id", single.id);
        if (deleteError) setError(deleteError.message);
        await loadData();
      }
      return;
    }
    const ids = findTransferPair(entries, groupId).map((leg) => leg.id);
    const { error: deleteError } = await supabase.from("financial_entries").delete().in("id", ids);
    if (deleteError) setError(deleteError.message);
    await loadData();
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero eyebrow="Movimentação interna" title="Transferências entre contas." description="Mover dinheiro entre contas não é gasto nem ganho: entra e sai juntos, sem inflar os totais.">
          <div className="grid gap-4">
            <MonthPicker id="transfers-month" label="Mês de competência" value={selectedMonth} onChange={setSelectedMonth} />
            <Button type="button" onClick={openNewTransfer}>Nova transferência</Button>
          </div>
        </PageHero>

        <Card>
          <CardHeader>
            <CardTitle>Movimentações internas de {monthLabel(parseMonthKey(selectedMonth).year, parseMonthKey(selectedMonth).month)}</CardTitle>
            <CardDescription>
              {groups.length === 0
                ? "Nenhuma transferência neste mês."
                : `${groups.length} transferência(s) · ${formatCurrency(movementTotals.actualTotal)} realizado(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
            {loading ? <p className="text-sm text-slate-400">Carregando transferências...</p> : null}
            <div className="grid gap-3" data-testid="transfer-pair-list">
              {groups.map((group) => (
                <TransferPairCard
                  key={group.key}
                  groupId={group.groupId}
                  legs={group.legs}
                  accountById={accountById}
                  saving={saving}
                  onToggleStatus={() => void togglePairStatus(group.groupId)}
                  onEdit={() => openEditPair(group.groupId)}
                  onDelete={() => void deletePair(group.groupId, group.legs.length)}
                />
              ))}
              {!loading && groups.length === 0 ? (
                <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm text-cyan-100">
                  Nada por aqui ainda. Use “Nova transferência” para mover valores entre contas — os totais de ganhos e gastos continuam intactos.
                </p>
              ) : null}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Quer lançar ganho ou gasto normal? <Link to="/transacoes" className="font-semibold text-cyan-200 underline underline-offset-2">Ir para Lançamentos</Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <Modal title={editingGroupId ? "Editar transferência" : "Nova transferência"} description="Os dois lados (saída e entrada) são criados juntos e editados juntos." open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {editingGroupId ? (
            <p className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.08] p-3 text-xs text-cyan-100">
              Este lançamento faz parte de uma transferência — a edição será aplicada aos 2 lados do par.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transfer-from">Conta origem</Label>
              <select
                id="transfer-from"
                className="finance-select"
                value={form.fromAccountId}
                onChange={(event) => {
                  const fromAccountId = event.target.value;
                  setForm((current) => ({
                    ...current,
                    fromAccountId,
                    description: current.descriptionTouched ? current.description : suggestDescription(fromAccountId, current.toAccountId),
                  }));
                }}
              >
                <option value="">Selecionar</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-to">Conta destino</Label>
              <select
                id="transfer-to"
                className="finance-select"
                value={form.toAccountId}
                onChange={(event) => {
                  const toAccountId = event.target.value;
                  setForm((current) => ({
                    ...current,
                    toAccountId,
                    description: current.descriptionTouched ? current.description : suggestDescription(current.fromAccountId, toAccountId),
                  }));
                }}
              >
                <option value="">Selecionar</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transfer-amount">Valor</Label>
              <Input id="transfer-amount" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-status">Status</Label>
              <select id="transfer-status" className="finance-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TransferStatus })}>
                <option value="paid">Realizado</option>
                <option value="planned">Previsto</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <DatePicker id="transfer-date" label="Data" value={form.date} onChange={(value) => setForm({ ...form, date: value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-description">Descrição</Label>
            <Input
              id="transfer-description"
              value={form.description}
              placeholder={suggestDescription(form.fromAccountId, form.toAccountId) || "Transferência entre contas"}
              onChange={(event) => setForm({ ...form, description: event.target.value, descriptionTouched: true })}
              required
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editingGroupId ? "Salvar par" : "Criar transferência"}</Button>
        </form>
      </Modal>
    </AppShell>
  );
}

function groupPairs(legs: FinancialEntry[]) {
  const groups = new Map<string, FinancialEntry[]>();
  for (const leg of legs) {
    const key = leg.transfer_group_id ?? `single:${leg.id}`;
    const current = groups.get(key) ?? [];
    current.push(leg);
    groups.set(key, current);
  }
  return Array.from(groups.entries())
    .map(([key, pairLegs]) => ({
      key,
      groupId: pairLegs[0]?.transfer_group_id ?? pairLegs[0]?.id ?? key,
      legs: [...pairLegs].sort((first, second) => first.entry_type.localeCompare(second.entry_type)),
    }))
    .sort((first, second) => {
      const dateDiff = new Date(second.legs[0]?.due_date ?? "").getTime() - new Date(first.legs[0]?.due_date ?? "").getTime();
      return dateDiff;
    });
}

function TransferPairCard({
  legs,
  accountById,
  saving,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  groupId: string;
  legs: FinancialEntry[];
  accountById: Map<string, Account>;
  saving: boolean;
  onToggleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reference = legs[0]!;
  const amount = Number(reference.expected_amount);
  const isPaid = reference.status === "paid";
  const originLeg = legs.find((leg) => leg.entry_type === "expense");
  const destinationLeg = legs.find((leg) => leg.entry_type === "income");
  const originName = originLeg?.account_id ? accountById.get(originLeg.account_id)?.name ?? "Origem" : "Origem";
  const destinationName = destinationLeg?.account_id ? accountById.get(destinationLeg.account_id)?.name ?? "Destino" : "Destino";

  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-slate-950/25 p-3 shadow-lg shadow-slate-950/15 sm:p-4" data-testid="transfer-pair-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/20">
            <ArrowLeftRight className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-slate-50">{reference.description}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{originName} → {destinationName}</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-black tracking-[-0.03em] text-cyan-200">{formatCurrency(amount)}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[0.68rem] font-semibold text-cyan-200 ring-1 ring-cyan-300/20">Transferência</span>
        <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ring-1 ${isPaid ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/15" : "bg-[#f5c76b]/10 text-[#f5c76b] ring-[#f5c76b]/15"}`}>
          {isPaid ? "Realizado" : "Previsto"}
        </span>
        {legs.length < 2 ? <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[0.68rem] font-semibold text-rose-200 ring-1 ring-rose-300/20">Par incompleto</span> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            checked={isPaid}
            disabled={saving}
            onChange={onToggleStatus}
            aria-label={isPaid ? `Voltar ${reference.description} para previsto` : `Marcar ${reference.description} como realizado`}
            className="size-5 rounded-md border-white/20 bg-slate-950 accent-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          />
          {isPaid ? "Realizado" : "Marcar realizado"}
        </label>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]" aria-label={`Editar transferência ${reference.description}`}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar par
          </button>
          <button type="button" onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-300/15 bg-rose-400/[0.08] px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.14]" aria-label={`Excluir transferência ${reference.description}`}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Excluir
          </button>
        </span>
      </div>
    </div>
  );
}
