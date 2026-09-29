import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  accountBalanceFromEntries,
  accountBalancesFromEntries,
  activeSavingsGoal,
  entryActualAmount,
  entryDisplayAmount,
  formatCurrency,
  isFinanceClassification,
  latestEntries,
  monthBounds,
  monthLabel,
  parseMonthKey,
  shiftMonth,
  summarizeEntries,
} from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, SavingsGoal } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);
const chartColors = ["#22d3ee", "#10b981", "#f5c76b", "#fb7185", "#38bdf8", "#94a3b8"];
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,notes,created_at,updated_at";
const balanceEntryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,notes,created_at,updated_at";
const goalColumns = "id,user_id,name,target_amount,current_amount,monthly_target,deadline,is_active,created_at,updated_at";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (!data.session) throw redirect({ to: "/login" });

    return { user: data.session.user };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthEntries, setMonthEntries] = useState<FinancialEntry[]>([]);
  const [balanceEntries, setBalanceEntries] = useState<FinancialEntry[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      const supabase = createClient();
      setLoading(true);
      setError(null);
      const { startDate, endDate } = monthBounds(selectedMonth);
      const [accountsResult, categoriesResult, monthEntriesResult, balanceEntriesResult, goalsResult] = await Promise.all([
        supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
        supabase.from("categories").select(categoryColumns).eq("is_active", true).order("name"),
        supabase.from("financial_entries").select(entryColumns).gte("due_date", startDate).lte("due_date", endDate).order("due_date", { ascending: false }),
        supabase.from("financial_entries").select(balanceEntryColumns).eq("status", "paid").order("due_date", { ascending: false }),
        supabase.from("savings_goals").select(goalColumns).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      ]);

      const requestError = accountsResult.error ?? categoriesResult.error ?? monthEntriesResult.error ?? balanceEntriesResult.error ?? goalsResult.error;
      if (requestError) {
        setError(requestError.message);
      }

      setAccounts(accountsResult.data ?? []);
      setCategories(categoriesResult.data ?? []);
      setMonthEntries(monthEntriesResult.data ?? []);
      setBalanceEntries(balanceEntriesResult.data ?? []);
      setGoals(goalsResult.data ?? []);
      setLoading(false);
    };

    void loadDashboard();
  }, [selectedMonth]);

  const selectedAccounts = selectedAccountId === "all" ? accounts : accounts.filter((account) => account.id === selectedAccountId);
  const filteredMonthEntries = selectedAccountId === "all" ? monthEntries : monthEntries.filter((entry) => entry.account_id === selectedAccountId);
  const filteredBalanceEntries = selectedAccountId === "all" ? balanceEntries : balanceEntries.filter((entry) => entry.account_id === selectedAccountId);
  const summary = summarizeEntries(filteredMonthEntries);
  const totalAvailable = selectedAccounts.reduce((total, account) => total + accountBalanceFromEntries(account, filteredBalanceEntries), 0);
  const accountBalances = accountBalancesFromEntries(selectedAccounts, filteredBalanceEntries);
  const categoryExpenses = expensesByCategoryProgress(filteredMonthEntries, categories, user.id);
  const recentEntries = latestEntries(filteredMonthEntries, 5);
  const activeGoal = activeSavingsGoal(goals);
  const goalProgress = activeGoal && activeGoal.monthly_target > 0 ? Math.max(0, Math.min(100, (summary.actualBalance / Number(activeGoal.monthly_target)) * 100)) : 0;
  const hasEntries = filteredMonthEntries.length > 0;
  const { year, month } = parseMonthKey(selectedMonth);
  const monthTitle = monthLabel(year, month);

  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2.25rem] p-5 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Dashboard mensal</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">Visão clara do mês, sem abrir planilha.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">Acompanhe saldo disponível, entradas, saídas, contas e classificações do período selecionado.</p>
              <div className="mt-5 grid gap-3 sm:max-w-2xl sm:grid-cols-[auto_1fr] sm:items-end">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>Anterior</Button>
                  <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>Próximo</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="selected-month">Mês</label>
                    <Input id="selected-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="selected-account">Conta</label>
                    <select id="selected-account" className="finance-select" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                      <option value="all">Todas as contas</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-4 text-slate-50 shadow-2xl">
              <p className="text-sm text-slate-400">Saldo disponível</p>
              <p className={totalAvailable < 0 ? "mt-2 text-4xl font-black tracking-[-0.05em] text-rose-300" : "mt-2 text-4xl font-black tracking-[-0.05em] text-emerald-300"}>{formatCurrency(totalAvailable)}</p>
              <p className="mt-3 text-sm text-slate-400">{selectedAccountId === "all" ? "Soma das contas ativas" : accountNameById.get(selectedAccountId) ?? "Conta selecionada"}</p>
            </div>
          </div>
        </section>

        {error ? <StateMessage tone="error" title="Não consegui carregar o dashboard" description={error} /> : null}
        {loading ? <DashboardSkeleton /> : null}

        {!loading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="Saldo disponível" value={totalAvailable} tone="slate" helper="Saldo inicial + realizados" />
              <MetricCard title="Entradas realizadas" value={summary.actualIncome} tone="emerald" helper={`Previsto no mês: ${formatCurrency(summary.expectedIncome)}`} />
              <MetricCard title="Saídas realizadas" value={summary.actualExpenses} tone="red" helper={`Previsto no mês: ${formatCurrency(summary.expectedExpenses)}`} />
              <MetricCard title="Diferença realizada" value={summary.actualBalance} tone={summary.actualBalance < 0 ? "red" : "cyan"} helper={`Previsto no mês: ${formatCurrency(summary.expectedBalance)}`} />
            </div>

            {!hasEntries ? <StateMessage tone="empty" title={`Sem lançamentos em ${monthTitle}`} description="Cadastre uma entrada ou saída para o dashboard montar os cards, gráficos e últimas movimentações." /> : null}

            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Entradas vs saídas</CardTitle>
                  <CardDescription>Comparativo apenas do que já foi realizado no período.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BarsChart
                    expectedIncome={summary.expectedIncome}
                    actualIncome={summary.actualIncome}
                    expectedExpenses={summary.expectedExpenses}
                    actualExpenses={summary.actualExpenses}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gastos por classificação</CardTitle>
                  <CardDescription>Distribuição dos gastos realizados no mês.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DonutChart rows={categoryExpenses} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Resumo do planejamento</CardTitle>
                    <CardDescription>Previsto vs realizado do mês e progresso da meta de economia.</CardDescription>
                  </div>
                    <Link to="/planejamento" className="rounded-xl bg-cyan-400/12 px-4 py-2 text-center text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18">Abrir planejamento</Link>
                </div>
              </CardHeader>
              <CardContent>
                <PlanningSummaryChart summary={summary} activeGoal={activeGoal} goalProgress={goalProgress} />
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Saldo por conta</CardTitle>
                  <CardDescription>Saldo atual e previsto considerando o filtro aplicado.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {accountBalances.map(({ account, currentBalance, projectedBalance }) => (
                      <div key={account.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-50">{account.name}</p>
                            <p className="text-sm text-slate-400">{account.bank || "Sem banco informado"}</p>
                          </div>
                          <div className="text-right">
                            <p className={currentBalance < 0 ? "font-bold text-rose-300" : "font-bold text-emerald-300"}>{formatCurrency(currentBalance)}</p>
                            <p className="text-xs text-slate-400">Previsto: {formatCurrency(projectedBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {accountBalances.length === 0 ? <p className="text-sm text-slate-400">Nenhuma conta ativa encontrada.</p> : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Últimos lançamentos</CardTitle>
                  <CardDescription>Os 5 lançamentos mais recentes de {monthTitle}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {recentEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-50">{entry.description}</p>
                          <p className="text-sm text-slate-400">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountNameById.get(entry.account_id) ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryNameById.get(entry.category_id) ?? "Classificação" : "Sem classificação"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={entry.entry_type === "income" ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>{entry.entry_type === "income" ? "+" : "-"}{formatCurrency(entryDisplayAmount(entry))}</p>
                          <p className="text-xs text-slate-400">{entry.status === "paid" ? "Realizado" : "Previsto"}</p>
                        </div>
                      </div>
                    ))}
                    {recentEntries.length === 0 ? <p className="text-sm text-slate-400">Nenhum lançamento no período selecionado.</p> : null}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ações rápidas</CardTitle>
                <CardDescription>Atalhos para operar o controle financeiro sem sair do fluxo.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Link to="/transacoes" className="rounded-2xl bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-[#02140f] transition hover:bg-emerald-300">Nova transação</Link>
                  <button type="button" disabled className="rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-400/[0.06] px-4 py-3 text-sm font-semibold text-cyan-200/60">Importar extrato em breve</button>
                  <button type="button" disabled className="rounded-2xl border border-dashed border-[#f5c76b]/25 bg-[#f5c76b]/[0.06] px-4 py-3 text-sm font-semibold text-[#f5c76b]/60">Ver relatório em breve</button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function MetricCard({ title, value, tone, helper }: { title: string; value: number; tone: "emerald" | "red" | "cyan" | "slate"; helper: string }) {
  const toneClass = {
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-200",
    red: "border-rose-300/18 bg-rose-400/[0.08] text-rose-200",
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-200",
    slate: "border-white/10 bg-white/[0.06] text-slate-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-lg shadow-slate-950/15 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.04em]">{formatCurrency(value)}</p>
      <p className="mt-2 text-xs opacity-70">{helper}</p>
    </div>
  );
}

function BarsChart({ expectedIncome, actualIncome, expectedExpenses, actualExpenses }: { expectedIncome: number; actualIncome: number; expectedExpenses: number; actualExpenses: number }) {
  const rows = [
    { label: "Entradas", expected: expectedIncome, actual: actualIncome, trackClassName: "bg-emerald-400/15", fillClassName: "bg-emerald-400" },
    { label: "Saídas", expected: expectedExpenses, actual: actualExpenses, trackClassName: "bg-rose-400/15", fillClassName: "bg-rose-400" },
  ];

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-start justify-between gap-3 text-sm">
              <span className="font-medium text-slate-200">{row.label}</span>
              <span className="text-right">
              <span className="block font-bold text-slate-50">Realizado: {formatCurrency(row.actual)}</span>
              <span className="block text-xs text-slate-400">Previsto: {formatCurrency(row.expected)}</span>
            </span>
          </div>
          <div className="h-12 overflow-hidden rounded-2xl bg-white/[0.06]">
            <div className={`relative h-full rounded-2xl ${row.trackClassName}`} style={{ width: `${row.expected > 0 ? 100 : 0}%` }}>
              <div className={`absolute inset-y-0 left-0 rounded-2xl ${row.fillClassName}`} style={{ width: `${row.expected > 0 ? Math.min(100, Math.max((row.actual / row.expected) * 100, row.actual > 0 ? 8 : 0)) : row.actual > 0 ? 100 : 0}%` }} />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-white/15" /> Previsto</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-emerald-300" /> Realizado</span>
      </div>
    </div>
  );
}

function DonutChart({ rows }: { rows: Array<{ id: string; name: string; expected: number; actual: number; color: string | null }> }) {
  const totalExpected = rows.reduce((sum, row) => sum + row.expected, 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  let cursor = 0;
  const gradient = rows.length === 0
    ? "rgba(255,255,255,0.10) 0deg 360deg"
    : rows.map((row, index) => {
      const start = cursor;
      const end = cursor + (row.expected / totalExpected) * 360;
      cursor = end;
      return `${row.color || chartColors[index % chartColors.length]} ${start}deg ${end}deg`;
    }).join(", ");

  return (
    <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
      <div className="mx-auto grid size-48 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="grid size-28 place-items-center rounded-full bg-slate-950 text-center shadow-inner">
          <div>
            <p className="text-xs text-slate-400">Realizado</p>
            <p className="text-lg font-black text-slate-50">{formatCurrency(totalActual)}</p>
            <p className="text-xs text-slate-400">de {formatCurrency(totalExpected)}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color || chartColors[index % chartColors.length] }} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-200">{row.name}</span>
                  <span className="block text-xs text-slate-400">{totalExpected > 0 ? ((row.expected / totalExpected) * 100).toFixed(1).replace(".", ",") : "0"}% do previsto</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold text-slate-50">{formatCurrency(row.actual)}</span>
                <span className="block text-xs text-slate-400">de {formatCurrency(row.expected)}</span>
              </span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(row.expected > 0 ? (row.actual / row.expected) * 100 : 0, row.actual > 0 ? 8 : 0)}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-400">Nenhum gasto para agrupar neste mês.</p> : null}
      </div>
    </div>
  );
}

function PlanningSummaryChart({ summary, activeGoal, goalProgress }: { summary: ReturnType<typeof summarizeEntries>; activeGoal: SavingsGoal | null; goalProgress: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-white">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Planejado vs realizado</p>
            <p className="mt-1 text-xs text-slate-300">Comparativo do mês selecionado.</p>
          </div>
          <p className={summary.actualBalance < 0 ? "text-right text-sm font-bold text-red-300" : "text-right text-sm font-bold text-emerald-300"}>{formatCurrency(summary.actualBalance)}</p>
        </div>
        <div className="grid gap-4">
          <MiniPlanningBar label="Entradas" planned={summary.expectedIncome} actual={summary.actualIncome} tone="emerald" />
          <MiniPlanningBar label="Saídas" planned={summary.expectedExpenses} actual={summary.actualExpenses} tone={summary.actualExpenses > summary.expectedExpenses ? "red" : "amber"} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Saldo esperado</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-50">{formatCurrency(summary.expectedBalance)}</p>
          <p className="mt-1 text-xs text-slate-400">Diferença: {formatCurrency(summary.actualBalance - summary.expectedBalance)}</p>
        </div>
        <div className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-[#fff3c4]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#f5c76b]">Meta economia</p>
              <p className="mt-2 text-xl font-black tracking-[-0.04em]">{activeGoal ? `${goalProgress.toFixed(0)}%` : "Sem meta"}</p>
            </div>
            <p className="text-right text-xs text-[#f5c76b]">{activeGoal ? formatCurrency(Number(activeGoal.monthly_target)) : "Cadastre no planejamento"}</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#f5c76b]" style={{ width: `${activeGoal ? goalProgress : 0}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPlanningBar({ label, planned, actual, tone }: { label: string; planned: number; actual: number; tone: "emerald" | "amber" | "red" }) {
  const trackClassName = {
    emerald: "bg-emerald-400/20",
    amber: "bg-amber-400/20",
    red: "bg-red-400/25",
  }[tone];
  const fillClassName = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
  }[tone];
  const valueClassName = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
  }[tone];
  const plannedWidth = planned > 0 ? 100 : 0;
  const actualWidth = planned > 0 ? Math.min(100, Math.max((actual / planned) * 100, actual > 0 ? 8 : 0)) : actual > 0 ? 100 : 0;

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3 text-sm">
        <div>
          <p className="font-medium text-white">{label}</p>
          <p className="text-xs text-slate-400">Previsto: {formatCurrency(planned)}</p>
        </div>
        <p className={`font-black ${valueClassName}`}>{formatCurrency(actual)}</p>
      </div>
      <div className="h-9 overflow-hidden rounded-xl bg-white/10 p-1">
        <div className={`relative h-full rounded-lg ${trackClassName}`} style={{ width: `${plannedWidth}%` }}>
          <div className={`absolute inset-y-0 left-0 rounded-lg ${fillClassName}`} style={{ width: `${actualWidth}%` }} />
        </div>
      </div>
    </div>
  );
}

function expensesByCategoryProgress(entries: FinancialEntry[], categories: Category[], userId: string) {
  const categoryById = new Map(categories.filter((category) => isFinanceClassification(category, userId)).map((category) => [category.id, category]));
  const totals = entries
    .filter((entry) => entry.entry_type === "expense")
    .reduce<Map<string, { id: string; name: string; expected: number; actual: number; color: string | null }>>((map, entry) => {
      const category = entry.category_id ? categoryById.get(entry.category_id) : null;
      const id = category?.id ?? "sem-categoria";
      const current = map.get(id) ?? { id, name: category?.name ?? "Sem classificação", expected: 0, actual: 0, color: category?.color ?? null };
      current.expected += Number(entry.expected_amount);
      current.actual += entry.status === "paid" ? entryActualAmount(entry) : 0;
      map.set(id, current);
      return map;
    }, new Map());

  return Array.from(totals.values()).sort((first, second) => second.expected - first.expected);
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />)}
    </div>
  );
}

function StateMessage({ tone, title, description }: { tone: "error" | "empty"; title: string; description: string }) {
  const className = tone === "error" ? "border-rose-300/20 bg-rose-400/[0.10] text-rose-100" : "border-cyan-300/20 bg-cyan-400/[0.10] text-cyan-100";
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{description}</p>
    </div>
  );
}
