import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, monthLabel, parseMonthKey, shiftMonth } from "@/lib/finance";
import { buildFinancialProjection, type ProjectionMonth, type ProjectionStatus, type ProjectionSummary } from "@/lib/projections";
import { createClient } from "@/lib/supabase/client";
import type { Account, Budget, Category, FinancialEntry, Financing, RecurringRule, SavingsGoal } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);
const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,financing_id,installment_year,installment_month,notes,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const ruleColumns = "id,user_id,account_id,category_id,entry_type,description,amount,day_of_month,start_year,start_month,end_year,end_month,is_active,notes,created_at,updated_at";
const budgetColumns = "id,user_id,category_id,year,month,planned_amount,created_at,updated_at";
const goalColumns = "id,user_id,name,target_amount,current_amount,monthly_target,deadline,is_active,created_at,updated_at";
const financingColumns = "id,user_id,account_id,category_id,name,original_amount,installment_amount,total_installments,paid_installments,due_day,start_date,status,notes,created_at,updated_at";

export const Route = createFileRoute("/projecoes")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: ProjectionsPage,
});

function ProjectionsPage() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [projectionMonths, setProjectionMonths] = useState(6);
  const [projection, setProjection] = useState<ProjectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { year, month } = parseMonthKey(selectedMonth);

  useEffect(() => {
    const loadProjection = async () => {
      const supabase = createClient();
      setLoading(true);
      setError(null);

      const futureEnd = shiftMonth(selectedMonth, projectionMonths - 1);
      const pastStart = shiftMonth(selectedMonth, -3);
      const endDate = `${futureEnd}-${String(new Date(Number(futureEnd.slice(0, 4)), Number(futureEnd.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;

      const [entriesResult, accountsResult, categoriesResult, rulesResult, budgetsResult, goalsResult, financingsResult] = await Promise.all([
        supabase.from("financial_entries").select(entryColumns).gte("due_date", `${pastStart}-01`).lte("due_date", endDate).order("due_date").limit(3000),
        supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
        supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
        supabase.from("recurring_rules").select(ruleColumns).eq("is_active", true).order("description"),
        supabase.from("budgets").select(budgetColumns).gte("year", Number(pastStart.slice(0, 4))).lte("year", Number(futureEnd.slice(0, 4))).order("year").order("month"),
        supabase.from("savings_goals").select(goalColumns).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
        supabase.from("financings").select(financingColumns).eq("status", "active").order("due_day"),
      ]);

      const requestError = entriesResult.error ?? accountsResult.error ?? categoriesResult.error ?? rulesResult.error ?? budgetsResult.error ?? goalsResult.error;
      if (requestError) {
        setError(requestError.message);
        setProjection(null);
      } else {
        setProjection(buildFinancialProjection({
          startYear: year,
          startMonth: month,
          months: projectionMonths,
          averageWindowMonths: 3,
          entries: entriesResult.data as FinancialEntry[] ?? [],
          accounts: accountsResult.data as Account[] ?? [],
          categories: categoriesResult.data as Category[] ?? [],
          recurringRules: rulesResult.data as RecurringRule[] ?? [],
          budgets: budgetsResult.data as Budget[] ?? [],
          savingsGoals: goalsResult.data as SavingsGoal[] ?? [],
          financings: financingsResult.error ? [] : financingsResult.data as Financing[] ?? [],
        }));
      }
      setLoading(false);
    };

    void loadProjection();
  }, [selectedMonth, projectionMonths, year, month]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHero eyebrow="Projeções financeiras" title="Veja o caixa antes do problema aparecer." description="Cálculo determinístico com recorrências, lançamentos, orçamento, meta, financiamentos e média variável dos últimos 3 meses.">
          <div className="grid gap-4">
            <MonthPicker label="Mês inicial" value={selectedMonth} onChange={setSelectedMonth} />
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor="projection-window">Janela</label>
              <select id="projection-window" className="finance-select" value={projectionMonths} onChange={(event) => setProjectionMonths(Number(event.target.value))} aria-label="Janela da projeção">
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
              </select>
            </div>
          </div>
        </PageHero>

        {error ? <StateMessage tone="error" title="Não consegui carregar a projeção" description={error} /> : null}
        {loading ? <ProjectionSkeleton /> : null}
        {!loading && projection && projection.months.length === 0 ? <StateMessage tone="empty" title="Sem base para projetar" description="Cadastre lançamentos, recorrências ou orçamentos para o sistema calcular os próximos meses." /> : null}

        {!loading && projection ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard title="Saldo projetado" value={projection.finalProjectedBalance} helper={`Até ${projection.months.at(-1)?.label ?? monthLabel(year, month)}`} tone={projection.finalProjectedBalance < 0 ? "rose" : "cyan"} />
              <MetricCard title="Entradas" value={projection.totalProjectedIncome} helper={`${projectionMonths} mês(es) projetados`} tone="emerald" />
              <MetricCard title="Saídas" value={projection.totalProjectedExpenses} helper="Planejado + tendência" tone="rose" />
              <MetricCard title="Meses em risco" value={String(projection.monthsAtRisk)} helper={projection.monthsAtRisk === 0 ? "Sem risco crítico" : "Exigem revisão"} tone={projection.monthsAtRisk > 0 ? "rose" : "emerald"} />
              <MetricCard title="Meta economia" value={projection.savingsTargetTotal} helper="Soma das metas mensais" tone="gold" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Evolução do saldo</CardTitle>
                  <CardDescription>Gráfico CSS do saldo acumulado projetado mês a mês.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BalanceProjectionChart months={projection.months} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Alertas da projeção</CardTitle>
                  <CardDescription>Status calculado pelo sistema, sem IA como fonte da verdade.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className={statusClass(projection.status)}>
                      {projection.status === "healthy" ? <ShieldCheck className="size-5" aria-hidden="true" /> : <AlertTriangle className="size-5" aria-hidden="true" />}
                      <span>{statusLabel(projection.status)}</span>
                    </div>
                    {projection.alerts.map((alert) => <div key={alert} className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-sm text-[#fff3c4]">{alert}</div>)}
                    <Link to="/planejamento" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.08] px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/[0.14]">Ajustar planejamento <ArrowRight className="size-4" aria-hidden="true" /></Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Mês a mês</CardTitle>
                <CardDescription>Comparativo entre cenário planejado, tendência histórica e saldo previsto.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 lg:hidden">
                  {projection.months.map((month) => <ProjectionMonthCard key={month.key} month={month} />)}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Mês</th>
                        <th className="py-2 pr-4">Entradas</th>
                        <th className="py-2 pr-4">Saídas</th>
                        <th className="py-2 pr-4">Saldo</th>
                        <th className="py-2 pr-4">Acumulado</th>
                        <th className="py-2 pr-4">Financiamentos</th>
                        <th className="py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projection.months.map((month) => (
                        <tr key={month.key} className="border-t border-white/10">
                          <td className="py-3 pr-4 font-semibold text-slate-100">{month.label}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatCurrency(month.projectedIncome)}</td>
                          <td className="py-3 pr-4 text-rose-300">{formatCurrency(month.projectedExpenses)}</td>
                          <td className={month.projectedBalance < 0 ? "py-3 pr-4 font-bold text-rose-300" : "py-3 pr-4 font-bold text-cyan-200"}>{formatCurrency(month.projectedBalance)}</td>
                          <td className={month.cumulativeBalance < 0 ? "py-3 pr-4 font-bold text-rose-300" : "py-3 pr-4 text-slate-100"}>{formatCurrency(month.cumulativeBalance)}</td>
                          <td className="py-3 pr-4 text-[#f5c76b]">{formatCurrency(month.financingImpact)}</td>
                          <td className="py-3 pr-4"><span className={badgeClass(month.risk)}>{statusLabel(month.risk)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Premissas usadas</CardTitle>
                <CardDescription>Transparência do cálculo para você saber exatamente de onde a projeção veio.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 lg:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-cyan-100">
                    <p className="text-xs uppercase tracking-[0.12em] opacity-70">Média variável mensal</p>
                    <p className="mt-2 text-xl font-black">{formatCurrency(projection.variableAverage.income)} / {formatCurrency(projection.variableAverage.expenses)}</p>
                    <p className="mt-2 text-xs opacity-80">Entradas / saídas dos últimos {projection.variableAverage.windowMonths} meses.</p>
                  </div>
                  <div className="grid gap-2">
                    {projection.assumptions.map((assumption) => <p key={assumption} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm text-slate-300">{assumption}</p>)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function MetricCard({ title, value, helper, tone }: { title: string; value: number | string; helper: string; tone: "emerald" | "rose" | "cyan" | "gold" }) {
  const className = {
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-200",
    rose: "border-rose-300/18 bg-rose-400/[0.08] text-rose-200",
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-200",
    gold: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]",
  }[tone];
  return <div className={`rounded-2xl border p-4 shadow-lg shadow-slate-950/15 ${className}`}><p className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</p><p className="mt-2 text-2xl font-black tracking-[-0.04em]">{typeof value === "number" ? formatCurrency(value) : value}</p><p className="mt-2 text-xs opacity-70">{helper}</p></div>;
}

function BalanceProjectionChart({ months }: { months: ProjectionMonth[] }) {
  const max = Math.max(...months.map((month) => Math.abs(month.cumulativeBalance)), 1);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 items-end gap-2 overflow-x-auto pb-2 sm:grid-cols-6">
        {months.map((month) => (
          <div key={month.key} className="grid min-w-20 gap-2 text-center">
            <div className="flex h-48 items-end justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-2">
              <div className={month.cumulativeBalance < 0 ? "w-full rounded-xl bg-rose-400" : "w-full rounded-xl bg-cyan-300"} style={{ height: `${Math.max((Math.abs(month.cumulativeBalance) / max) * 100, month.cumulativeBalance !== 0 ? 5 : 0)}%` }} />
            </div>
            <span className="text-xs font-semibold uppercase text-slate-400">{month.label}</span>
            <span className={month.cumulativeBalance < 0 ? "text-xs font-bold text-rose-300" : "text-xs font-bold text-cyan-200"}>{compactCurrency(month.cumulativeBalance)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-cyan-300" /> Saldo positivo</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-rose-400" /> Saldo negativo</span>
      </div>
    </div>
  );
}

function ProjectionMonthCard({ month }: { month: ProjectionMonth }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-50">{month.label}</p>
          <p className="mt-1 text-xs text-slate-400">Meta: {formatCurrency(month.savingsTarget)} · Financiamentos: {formatCurrency(month.financingImpact)}</p>
        </div>
        <span className={badgeClass(month.risk)}>{statusLabel(month.risk)}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <InfoBox label="Entradas" value={formatCurrency(month.projectedIncome)} className="text-emerald-300" />
        <InfoBox label="Saídas" value={formatCurrency(month.projectedExpenses)} className="text-rose-300" />
        <InfoBox label="Saldo do mês" value={formatCurrency(month.projectedBalance)} className={month.projectedBalance < 0 ? "text-rose-300" : "text-cyan-200"} />
        <InfoBox label="Saldo acumulado" value={formatCurrency(month.cumulativeBalance)} className={month.cumulativeBalance < 0 ? "text-rose-300" : "text-slate-50"} />
      </div>
      <div className="mt-3 grid gap-2">
        {month.alerts.slice(0, 2).map((alert) => <p key={alert} className="text-xs text-slate-400">{alert}</p>)}
      </div>
    </div>
  );
}

function InfoBox({ label, value, className }: { label: string; value: string; className: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><p className="text-xs text-slate-400">{label}</p><p className={`mt-1 font-black ${className}`}>{value}</p></div>;
}

function statusLabel(status: ProjectionStatus) {
  return status === "critical" ? "Crítico" : status === "attention" ? "Atenção" : "Saudável";
}

function badgeClass(status: ProjectionStatus) {
  return status === "critical" ? "rounded-full bg-rose-400/12 px-3 py-1 text-xs font-bold text-rose-200" : status === "attention" ? "rounded-full bg-[#f5c76b]/15 px-3 py-1 text-xs font-bold text-[#f5c76b]" : "rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-bold text-emerald-200";
}

function statusClass(status: ProjectionStatus) {
  return status === "critical" ? "flex items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-400/[0.10] p-4 font-semibold text-rose-100" : status === "attention" ? "flex items-center gap-2 rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 font-semibold text-[#fff3c4]" : "flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4 font-semibold text-emerald-100";
}

function compactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")} mil`;
  return formatCurrency(value);
}

function ProjectionSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />)}</div>;
}

function StateMessage({ tone, title, description }: { tone: "error" | "empty"; title: string; description: string }) {
  const className = tone === "error" ? "border-rose-300/20 bg-rose-400/[0.10] text-rose-100" : "border-cyan-300/20 bg-cyan-400/[0.10] text-cyan-100";
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-80">{description}</p></div>;
}
