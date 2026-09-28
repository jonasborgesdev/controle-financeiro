import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  accountBalanceFromEntries,
  accountBalancesFromEntries,
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
import type { Account, Category, FinancialEntry } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);
const chartColors = ["#0891b2", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#64748b"];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      const supabase = createClient();
      setLoading(true);
      setError(null);
      const { startDate, endDate } = monthBounds(selectedMonth);
      const [accountsResult, categoriesResult, monthEntriesResult, balanceEntriesResult] = await Promise.all([
        supabase.from("accounts").select("*").eq("is_active", true).order("name"),
        supabase.from("categories").select("*").eq("is_active", true).order("name"),
        supabase.from("financial_entries").select("*").gte("due_date", startDate).lte("due_date", endDate).order("due_date", { ascending: false }),
        supabase.from("financial_entries").select("*").order("due_date", { ascending: false }),
      ]);

      const requestError = accountsResult.error ?? categoriesResult.error ?? monthEntriesResult.error ?? balanceEntriesResult.error;
      if (requestError) {
        setError(requestError.message);
      }

      setAccounts(accountsResult.data ?? []);
      setCategories(categoriesResult.data ?? []);
      setMonthEntries(monthEntriesResult.data ?? []);
      setBalanceEntries(balanceEntriesResult.data ?? []);
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
  const hasEntries = filteredMonthEntries.length > 0;
  const { year, month } = parseMonthKey(selectedMonth);
  const monthTitle = monthLabel(year, month);

  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2.25rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-300">Dashboard mensal</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">Visão clara do mês, sem abrir planilha.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">Acompanhe saldo disponível, entradas, saídas, contas e classificações do período selecionado.</p>
              <div className="mt-5 grid gap-3 sm:max-w-2xl sm:grid-cols-[auto_1fr] sm:items-end">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-11 bg-white text-slate-950 hover:bg-cyan-50" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>Anterior</Button>
                  <Button type="button" variant="outline" className="h-11 bg-white text-slate-950 hover:bg-cyan-50" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>Próximo</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="selected-month">Mês</label>
                    <Input id="selected-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-11 border-white/20 bg-white text-slate-950" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="selected-account">Conta</label>
                    <select id="selected-account" className="h-11 w-full rounded-lg border border-white/20 bg-white px-3 text-sm text-slate-950" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                      <option value="all">Todas as contas</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] bg-white p-4 text-slate-950 shadow-2xl">
              <p className="text-sm text-slate-500">Saldo disponível</p>
              <p className={totalAvailable < 0 ? "mt-2 text-4xl font-black tracking-[-0.05em] text-red-600" : "mt-2 text-4xl font-black tracking-[-0.05em] text-emerald-600"}>{formatCurrency(totalAvailable)}</p>
              <p className="mt-3 text-sm text-slate-500">{selectedAccountId === "all" ? "Soma das contas ativas" : accountNameById.get(selectedAccountId) ?? "Conta selecionada"}</p>
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

            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Saldo por conta</CardTitle>
                  <CardDescription>Saldo atual e previsto considerando o filtro aplicado.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {accountBalances.map(({ account, currentBalance, projectedBalance }) => (
                      <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{account.name}</p>
                            <p className="text-sm text-slate-500">{account.bank || "Sem banco informado"}</p>
                          </div>
                          <div className="text-right">
                            <p className={currentBalance < 0 ? "font-bold text-red-600" : "font-bold text-emerald-600"}>{formatCurrency(currentBalance)}</p>
                            <p className="text-xs text-slate-500">Previsto: {formatCurrency(projectedBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {accountBalances.length === 0 ? <p className="text-sm text-slate-500">Nenhuma conta ativa encontrada.</p> : null}
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
                      <div key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">{entry.description}</p>
                          <p className="text-sm text-slate-500">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountNameById.get(entry.account_id) ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryNameById.get(entry.category_id) ?? "Classificação" : "Sem classificação"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={entry.entry_type === "income" ? "font-bold text-emerald-600" : "font-bold text-red-600"}>{entry.entry_type === "income" ? "+" : "-"}{formatCurrency(entryDisplayAmount(entry))}</p>
                          <p className="text-xs text-slate-500">{entry.status === "paid" ? "Realizado" : "Previsto"}</p>
                        </div>
                      </div>
                    ))}
                    {recentEntries.length === 0 ? <p className="text-sm text-slate-500">Nenhum lançamento no período selecionado.</p> : null}
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
                  <Link to="/transacoes" className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800">Nova transação</Link>
                  <button type="button" disabled className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-400">Importar extrato em breve</button>
                  <button type="button" disabled className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-400">Ver relatório em breve</button>
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
    emerald: "text-emerald-700 bg-emerald-50",
    red: "text-red-700 bg-red-50",
    cyan: "text-cyan-700 bg-cyan-50",
    slate: "text-slate-950 bg-white",
  }[tone];

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.04em]">{formatCurrency(value)}</p>
      <p className="mt-2 text-xs opacity-70">{helper}</p>
    </div>
  );
}

