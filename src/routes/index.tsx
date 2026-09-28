import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accountBalanceFromEntries, accountProjectedBalanceFromEntries, balanceKey, formatCurrency, monthKey, monthLabel, parseMonthKey, summarizeEntries } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, FinancialEntry, MonthlyBalance } from "@/types/database";

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
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<MonthlyBalance[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      const { year } = parseMonthKey(selectedMonth);
      const [accountsResult, balancesResult, entriesResult] = await Promise.all([
        supabase.from("accounts").select("*").eq("is_active", true).order("name"),
        supabase.from("monthly_balances").select("*").eq("year", year).order("month"),
        supabase.from("financial_entries").select("*").gte("due_date", `${year}-01-01`).lte("due_date", `${year}-12-31`).order("due_date", { ascending: false }),
      ]);

      if (accountsResult.error) setError(accountsResult.error.message);
      if (balancesResult.error) setError(balancesResult.error.message);
      if (entriesResult.error) setError(entriesResult.error.message);
      setAccounts(accountsResult.data ?? []);
      setBalances(balancesResult.data ?? []);
      setEntries(entriesResult.data ?? []);
      setLoading(false);
    };

    void loadDashboard();
  }, [selectedMonth]);

  const { year, month } = parseMonthKey(selectedMonth);
  const selectedBalance = balances.find((balance) => balance.year === year && balance.month === month);
  const selectedEntries = selectedBalance ? entries.filter((entry) => entry.monthly_balance_id === selectedBalance.id) : entries.filter((entry) => entry.due_date.startsWith(selectedMonth));
  const selectedSummary = summarizeEntries(selectedEntries);

  const yearRows = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const rowMonth = index + 1;
      const balance = balances.find((item) => item.year === year && item.month === rowMonth);
      const rowEntries = balance ? entries.filter((entry) => entry.monthly_balance_id === balance.id) : [];
      return {
        key: monthKey(year, rowMonth),
        label: monthLabel(year, rowMonth),
        summary: summarizeEntries(rowEntries),
      };
    });
  }, [balances, entries, year]);

  const yearSummary = summarizeEntries(entries);
  const totalAccountBalance = accounts.reduce((total, account) => total + accountBalanceFromEntries(account, entries), 0);
  const projectedAccountBalance = accounts.reduce((total, account) => total + accountProjectedBalanceFromEntries(account, selectedEntries), 0);
  const plannedEntries = selectedEntries.filter((entry) => entry.status === "planned");
  const paidEntries = selectedEntries.filter((entry) => entry.status === "paid");

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2.25rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-300">Balanço financeiro simplificado</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">Previsto e realizado no mesmo lugar.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">O mês mostra o resultado previsto/realizado, enquanto as contas mostram quanto dinheiro existe ou deve sobrar.</p>
              <div className="mt-5 max-w-xs rounded-2xl bg-white/10 p-3">
                <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="selected-month">Mês em análise</label>
                <Input id="selected-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-11 border-white/20 bg-white text-slate-950" />
              </div>
              {error ? <div className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</div> : null}
              {loading ? <p className="mt-4 text-sm text-slate-300">Carregando balanço...</p> : null}
            </div>
            <div className="rounded-[1.75rem] bg-white p-4 text-slate-950 shadow-2xl">
              <p className="text-sm text-slate-500">Resultado realizado do mês</p>
              <p className={selectedSummary.actualBalance < 0 ? "mt-2 text-4xl font-black tracking-[-0.05em] text-red-600" : "mt-2 text-4xl font-black tracking-[-0.05em] text-emerald-600"}>{formatCurrency(selectedSummary.actualBalance)}</p>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-2xl bg-cyan-50 p-3">
                  <p className="text-cyan-700">Resultado previsto</p>
                  <p className="font-bold">{formatCurrency(selectedSummary.expectedBalance)}</p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3">
                  <p className="text-slate-500">Saldo atual em contas</p>
                  <p className="font-bold">{formatCurrency(totalAccountBalance)}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <p className="text-emerald-700">Saldo previsto em contas</p>
                  <p className="font-bold">{formatCurrency(projectedAccountBalance)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          <MetricCard title="Ganhos previstos" value={selectedSummary.expectedIncome} tone="emerald" />
          <MetricCard title="Gastos previstos" value={selectedSummary.expectedExpenses} tone="red" />
          <MetricCard title="Resultado previsto" value={selectedSummary.expectedBalance} tone="cyan" />
          <MetricCard title="Ganhos realizados" value={selectedSummary.actualIncome} tone="emerald" />
          <MetricCard title="Gastos realizados" value={selectedSummary.actualExpenses} tone="red" />
          <MetricCard title="Resultado realizado" value={selectedSummary.actualBalance} tone="slate" />
          <MetricCard title="Saldo previsto em contas" value={projectedAccountBalance} tone="cyan" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Visão anual {year}</CardTitle>
            <CardDescription>O mesmo balanço mês a mês que você usa no Notion, agora calculado pelo sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Ganhos previstos no ano</p>
                <p className="text-xl font-bold text-emerald-900">{formatCurrency(yearSummary.expectedIncome)}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-sm text-red-700">Gastos previstos no ano</p>
                <p className="text-xl font-bold text-red-900">{formatCurrency(yearSummary.expectedExpenses)}</p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-sm text-slate-600">Saldo realizado no ano</p>
                <p className="text-xl font-bold text-slate-950">{formatCurrency(yearSummary.actualBalance)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Mês/Ano</th>
                    <th className="px-3 py-2">Ganhos previstos</th>
                    <th className="px-3 py-2">Gastos previstos</th>
                    <th className="px-3 py-2">Resultado previsto</th>
                    <th className="px-3 py-2">Ganhos realizados</th>
                    <th className="px-3 py-2">Gastos realizados</th>
                    <th className="px-3 py-2">Resultado realizado</th>
                  </tr>
                </thead>
                <tbody>
                  {yearRows.map((row) => (
                    <tr key={row.key} className={row.key === selectedMonth ? "bg-cyan-50" : "bg-white"}>
                      <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-950">{row.label}</td>
                      <td className="px-3 py-3 text-emerald-700">{formatCurrency(row.summary.expectedIncome)}</td>
                      <td className="px-3 py-3 text-red-700">{formatCurrency(row.summary.expectedExpenses)}</td>
                      <td className="px-3 py-3 font-semibold text-slate-950">{formatCurrency(row.summary.expectedBalance)}</td>
                      <td className="px-3 py-3 text-emerald-700">{formatCurrency(row.summary.actualIncome)}</td>
                      <td className="px-3 py-3 text-red-700">{formatCurrency(row.summary.actualExpenses)}</td>
                      <td className="rounded-r-2xl px-3 py-3 font-semibold text-slate-950">{formatCurrency(row.summary.actualBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <EntriesPanel title="Previstos" description="Itens planejados para o mês" entries={plannedEntries} />
          <EntriesPanel title="Realizados" description="Ganhos e gastos já pagos/recebidos" entries={paidEntries} />
        </div>
      </div>
    </AppShell>
  );
}

function MetricCard({ title, value, tone }: { title: string; value: number; tone: "emerald" | "red" | "cyan" | "slate" }) {
  const toneClass = {
    emerald: "text-emerald-700 bg-emerald-50",
    red: "text-red-700 bg-red-50",
    cyan: "text-cyan-700 bg-cyan-50",
    slate: "text-slate-950 bg-white",
  }[tone];

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p>
      <p className="mt-2 text-xl font-black tracking-[-0.04em]">{formatCurrency(value)}</p>
    </div>
  );
}

function EntriesPanel({ title, description, entries }: { title: string; description: string; entries: FinancialEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {entries.slice(0, 8).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950">{entry.description}</p>
                <p className="text-sm text-slate-500">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.status === "paid" ? "Realizado" : "Previsto"}</p>
              </div>
              <div className="text-right">
                <p className={entry.entry_type === "income" ? "font-bold text-emerald-600" : "font-bold text-red-600"}>{formatCurrency(entry.status === "paid" ? Number(entry.actual_amount ?? entry.expected_amount) : Number(entry.expected_amount))}</p>
                <p className="text-xs text-slate-500">{entry.entry_type === "income" ? "Ganho" : "Gasto"}</p>
              </div>
            </div>
          ))}
          {entries.length === 0 ? <p className="text-sm text-slate-500">Nenhum item neste grupo.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
