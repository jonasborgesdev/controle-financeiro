import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, Pencil, Plus, Power, ReceiptText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { dueDateForMonth, formatCurrency, isFinanceClassification, monthLabel, parseMonthKey } from "@/lib/finance";
import { financingNextDueDate, financingProgressPercent, financingRemainingAmount, financingRemainingInstallments, hasFinancingInstallmentForMonth, monthlyFinancingCommitment } from "@/lib/financings";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, Financing, MonthlyBalance } from "@/types/database";

type FinancingForm = {
  name: string;
  account_id: string;
  category_id: string;
  original_amount: string;
  installment_amount: string;
  total_installments: string;
  paid_installments: string;
  due_day: string;
  start_date: string;
  status: Financing["status"];
  notes: string;
};

type PaymentConfirmation = {
  financing: Financing;
  entry: FinancialEntry;
  amount: string;
  paidDate: string;
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
const emptyForm: FinancingForm = {
  name: "",
  account_id: "",
  category_id: "",
  original_amount: "",
  installment_amount: "",
  total_installments: "",
  paid_installments: "0",
  due_day: "10",
  start_date: today,
  status: "active",
  notes: "",
};

const financingColumns = "id,user_id,account_id,category_id,name,original_amount,installment_amount,total_installments,paid_installments,due_day,start_date,status,notes,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,financing_id,installment_year,installment_month,notes,created_at,updated_at";

export const Route = createFileRoute("/financiamentos")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: FinancingsPage,
});

function FinancingsPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [financings, setFinancings] = useState<Financing[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [balances, setBalances] = useState<MonthlyBalance[]>([]);
  const [form, setForm] = useState<FinancingForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentConfirmation, setPaymentConfirmation] = useState<PaymentConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { year, month } = parseMonthKey(selectedMonth);
  const activeFinancings = financings.filter((financing) => financing.status === "active");
  const totalCommitment = monthlyFinancingCommitment(financings);
  const expenseCategories = categories.filter((category) => category.type === "expense" && isFinanceClassification(category, user.id));
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const monthEnd = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const [financingsResult, accountsResult, categoriesResult, entriesResult, balancesResult] = await Promise.all([
      supabase.from("financings").select(financingColumns).order("status").order("due_day"),
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
      supabase.from("financial_entries").select(entryColumns).gte("due_date", `${selectedMonth}-01`).lte("due_date", monthEnd).order("due_date"),
      supabase.from("monthly_balances").select("id,user_id,year,month,label,created_at,updated_at").eq("year", year).eq("month", month),
    ]);

    const requestError = financingsResult.error ?? accountsResult.error ?? categoriesResult.error ?? entriesResult.error ?? balancesResult.error;
    if (requestError) setError(requestError.message);
    setFinancings(financingsResult.data ?? []);
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setEntries(entriesResult.data ?? []);
    setBalances(balancesResult.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth]);

  const ensureMonthlyBalance = async (date = selectedMonth) => {
    const { year: balanceYear, month: balanceMonth } = parseMonthKey(date.slice(0, 7));
    const existing = balances.find((balance) => balance.year === balanceYear && balance.month === balanceMonth);
    if (existing) return existing;
    const payload = { user_id: user.id, year: balanceYear, month: balanceMonth, label: monthLabel(balanceYear, balanceMonth) };
    const { data, error: balanceError } = await supabase.from("monthly_balances").upsert(payload, { onConflict: "user_id,year,month" }).select("*").single();
    if (balanceError) throw balanceError;
    return data as MonthlyBalance;
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, account_id: accounts[0]?.id ?? "", category_id: expenseCategories[0]?.id ?? "" });
    setModalOpen(true);
  };

  const openEdit = (financing: Financing) => {
    setEditingId(financing.id);
    setForm({
      name: financing.name,
      account_id: financing.account_id ?? "",
      category_id: financing.category_id ?? "",
      original_amount: String(financing.original_amount),
      installment_amount: String(financing.installment_amount),
      total_installments: String(financing.total_installments),
      paid_installments: String(financing.paid_installments),
      due_day: String(financing.due_day),
      start_date: financing.start_date,
      status: financing.status,
      notes: financing.notes ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const originalAmount = Number(form.original_amount || 0);
      const installmentAmount = Number(form.installment_amount || 0);
      const totalInstallments = Number(form.total_installments || 0);
      const paidInstallments = Number(form.paid_installments || 0);
      const dueDay = Number(form.due_day || 0);
      if (!form.name.trim() || !form.account_id || !form.category_id || originalAmount <= 0 || installmentAmount <= 0 || totalInstallments <= 0 || dueDay < 1 || dueDay > 31) {
        throw new Error("Preencha nome, conta, classificação, valores, parcelas e vencimento corretamente.");
      }
      if (paidInstallments < 0 || paidInstallments > totalInstallments) throw new Error("Parcelas pagas não pode passar do total de parcelas.");

      const payload = {
        user_id: user.id,
        account_id: form.account_id,
        category_id: form.category_id,
        name: form.name.trim(),
        original_amount: originalAmount,
        installment_amount: installmentAmount,
        total_installments: totalInstallments,
        paid_installments: paidInstallments,
        due_day: dueDay,
        start_date: form.start_date,
        status: form.status,
        notes: form.notes.trim() || null,
      };

      const result = editingId ? await supabase.from("financings").update(payload).eq("id", editingId) : await supabase.from("financings").insert(payload);
      if (result.error) throw result.error;
      setModalOpen(false);
      await loadData();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "Erro ao salvar financiamento."));
    }
    setSaving(false);
  };

  const generateInstallment = async (financing: Financing) => {
    setSaving(true);
    setError(null);
    try {
      if (hasFinancingInstallmentForMonth(entries, financing.id, year, month)) throw new Error("A parcela deste financiamento já foi gerada neste mês.");
      const monthlyBalance = await ensureMonthlyBalance(selectedMonth);
      const dueDate = dueDateForMonth(financing.due_day, year, month);
      const installmentNumber = Math.min(financing.total_installments, financing.paid_installments + 1);
      const { error: insertError } = await supabase.from("financial_entries").insert({
        user_id: user.id,
        monthly_balance_id: monthlyBalance.id,
        account_id: financing.account_id,
        category_id: financing.category_id,
        entry_type: "expense",
        status: "planned",
        description: `Parcela ${installmentNumber}/${financing.total_installments} financiamento: ${financing.name}`,
        expected_amount: Number(financing.installment_amount),
        actual_amount: null,
        due_date: dueDate,
        paid_date: null,
        source: "financing",
        recurring_rule_id: null,
        external_id: null,
        financing_id: financing.id,
        installment_year: year,
        installment_month: month,
        notes: financing.notes,
      });
      if (insertError) throw insertError;
      await loadData();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "Erro ao gerar parcela."));
    }
    setSaving(false);
  };

  const openPaymentConfirmation = (financing: Financing) => {
    setError(null);
    const entry = entries.find((item) => item.financing_id === financing.id && item.installment_year === year && item.installment_month === month);
    if (!entry) {
      setError("Gere a parcela deste mês antes de marcar como paga.");
      return;
    }
    if (entry.status === "paid") {
      setError("Esta parcela já está marcada como paga.");
      return;
    }
    setPaymentConfirmation({
      financing,
      entry,
      amount: String(entry.actual_amount ?? entry.expected_amount),
      paidDate: today,
    });
  };

  const confirmInstallmentPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentConfirmation) return;
    setSaving(true);
    setError(null);
    try {
      const actualAmount = Number(paymentConfirmation.amount || 0);
      if (actualAmount <= 0) throw new Error("Informe um valor pago maior que zero.");
      if (!paymentConfirmation.paidDate) throw new Error("Informe a data de pagamento.");

      const { financing, entry } = paymentConfirmation;
      const monthlyBalance = await ensureMonthlyBalance(paymentConfirmation.paidDate);
      const { error: updateEntryError } = await supabase.from("financial_entries").update({ status: "paid", actual_amount: actualAmount, paid_date: paymentConfirmation.paidDate, monthly_balance_id: monthlyBalance.id }).eq("id", entry.id).eq("status", "planned");
      if (updateEntryError) throw updateEntryError;
      const nextPaid = Math.min(financing.total_installments, financing.paid_installments + 1);
      const nextStatus = nextPaid >= financing.total_installments ? "finished" : financing.status;
      const { error: updateFinancingError } = await supabase.from("financings").update({ paid_installments: nextPaid, status: nextStatus }).eq("id", financing.id);
      if (updateFinancingError) throw updateFinancingError;
      setPaymentConfirmation(null);
      await loadData();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "Erro ao marcar parcela como paga."));
    }
    setSaving(false);
  };

  const deactivateFinancing = async (financing: Financing) => {
    if (!window.confirm(`Finalizar/desativar ${financing.name}? O histórico de parcelas geradas será mantido.`)) return;
    setSaving(true);
    const nextStatus = financingRemainingInstallments(financing) === 0 ? "finished" : "inactive";
    const { error: updateError } = await supabase.from("financings").update({ status: nextStatus }).eq("id", financing.id);
    if (updateError) setError(updateError.message);
    await loadData();
    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHero eyebrow="Financiamentos" title="Controle parcelas, contrato e impacto mensal." description="Gere a parcela do mês como lançamento previsto e marque como paga quando sair da conta.">
          <div className="grid gap-4">
            <MonthPicker id="financing-month" label="Mês da parcela" value={selectedMonth} onChange={setSelectedMonth} />
            <Button type="button" onClick={openCreate} className="gap-2"><Plus className="size-4" aria-hidden="true" />Cadastrar financiamento</Button>
          </div>
        </PageHero>

        {error ? <StateMessage tone="error" title="Atenção" description={error} /> : null}
        {loading ? <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-3xl border border-white/10 bg-white/[0.06]" />)}</div> : null}

        {!loading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard title="Comprometido/mês" value={formatCurrency(totalCommitment)} helper="Soma dos financiamentos ativos" tone="rose" />
              <MetricCard title="Ativos" value={String(activeFinancings.length)} helper={`${financings.length} contrato(s) cadastrados`} tone="cyan" />
              <MetricCard title="Restante estimado" value={formatCurrency(activeFinancings.reduce((total, financing) => total + financingRemainingAmount(financing), 0))} helper="Parcelas restantes x valor da parcela" tone="gold" />
            </div>

            {financings.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-lg font-bold text-slate-50">Você ainda não cadastrou financiamentos.</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Cadastre os financiamentos ativos para controlar parcelas pagas, vencimentos e impacto no mês.</p>
                  <Button type="button" className="mt-5" onClick={openCreate}>Cadastrar financiamento</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {financings.map((financing) => {
                  const progress = financingProgressPercent(financing);
                  const remaining = financingRemainingInstallments(financing);
                  const installmentGenerated = hasFinancingInstallmentForMonth(entries, financing.id, year, month);
                  const installmentEntry = entries.find((entry) => entry.financing_id === financing.id && entry.installment_year === year && entry.installment_month === month);
                  const nextDueDate = financingNextDueDate(financing);
                  return (
                    <Card key={financing.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle>{financing.name}</CardTitle>
                            <CardDescription>{accountById.get(financing.account_id ?? "") ?? "Sem conta"} · {categoryById.get(financing.category_id ?? "") ?? "Sem classificação"}</CardDescription>
                          </div>
                          <span className={financingStatusClass(financing.status)}>{financing.status === "active" ? "Ativo" : financing.status === "finished" ? "Finalizado" : "Inativo"}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <InfoBox label="Parcela" value={formatCurrency(Number(financing.installment_amount))} />
                            <InfoBox label="Valor restante" value={formatCurrency(financingRemainingAmount(financing))} />
                            <InfoBox label="Parcelas" value={`${financing.paid_installments}/${financing.total_installments} pagas`} />
                            <InfoBox label="Próximo vencimento" value={nextDueDate ? new Date(`${nextDueDate}T00:00:00`).toLocaleDateString("pt-BR") : "Sem vencimento"} />
                          </div>
                          <div>
                            <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Progresso</span><span>{remaining} restante(s) · {progress.toFixed(0)}%</span></div>
                            <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} /></div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Parcela de {monthLabel(year, month)}</p>
                            <p className="mt-1 text-sm text-slate-300">{installmentGenerated ? `Gerada como ${installmentEntry?.status === "paid" ? "realizada" : "prevista"}.` : "Ainda não gerada neste mês."}</p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button type="button" variant="outline" className="gap-2" disabled={saving || financing.status !== "active" || installmentGenerated} onClick={() => generateInstallment(financing)}><ReceiptText className="size-4" aria-hidden="true" />Gerar parcela deste mês</Button>
                            <Button type="button" className="gap-2" disabled={saving || financing.status !== "active" || !installmentGenerated || installmentEntry?.status === "paid"} onClick={() => openPaymentConfirmation(financing)}><CheckCircle2 className="size-4" aria-hidden="true" />Marcar como paga</Button>
                            <Button type="button" variant="secondary" className="gap-2" onClick={() => openEdit(financing)}><Pencil className="size-4" aria-hidden="true" />Editar</Button>
                            <Button type="button" variant="destructive" className="gap-2" disabled={saving || financing.status !== "active"} onClick={() => deactivateFinancing(financing)}><Power className="size-4" aria-hidden="true" />Finalizar/desativar</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        <Modal title={editingId ? "Editar financiamento" : "Cadastrar financiamento"} description="Informe os dados do contrato. As parcelas só impactam o financeiro quando forem geradas." open={modalOpen} onClose={() => setModalOpen(false)}>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2"><Label htmlFor="financing-name">Nome</Label><Input id="financing-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="financing-account">Conta</Label><select id="financing-account" className="finance-select" value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })} required><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
              <div className="grid gap-2"><Label htmlFor="financing-category">Classificação</Label><select id="financing-category" className="finance-select" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Selecione</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="financing-original">Valor original</Label><Input id="financing-original" inputMode="decimal" value={form.original_amount} onChange={(event) => setForm({ ...form, original_amount: event.target.value })} required /></div>
              <div className="grid gap-2"><Label htmlFor="financing-installment">Valor da parcela</Label><Input id="financing-installment" inputMode="decimal" value={form.installment_amount} onChange={(event) => setForm({ ...form, installment_amount: event.target.value })} required /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2"><Label htmlFor="financing-total">Total parcelas</Label><Input id="financing-total" type="number" min="1" value={form.total_installments} onChange={(event) => setForm({ ...form, total_installments: event.target.value })} required /></div>
              <div className="grid gap-2"><Label htmlFor="financing-paid">Pagas</Label><Input id="financing-paid" type="number" min="0" value={form.paid_installments} onChange={(event) => setForm({ ...form, paid_installments: event.target.value })} required /></div>
              <div className="grid gap-2"><Label htmlFor="financing-due-day">Dia vencimento</Label><Input id="financing-due-day" type="number" min="1" max="31" value={form.due_day} onChange={(event) => setForm({ ...form, due_day: event.target.value })} required /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePicker id="financing-start" label="Data de início" value={form.start_date} onChange={(value) => setForm({ ...form, start_date: value })} required />
              <div className="grid gap-2"><Label htmlFor="financing-status">Status</Label><select id="financing-status" className="finance-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Financing["status"] })}><option value="active">Ativo</option><option value="finished">Finalizado</option><option value="inactive">Inativo</option></select></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="financing-notes">Observações</Label><textarea id="financing-notes" className="min-h-28 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-50 outline-none focus-visible:border-cyan-300 focus-visible:ring-3 focus-visible:ring-cyan-300/20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar financiamento"}</Button>
          </form>
        </Modal>

        <Modal title="Confirmar pagamento" description="Confira a data e o valor pago. Ajuste se houve juros, multa ou desconto." open={Boolean(paymentConfirmation)} onClose={() => setPaymentConfirmation(null)}>
          {paymentConfirmation ? (
            <form className="grid gap-4" onSubmit={confirmInstallmentPayment}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-sm font-semibold text-slate-50">{paymentConfirmation.financing.name}</p>
                <p className="mt-1 text-xs text-slate-400">Vencimento: {new Date(`${paymentConfirmation.entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · Previsto: {formatCurrency(Number(paymentConfirmation.entry.expected_amount))}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <DatePicker id="financing-paid-date" label="Data de pagamento" value={paymentConfirmation.paidDate} onChange={(value) => setPaymentConfirmation({ ...paymentConfirmation, paidDate: value })} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="financing-paid-amount">Valor pago</Label>
                  <Input id="financing-paid-amount" type="number" min="0" step="0.01" inputMode="decimal" value={paymentConfirmation.amount} onChange={(event) => setPaymentConfirmation({ ...paymentConfirmation, amount: event.target.value })} required />
                </div>
              </div>
              <Button type="submit" disabled={saving}>{saving ? "Confirmando..." : "Confirmar pagamento"}</Button>
            </form>
          ) : null}
        </Modal>
      </div>
    </AppShell>
  );
}

function MetricCard({ title, value, helper, tone }: { title: string; value: string; helper: string; tone: "rose" | "cyan" | "gold" }) {
  const className = tone === "rose" ? "border-rose-300/18 bg-rose-400/[0.08] text-rose-200" : tone === "gold" ? "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]" : "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-200";
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p><p className="mt-2 text-2xl font-black tracking-[-0.04em]">{value}</p><p className="mt-2 text-xs opacity-70">{helper}</p></div>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-50">{value}</p></div>;
}

function errorMessage(caughtError: unknown, fallback: string) {
  if (caughtError instanceof Error) return caughtError.message;
  if (caughtError && typeof caughtError === "object" && "message" in caughtError && typeof caughtError.message === "string") return caughtError.message;
  return fallback;
}

function StateMessage({ tone, title, description }: { tone: "error" | "empty"; title: string; description: string }) {
  const className = tone === "error" ? "border-rose-300/20 bg-rose-400/[0.10] text-rose-100" : "border-cyan-300/20 bg-cyan-400/[0.10] text-cyan-100";
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-80">{description}</p></div>;
}

function financingStatusClass(status: Financing["status"]) {
  return status === "active" ? "rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-bold text-emerald-200" : "rounded-full bg-white/[0.08] px-3 py-1 text-xs font-bold text-slate-300";
}