function BarsChart({ expectedIncome, actualIncome, expectedExpenses, actualExpenses }: { expectedIncome: number; actualIncome: number; expectedExpenses: number; actualExpenses: number }) {
  const max = Math.max(expectedIncome, actualIncome, expectedExpenses, actualExpenses, 1);
  const rows = [
    { label: "Entradas", expected: expectedIncome, actual: actualIncome, trackClassName: "bg-emerald-100", fillClassName: "bg-emerald-600" },
    { label: "Saídas", expected: expectedExpenses, actual: actualExpenses, trackClassName: "bg-red-100", fillClassName: "bg-red-600" },
  ];

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-start justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{row.label}</span>
            <span className="text-right">
              <span className="block font-bold text-slate-950">Realizado: {formatCurrency(row.actual)}</span>
              <span className="block text-xs text-slate-500">Previsto: {formatCurrency(row.expected)}</span>
            </span>
          </div>
          <div className="h-12 overflow-hidden rounded-2xl bg-slate-100">
            <div className={`relative h-full rounded-2xl ${row.trackClassName}`} style={{ width: `${Math.max((row.expected / max) * 100, row.expected > 0 ? 8 : 0)}%` }}>
              <div className={`absolute inset-y-0 left-0 rounded-2xl ${row.fillClassName}`} style={{ width: `${Math.max(row.expected > 0 ? (row.actual / row.expected) * 100 : 0, row.actual > 0 ? 8 : 0)}%` }} />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-slate-200" /> Previsto</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-slate-700" /> Realizado</span>
      </div>
    </div>
  );
}

function DonutChart({ rows }: { rows: Array<{ id: string; name: string; expected: number; actual: number; color: string | null }> }) {
  const totalExpected = rows.reduce((sum, row) => sum + row.expected, 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  let cursor = 0;
  const gradient = rows.length === 0
    ? "#e2e8f0 0deg 360deg"
    : rows.map((row, index) => {
      const start = cursor;
      const end = cursor + (row.expected / totalExpected) * 360;
      cursor = end;
      return `${row.color || chartColors[index % chartColors.length]} ${start}deg ${end}deg`;
    }).join(", ");

  return (
    <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
      <div className="mx-auto grid size-48 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="grid size-28 place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p className="text-xs text-slate-500">Realizado</p>
            <p className="text-lg font-black text-slate-950">{formatCurrency(totalActual)}</p>
            <p className="text-xs text-slate-500">de {formatCurrency(totalExpected)}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color || chartColors[index % chartColors.length] }} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-700">{row.name}</span>
                  <span className="block text-xs text-slate-500">{totalExpected > 0 ? ((row.expected / totalExpected) * 100).toFixed(1).replace(".", ",") : "0"}% do previsto</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold text-slate-950">{formatCurrency(row.actual)}</span>
                <span className="block text-xs text-slate-500">de {formatCurrency(row.expected)}</span>
              </span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(row.expected > 0 ? (row.actual / row.expected) * 100 : 0, row.actual > 0 ? 8 : 0)}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">Nenhum gasto para agrupar neste mês.</p> : null}
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
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/80" />)}
    </div>
  );
}

function StateMessage({ tone, title, description }: { tone: "error" | "empty"; title: string; description: string }) {
  const className = tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-cyan-200 bg-cyan-50 text-cyan-800";
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{description}</p>
    </div>
  );
}
