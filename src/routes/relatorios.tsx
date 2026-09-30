import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { entryActualAmount, formatCurrency, isFinanceClassification, monthBounds, monthLabel, parseMonthKey, shiftMonth } from "@/lib/finance";
import { financingEntriesForMonth } from "@/lib/financings";
import { buildAnnualReport, buildMonthlyReport, type ReportDistributionRow } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, SavingsGoal } from "@/types/database";

type ReportMode = "monthly" | "annual";

const today = new Date();
const currentMonth = today.toISOString().slice(0, 7);
const currentYear = today.getFullYear();
const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,notes,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const goalColumns = "id,user_id,name,target_amount,current_amount,monthly_target,deadline,is_active,created_at,updated_at";
const chartColors = ["#22d3ee", "#10b981", "#f5c76b", "#fb7185", "#38bdf8", "#94a3b8"];

export const Route = createFileRoute("/relatorios")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: ReportsPage,
});

function ReportsPage() {
  const { user } = Route.useRouteContext();
  const [mode, setMode] = useState<ReportMode>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [previousYearEntries, setPreviousYearEntries] = useState<FinancialEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      const supabase = createClient();
      setLoading(true);
      setError(null);

      const period = mode === "monthly"
        ? monthBounds(selectedMonth)
        : { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` };

      const previousYearPeriod = { startDate: `${selectedYear - 1}-01-01`, endDate: `${selectedYear - 1}-12-31` };
      const [entriesResult, previousYearEntriesResult, accountsResult, categoriesResult, goalsResult] = await Promise.all([
        supabase.from("financial_entries").select(entryColumns).gte("due_date", period.startDate).lte("due_date", period.endDate).order("due_date"),
        mode === "annual" ? supabase.from("financial_entries").select(entryColumns).gte("due_date", previousYearPeriod.startDate).lte("due_date", previousYearPeriod.endDate).order("due_date") : Promise.resolve({ data: [], error: null }),
        supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
        supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
        supabase.from("savings_goals").select(goalColumns).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      ]);

      const requestError = entriesResult.error ?? previousYearEntriesResult.error ?? accountsResult.error ?? categoriesResult.error ?? goalsResult.error;
      if (requestError) setError(requestError.message);
      setEntries(entriesResult.data ?? []);
      setPreviousYearEntries((previousYearEntriesResult.data ?? []) as FinancialEntry[]);
      setAccounts(accountsResult.data ?? []);
      setCategories(categoriesResult.data ?? []);
      setGoals(goalsResult.data ?? []);
      setLoading(false);
    };

    void loadReport();
  }, [mode, selectedMonth, selectedYear]);

  const visibleCategories = categories.filter((category) => isFinanceClassification(category, user.id));
  const filteredEntries = entries.filter((entry) => {
    const accountMatches = selectedAccountId === "all" || entry.account_id === selectedAccountId;
    const categoryMatches = selectedCategoryId === "all" || entry.category_id === selectedCategoryId;
    return accountMatches && categoryMatches;
  });
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const monthlyReport = useMemo(() => buildMonthlyReport(filteredEntries, accounts, categories, goals), [filteredEntries, accounts, categories, goals]);
  const annualReport = useMemo(() => buildAnnualReport(filteredEntries, accounts, categories, goals, selectedYear), [filteredEntries, accounts, categories, goals, selectedYear]);
  const previousAnnualReport = useMemo(() => buildAnnualReport(previousYearEntries, accounts, categories, goals, selectedYear - 1), [previousYearEntries, accounts, categories, goals, selectedYear]);
  const { year, month } = parseMonthKey(selectedMonth);
  const periodLabel = mode === "monthly" ? monthLabel(year, month) : String(selectedYear);
  const hasEntries = filteredEntries.length > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2.25rem] p-5 text-white sm:p-8 print-card">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Relatórios financeiros</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.05em] sm:text-5xl">Mensal, anual e planejado vs realizado sem abrir planilha.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Consolide lançamentos, contas e classificações com visão executiva para análise e impressão.</p>
              <p className="mt-4 hidden text-sm text-slate-500 print:block">Gerado em {new Date().toLocaleString("pt-BR")}</p>
            </div>
            <div className="print-hidden grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-3 lg:min-w-96">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.06] p-1">
                <button type="button" onClick={() => setMode("monthly")} className={mode === "monthly" ? "rounded-xl bg-emerald-400 px-3 py-2 text-sm font-bold text-[#02140f]" : "rounded-xl px-3 py-2 text-sm font-semibold text-slate-300"}>Mensal</button>
                <button type="button" onClick={() => setMode("annual")} className={mode === "annual" ? "rounded-xl bg-cyan-300 px-3 py-2 text-sm font-bold text-[#02140f]" : "rounded-xl px-3 py-2 text-sm font-semibold text-slate-300"}>Anual</button>
              </div>
              {mode === "monthly" ? (
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>Anterior</Button>
                    <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>Próximo</Button>
                  </div>
                  <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
                </div>
              ) : (
                <Input type="number" min="2000" max="2100" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value || currentYear))} />
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <select className="finance-select" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} aria-label="Filtrar por conta">
                  <option value="all">Todas as contas</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <select className="finance-select" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} aria-label="Filtrar por classificação">
                  <option value="all">Todas as classificações</option>
                  {visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" />
                Exportar / imprimir PDF
              </Button>
              <p className="text-xs leading-5 text-slate-400 sm:hidden">No celular, o navegador/sistema abrirá a impressão ou opção de salvar em PDF.</p>
            </div>
          </div>
        </section>

        {error ? <StateMessage tone="error" title="Não consegui carregar os relatórios" description={error} /> : null}
        {loading ? <ReportsSkeleton /> : null}
        {!loading && !hasEntries ? <StateMessage tone="empty" title={`Sem dados para ${periodLabel}`} description="Quando houver lançamentos previstos ou realizados neste período, o relatório monta os comparativos automaticamente." /> : null}

        {!loading ? (
          <section className="report-print-area space-y-6" aria-label={`Relatório ${mode === "monthly" ? "mensal" : "anual"} de ${periodLabel}`}>
            <PrintTitle mode={mode} periodLabel={periodLabel} />
            {mode === "monthly" ? (
              <MonthlyReportView report={monthlyReport} periodLabel={periodLabel} accountById={accountById} categoryById={categoryById} />
            ) : (
              <AnnualReportView report={annualReport} previousReport={previousAnnualReport} previousEntriesCount={previousYearEntries.length} year={selectedYear} />
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function MonthlyReportView({ report, periodLabel, accountById, categoryById }: { report: ReturnType<typeof buildMonthlyReport>; periodLabel: string; accountById: Map<string, string>; categoryById: Map<string, string> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard title="Entradas" value={report.summary.actualIncome} helper={`Previsto: ${formatCurrency(report.summary.expectedIncome)}`} tone="emerald" />
        <MetricCard title="Saídas" value={report.summary.actualExpenses} helper={`Previsto: ${formatCurrency(report.summary.expectedExpenses)}`} tone="rose" />
        <MetricCard title="Saldo" value={report.summary.actualBalance} helper={`Previsto: ${formatCurrency(report.summary.expectedBalance)}`} tone={report.summary.actualBalance < 0 ? "rose" : "cyan"} />
        <MetricCard title="Planejado vs real" value={report.difference.balance} helper={`Diferença do saldo em ${periodLabel}`} tone={report.difference.balance < 0 ? "rose" : "slate"} />
        <MetricCard title="Economia" value={report.savings.actual} helper={report.savings.goal ? `${report.savings.percent.toFixed(0)}% de ${formatCurrency(report.savings.planned)}` : "Sem meta ativa"} tone="gold" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Previsto vs realizado</CardTitle>
            <CardDescription>Entradas, saídas e saldo do mês selecionado.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComparisonBars rows={[
              { label: "Entradas", planned: report.summary.expectedIncome, actual: report.summary.actualIncome, tone: "emerald" },
              { label: "Saídas", planned: report.summary.expectedExpenses, actual: report.summary.actualExpenses, tone: report.summary.actualExpenses > report.summary.expectedExpenses ? "rose" : "gold" },
              { label: "Saldo", planned: report.summary.expectedBalance, actual: report.summary.actualBalance, tone: report.summary.actualBalance < 0 ? "rose" : "cyan" },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insights rápidos</CardTitle>
            <CardDescription>Alertas simples, sem IA, para revisar o mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {report.insights.map((insight) => <div key={insight} className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-sm text-[#fff3c4]">{insight}</div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <DistributionCard title="Distribuição por classificação" description="Previsto e realizado agrupados por classificação." rows={report.byCategory} />
        <DistributionCard title="Resultado por conta" description="Entradas, saídas e saldo por conta." rows={report.byAccount} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <EntriesCard title="Top 5 maiores saídas" entries={report.topExpenses} tone="expense" accountById={accountById} categoryById={categoryById} />
        <EntriesCard title="Entradas principais" entries={report.topIncome} tone="income" accountById={accountById} categoryById={categoryById} />
        <EntriesCard title="Pendentes / previstos" entries={report.pendingEntries.slice(0, 8)} tone="planned" accountById={accountById} categoryById={categoryById} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parcelas de financiamentos no mês</CardTitle>
          <CardDescription>Impacto oficial já incluído nos totais acima via lançamentos financeiros.</CardDescription>
        </CardHeader>
        <CardContent>
          <EntriesCardContent entries={financingEntriesForMonth(report.entries)} tone="expense" accountById={accountById} categoryById={categoryById} emptyText="Nenhuma parcela de financiamento gerada neste mês." />
        </CardContent>
      </Card>
    </>
  );
}

function AnnualReportView({ report, previousReport, previousEntriesCount, year }: { report: ReturnType<typeof buildAnnualReport>; previousReport: ReturnType<typeof buildAnnualReport>; previousEntriesCount: number; year: number }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total entradas" value={report.summary.actualIncome} helper={`Previsto: ${formatCurrency(report.summary.expectedIncome)}`} tone="emerald" />
        <MetricCard title="Total saídas" value={report.summary.actualExpenses} helper={`Previsto: ${formatCurrency(report.summary.expectedExpenses)}`} tone="rose" />
        <MetricCard title="Saldo anual" value={report.summary.actualBalance} helper={`Previsto: ${formatCurrency(report.summary.expectedBalance)}`} tone={report.summary.actualBalance < 0 ? "rose" : "cyan"} />
        <MetricCard title="Economia acumulada" value={report.savings.actual} helper={report.savings.goal ? `${report.savings.percent.toFixed(0)}% de ${formatCurrency(report.savings.planned)}` : "Sem meta ativa"} tone="gold" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal de {year}</CardTitle>
          <CardDescription>Entradas, saídas e saldo realizado mês a mês.</CardDescription>
        </CardHeader>
        <CardContent>
          <AnnualChart rows={report.months} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tabela mês a mês</CardTitle>
            <CardDescription>Comparativo planejado vs realizado por mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyTable rows={report.months} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Melhor, pior e médias</CardTitle>
            <CardDescription>Resumo executivo do ano.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <InfoRow label="Melhor mês" value={report.bestMonth ? `${report.bestMonth.label}: ${formatCurrency(report.bestMonth.actualBalance)}` : "Sem realizados"} />
              <InfoRow label="Pior mês" value={report.worstMonth ? `${report.worstMonth.label}: ${formatCurrency(report.worstMonth.actualBalance)}` : "Sem realizados"} />
              <InfoRow label="Média entradas" value={formatCurrency(report.averages.income)} />
              <InfoRow label="Média saídas" value={formatCurrency(report.averages.expenses)} />
              <InfoRow label="Média saldo" value={formatCurrency(report.averages.balance)} />
              <InfoRow label="Projeção até dezembro" value={report.projection.hasFuturePlanned ? formatCurrency(report.projection.projectedBalance) : "Sem meses futuros planejados"} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <DistributionCard title="Distribuição anual por classificação" description="Totais anuais agrupados por classificação." rows={report.byCategory} />
        <DistributionCard title="Resultado anual por conta" description="Totais anuais agrupados por conta." rows={report.byAccount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparativo com {year - 1}</CardTitle>
          <CardDescription>Exibido apenas quando há lançamentos no ano anterior.</CardDescription>
        </CardHeader>
        <CardContent>
          {previousEntriesCount > 0 ? <PreviousYearComparison current={report.summary} previous={previousReport.summary} /> : <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm text-cyan-100">Ainda não há dados do ano anterior para comparar.</p>}
        </CardContent>
      </Card>
    </>
  );
}

function PrintTitle({ mode, periodLabel }: { mode: ReportMode; periodLabel: string }) {
  return (
    <div className="hidden print:block">
      <h1 className="text-2xl font-bold text-slate-950">Relatório {mode === "monthly" ? "mensal" : "anual"} - {periodLabel}</h1>
      <p className="mt-1 text-sm text-slate-600">Controle Financeiro · gerado em {new Date().toLocaleString("pt-BR")}</p>
    </div>
  );
}

function MetricCard({ title, value, helper, tone }: { title: string; value: number; helper: string; tone: "emerald" | "rose" | "cyan" | "gold" | "slate" }) {
  const className = {
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-200",
    rose: "border-rose-300/18 bg-rose-400/[0.08] text-rose-200",
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-200",
    gold: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]",
    slate: "border-white/10 bg-white/[0.06] text-slate-100",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-lg shadow-slate-950/15 print-card ${className}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.04em]">{formatCurrency(value)}</p>
      <p className="mt-2 text-xs opacity-70">{helper}</p>
    </div>
  );
}

function ComparisonBars({ rows }: { rows: Array<{ label: string; planned: number; actual: number; tone: "emerald" | "rose" | "cyan" | "gold" }> }) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => {
        const max = Math.max(Math.abs(row.planned), Math.abs(row.actual), 1);
        const plannedWidth = Math.max((Math.abs(row.planned) / max) * 100, row.planned !== 0 ? 8 : 0);
        const actualWidth = Math.max((Math.abs(row.actual) / max) * 100, row.actual !== 0 ? 8 : 0);
        const fillClassName = row.tone === "emerald" ? "bg-emerald-400" : row.tone === "rose" ? "bg-rose-400" : row.tone === "gold" ? "bg-[#f5c76b]" : "bg-cyan-300";
        return (
          <div key={row.label}>
            <div className="mb-2 flex items-start justify-between gap-3 text-sm">
              <span className="font-medium text-slate-200">{row.label}</span>
              <span className="text-right text-xs text-slate-400">Previsto {formatCurrency(row.planned)} · Real {formatCurrency(row.actual)}</span>
            </div>
            <div className="grid gap-1">
              <div className="h-3 rounded-full bg-white/10"><div className="h-full rounded-full bg-white/25" style={{ width: `${plannedWidth}%` }} /></div>
              <div className="h-5 rounded-full bg-white/10"><div className={`h-full rounded-full ${fillClassName}`} style={{ width: `${actualWidth}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnnualChart({ rows }: { rows: ReturnType<typeof buildAnnualReport>["months"] }) {
  const max = Math.max(...rows.map((row) => Math.max(row.actualIncome, row.actualExpenses, Math.abs(row.actualBalance))), 1);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-12 items-end gap-2 overflow-x-auto pb-2">
        {rows.map((row) => (
          <div key={row.month} className="grid min-w-14 gap-2 text-center">
            <div className="flex h-44 items-end justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
              <span className="w-2 rounded-full bg-emerald-400" style={{ height: `${Math.max((row.actualIncome / max) * 100, row.actualIncome > 0 ? 4 : 0)}%` }} />
              <span className="w-2 rounded-full bg-rose-400" style={{ height: `${Math.max((row.actualExpenses / max) * 100, row.actualExpenses > 0 ? 4 : 0)}%` }} />
              <span className={row.actualBalance < 0 ? "w-2 rounded-full bg-rose-300/70" : "w-2 rounded-full bg-cyan-300"} style={{ height: `${Math.max((Math.abs(row.actualBalance) / max) * 100, row.actualBalance !== 0 ? 4 : 0)}%` }} />
            </div>
            <span className="text-xs font-semibold uppercase text-slate-400">{row.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-emerald-400" /> Entradas</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-rose-400" /> Saídas</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-cyan-300" /> Saldo</span>
      </div>
    </div>
  );
}

function DistributionCard({ title, description, rows }: { title: string; description: string; rows: ReportDistributionRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {rows.slice(0, 10).map((row, index) => {
            const percent = total > 0 ? (row.total / total) * 100 : 0;
            return (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 print-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-50"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color || chartColors[index % chartColors.length] }} />{row.name}</p>
                    <p className="mt-1 text-xs text-slate-400">Entradas {formatCurrency(row.actualIncome)} · Saídas {formatCurrency(row.actualExpenses)}</p>
                  </div>
                  <p className={row.actualBalance < 0 ? "shrink-0 font-bold text-rose-300" : "shrink-0 font-bold text-emerald-300"}>{formatCurrency(row.actualBalance)}</p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(percent, row.total > 0 ? 5 : 0)}%` }} /></div>
              </div>
            );
          })}
          {rows.length === 0 ? <p className="text-sm text-slate-400">Sem dados para agrupar neste período.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EntriesCard({ title, entries, tone, accountById, categoryById }: { title: string; entries: FinancialEntry[]; tone: "income" | "expense" | "planned"; accountById: Map<string, string>; categoryById: Map<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{entries.length} lançamento(s) listado(s).</CardDescription>
      </CardHeader>
      <CardContent>
        <EntriesCardContent entries={entries} tone={tone} accountById={accountById} categoryById={categoryById} emptyText="Nenhum lançamento para mostrar." />
      </CardContent>
    </Card>
  );
}

function EntriesCardContent({ entries, tone, accountById, categoryById, emptyText }: { entries: FinancialEntry[]; tone: "income" | "expense" | "planned"; accountById: Map<string, string>; categoryById: Map<string, string>; emptyText: string }) {
  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 print-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-50">{entry.description}</p>
              <p className="mt-1 text-xs text-slate-400">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountById.get(entry.account_id) ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryById.get(entry.category_id) ?? "Classificação" : "Sem classificação"}</p>
            </div>
            <p className={tone === "income" ? "shrink-0 font-black text-emerald-300" : tone === "expense" ? "shrink-0 font-black text-rose-300" : "shrink-0 font-black text-[#f5c76b]"}>{formatCurrency(entry.status === "paid" ? entryActualAmount(entry) : Number(entry.expected_amount))}</p>
          </div>
        </div>
      ))}
      {entries.length === 0 ? <p className="text-sm text-slate-400">{emptyText}</p> : null}
    </div>
  );
}

function PreviousYearComparison({ current, previous }: { current: ReturnType<typeof buildAnnualReport>["summary"]; previous: ReturnType<typeof buildAnnualReport>["summary"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ComparisonMetric label="Entradas" current={current.actualIncome} previous={previous.actualIncome} />
      <ComparisonMetric label="Saídas" current={current.actualExpenses} previous={previous.actualExpenses} />
      <ComparisonMetric label="Saldo" current={current.actualBalance} previous={previous.actualBalance} />
    </div>
  );
}

function ComparisonMetric({ label, current, previous }: { label: string; current: number; previous: number }) {
  const diff = current - previous;
  const percent = previous !== 0 ? (diff / Math.abs(previous)) * 100 : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 print-card">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-50">{formatCurrency(current)}</p>
      <p className={diff < 0 ? "mt-1 text-sm font-semibold text-rose-300" : "mt-1 text-sm font-semibold text-emerald-300"}>{diff >= 0 ? "+" : ""}{formatCurrency(diff)}{percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}</p>
      <p className="mt-1 text-xs text-slate-500">Ano anterior: {formatCurrency(previous)}</p>
    </div>
  );
}

function MonthlyTable({ rows }: { rows: ReturnType<typeof buildAnnualReport>["months"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="py-2 pr-4">Mês</th>
            <th className="py-2 pr-4">Entradas</th>
            <th className="py-2 pr-4">Saídas</th>
            <th className="py-2 pr-4">Saldo</th>
            <th className="py-2 pr-4">Previsto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month} className="border-t border-white/10">
              <td className="py-3 pr-4 font-semibold text-slate-100">{row.label}</td>
              <td className="py-3 pr-4 text-emerald-300">{formatCurrency(row.actualIncome)}</td>
              <td className="py-3 pr-4 text-rose-300">{formatCurrency(row.actualExpenses)}</td>
              <td className={row.actualBalance < 0 ? "py-3 pr-4 font-bold text-rose-300" : "py-3 pr-4 font-bold text-cyan-200"}>{formatCurrency(row.actualBalance)}</td>
              <td className="py-3 pr-4 text-slate-400">{formatCurrency(row.expectedBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 print-card">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-right font-bold text-slate-50">{value}</p>
    </div>
  );
}

function ReportsSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />)}</div>;
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
