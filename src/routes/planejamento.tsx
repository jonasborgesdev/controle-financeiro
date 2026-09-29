import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  activeSavingsGoal,
  budgetTone,
  dueDateForMonth,
  expensesByBudget,
  formatCurrency,
  isFinanceClassification,
  monthLabel,
  parseMonthKey,
  recurringRuleAppliesToMonth,
  shiftMonth,
  summarizeEntries,
} from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Budget, Category, FinancialEntry, MonthlyBalance, RecurringRule, SavingsGoal } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);

type GoalForm = {
  name: string;
  target_amount: string;
  current_amount: string;
  monthly_target: string;
  deadline: string;
};

const emptyGoalForm: GoalForm = {
  name: "Meta mensal de economia",
  target_amount: "600",
  current_amount: "0",
  monthly_target: "50",
  deadline: "",
};

const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,notes,created_at,updated_at";
const ruleColumns = "id,user_id,account_id,category_id,entry_type,description,amount,day_of_month,start_year,start_month,end_year,end_month,is_active,notes,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const budgetColumns = "id,user_id,category_id,year,month,planned_amount,created_at,updated_at";
const goalColumns = "id,user_id,name,target_amount,current_amount,monthly_target,deadline,is_active,created_at,updated_at";

export const Route = createFileRoute("/planejamento")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: PlanningPage,
});

function PlanningPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { year, month } = parseMonthKey(selectedMonth);
  const summary = summarizeEntries(entries);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleExpenseCategories = categories.filter((category) => category.type === "expense" && isFinanceClassification(category, user.id));
  const plannedRows = expensesByBudget(visibleExpenseCategories, budgets, entries);
  const activeGoal = activeSavingsGoal(goals);
  const goalProgress = activeGoal && activeGoal.monthly_target > 0 ? Math.max(0, Math.min(100, (summary.actualBalance / Number(activeGoal.monthly_target)) * 100)) : 0;
  const recurringEntries = entries.filter((entry) => entry.source === "recurring");
  const dueIncome = recurringEntries.filter((entry) => entry.entry_type === "income" && entry.status === "planned");
  const monthRules = rules.filter((rule) => recurringRuleAppliesToMonth(rule, year, month));
  const alerts = buildAlerts(summary, plannedRows, dueIncome, activeGoal);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const [entriesResult, rulesResult, accountsResult, categoriesResult, budgetsResult, goalsResult] = await Promise.all([
      supabase.from("financial_entries").select(entryColumns).gte("due_date", startDate).lte("due_date", endDate).order("due_date"),
      supabase.from("recurring_rules").select(ruleColumns).order("is_active", { ascending: false }).order("description"),
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).order("type").order("name"),
      supabase.from("budgets").select(budgetColumns).eq("year", year).eq("month", month),
      supabase.from("savings_goals").select(goalColumns).order("is_active", { ascending: false }).order("created_at", { ascending: false }).limit(3),
    ]);

    const requestError = entriesResult.error ?? rulesResult.error ?? accountsResult.error ?? categoriesResult.error ?? budgetsResult.error ?? goalsResult.error;
    if (requestError) setError(requestError.message);
    setEntries(entriesResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setBudgets(budgetsResult.data ?? []);
    setGoals(goalsResult.data ?? []);
    setBudgetDrafts(Object.fromEntries((budgetsResult.data ?? []).map((budget) => [budget.category_id, String(budget.planned_amount)])));
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth]);

  const ensureMonthlyBalance = async () => {
    const payload = { user_id: user.id, year, month, label: monthLabel(year, month) };
    const { data, error: balanceError } = await supabase.from("monthly_balances").upsert(payload, { onConflict: "user_id,year,month" }).select("*").single();
    if (balanceError) throw balanceError;
    return data as MonthlyBalance;
  };

  const generateMonthEntries = async () => {
    setSaving(true);
    setError(null);
    try {
      const balance = await ensureMonthlyBalance();
      const rows = monthRules.map((rule) => ({
        user_id: user.id,
        monthly_balance_id: balance.id,
        account_id: rule.account_id,
        category_id: rule.category_id,
        entry_type: rule.entry_type,
        status: "planned" as const,
        description: rule.description,
        expected_amount: Number(rule.amount),
        actual_amount: null,
        due_date: dueDateForMonth(rule.day_of_month, year, month),
        paid_date: null,
        source: "recurring" as const,
        recurring_rule_id: rule.id,
        notes: rule.notes,
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase.from("financial_entries").upsert(rows, { onConflict: "recurring_rule_id,monthly_balance_id" });
        if (upsertError) throw upsertError;
      }
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao gerar recorrências do mês.");
    }
    setSaving(false);
  };

  const confirmEntry = async (entry: FinancialEntry) => {
    setSaving(true);
    const { error: updateError } = await supabase
      .from("financial_entries")
      .update({ status: "paid", actual_amount: Number(entry.expected_amount), paid_date: new Date().toISOString().slice(0, 10) })
      .eq("id", entry.id);
    if (updateError) setError(updateError.message);
    await loadData();
    setSaving(false);
  };

  const saveBudget = async (category: Category) => {
    const plannedAmount = Number(budgetDrafts[category.id] || 0);
    const { error: upsertError } = await supabase.from("budgets").upsert(
      { user_id: user.id, category_id: category.id, year, month, planned_amount: plannedAmount },
      { onConflict: "user_id,category_id,year,month" },
    );
    if (upsertError) setError(upsertError.message);
    await loadData();
  };

  const openGoalModal = () => {
    if (activeGoal) {
      setGoalForm({
        name: activeGoal.name,
        target_amount: String(activeGoal.target_amount),
        current_amount: String(activeGoal.current_amount),
        monthly_target: String(activeGoal.monthly_target),
        deadline: activeGoal.deadline ?? "",
      });
    } else {
      setGoalForm(emptyGoalForm);
    }
    setGoalModalOpen(true);
  };

  const saveGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: goalForm.name.trim(),
      target_amount: Number(goalForm.target_amount || 0),
      current_amount: Number(goalForm.current_amount || 0),
      monthly_target: Number(goalForm.monthly_target || 0),
      deadline: goalForm.deadline || null,
      is_active: true,
    };
    const result = activeGoal ? await supabase.from("savings_goals").update(payload).eq("id", activeGoal.id) : await supabase.from("savings_goals").insert(payload);
    if (result.error) setError(result.error.message);
    setGoalModalOpen(false);
    await loadData();
    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2rem] p-5 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Planejamento mensal</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-[-0.05em] sm:text-5xl">Previsto, realizado e orçamento no mesmo lugar.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">Use os fixos para gerar o mês, confirme o que virou real e acompanhe limites por classificação.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>Anterior</Button>
                <Button type="button" variant="outline" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>Próximo</Button>
              </div>
              <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </div>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-400/[0.10] p-4 text-sm text-rose-100">{error}</div> : null}
        {loading ? <p className="text-sm text-slate-400">Carregando planejamento...</p> : null}

        {!loading ? (
          <>
            <PlanningOverview summary={summary} goal={activeGoal} />

            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Fixos previstos no mês</CardTitle>
                      <CardDescription>{monthRules.length} recorrência(s) aplicável(is) em {monthLabel(year, month)}.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={generateMonthEntries} disabled={saving}>{saving ? "Gerando..." : "Gerar/aplicar mês"}</Button>
                      <Link to="/recorrencias" className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.10]">Gerenciar fixos</Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {recurringEntries.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-50">{entry.description}</p>
                              <span className={entry.entry_type === "income" ? "rounded-full bg-emerald-400/12 px-2 py-0.5 text-xs text-emerald-200" : "rounded-full bg-rose-400/12 px-2 py-0.5 text-xs text-rose-200"}>{entry.entry_type === "income" ? "Entrada" : "Saída"}</span>
                              <span className="rounded-full bg-[#f5c76b]/15 px-2 py-0.5 text-xs text-[#f5c76b]">{entry.status === "paid" ? "Realizado" : "Previsto"}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-400">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {entry.account_id ? accountById.get(entry.account_id)?.name ?? "Conta" : "Sem conta"} · {entry.category_id ? categoryById.get(entry.category_id)?.name ?? "Classificação" : "Sem classificação"}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <p className={entry.entry_type === "income" ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>{formatCurrency(Number(entry.expected_amount))}</p>
                            {entry.status === "planned" ? <Button type="button" variant="outline" onClick={() => confirmEntry(entry)} disabled={saving}>Confirmar</Button> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                    {recurringEntries.length === 0 ? <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] p-4 text-sm text-cyan-100">Nenhum fixo gerado neste mês. Clique em gerar/aplicar para criar os previstos sem duplicar.</p> : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Meta de economia</CardTitle>
                      <CardDescription>Comparada ao saldo realizado do mês.</CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={openGoalModal}>{activeGoal ? "Editar" : "Criar"}</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeGoal ? (
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold text-slate-50">{activeGoal.name}</p>
                        <p className="mt-1 text-sm text-slate-400">Meta mensal: {formatCurrency(Number(activeGoal.monthly_target))}</p>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[#f5c76b]" style={{ width: `${goalProgress}%` }} />
                      </div>
                      <p className="text-sm text-slate-300">Saldo realizado: <strong>{formatCurrency(summary.actualBalance)}</strong> · Progresso: {goalProgress.toFixed(0)}%</p>
                    </div>
                  ) : <p className="text-sm text-slate-400">Nenhuma meta ativa cadastrada. Sugestão inicial: guardar R$ 50 por mês.</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Orçamento mensal por classificação</CardTitle>
                <CardDescription>Defina o planejado, acompanhe realizado e veja a diferença.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {visibleExpenseCategories.map((category) => {
                    const row = plannedRows.find((item) => item.category.id === category.id);
                    const tone = budgetTone(row?.percent ?? 0);
                    return (
                      <div key={category.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-50">{category.name}</p>
                              <span className={toneClass(tone)}>{toneLabel(tone)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-400">Realizado: {formatCurrency(row?.actual ?? 0)} · Diferença: {formatCurrency(row?.difference ?? Number(budgetDrafts[category.id] || 0))}</p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[10rem_auto]">
                            <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Valor planejado" value={budgetDrafts[category.id] ?? ""} onChange={(event) => setBudgetDrafts({ ...budgetDrafts, [category.id]: event.target.value })} />
                            <Button type="button" variant="outline" onClick={() => saveBudget(category)}>Salvar</Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alertas básicos</CardTitle>
                <CardDescription>Sinais rápidos para revisar o mês.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {alerts.map((alert) => <div key={alert} className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-sm text-[#fff3c4]">{alert}</div>)}
                  {alerts.length === 0 ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">Sem alertas críticos neste mês.</div> : null}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Modal title="Meta de economia" description="Defina a meta mensal para comparar com o saldo realizado." open={goalModalOpen} onClose={() => setGoalModalOpen(false)}>
        <form className="grid gap-4" onSubmit={saveGoal}>
          <div className="space-y-2">
            <Label htmlFor="goal-name">Nome</Label>
            <Input id="goal-name" value={goalForm.name} onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="goal-target">Meta total</Label>
              <Input id="goal-target" type="number" min="0" step="0.01" inputMode="decimal" value={goalForm.target_amount} onChange={(event) => setGoalForm({ ...goalForm, target_amount: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-current">Acumulado</Label>
              <Input id="goal-current" type="number" min="0" step="0.01" inputMode="decimal" value={goalForm.current_amount} onChange={(event) => setGoalForm({ ...goalForm, current_amount: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-monthly">Meta mensal</Label>
              <Input id="goal-monthly" type="number" min="0" step="0.01" inputMode="decimal" value={goalForm.monthly_target} onChange={(event) => setGoalForm({ ...goalForm, monthly_target: event.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-deadline">Prazo opcional</Label>
            <Input id="goal-deadline" type="date" value={goalForm.deadline} onChange={(event) => setGoalForm({ ...goalForm, deadline: event.target.value })} />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar meta"}</Button>
        </form>
      </Modal>
    </AppShell>
  );
}

function PlanningOverview({ summary, goal }: { summary: ReturnType<typeof summarizeEntries>; goal: SavingsGoal | null }) {
  const incomeProgress = percentOf(summary.actualIncome, summary.expectedIncome);
  const expenseProgress = percentOf(summary.actualExpenses, summary.expectedExpenses);
  const goalTarget = Number(goal?.monthly_target ?? 0);
  const goalProgress = goalTarget > 0 ? Math.max(0, Math.min(100, (summary.actualBalance / goalTarget) * 100)) : 0;
  const balanceTone = summary.actualBalance < 0 ? "text-rose-300" : summary.actualBalance >= summary.expectedBalance ? "text-emerald-300" : "text-cyan-300";

  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/70 text-white shadow-2xl shadow-slate-950/20">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="text-sm font-semibold text-cyan-300">Mapa do mês</p>
              <h3 className="mt-1 text-2xl font-black tracking-[-0.035em] text-white">Planejado vs realizado</h3>
              <p className="mt-2 text-sm text-slate-300">Quanto do mês já aconteceu em relação ao que estava previsto.</p>
            </div>

            <div className="space-y-5">
              <FlowBar
                label="Entradas"
                planned={summary.expectedIncome}
                actual={summary.actualIncome}
                progress={incomeProgress}
                trackClassName="bg-emerald-400/20"
                fillClassName="bg-emerald-400"
                valueClassName="text-emerald-300"
              />
              <FlowBar
                label="Saídas"
                planned={summary.expectedExpenses}
                actual={summary.actualExpenses}
                progress={expenseProgress}
                trackClassName={summary.actualExpenses > summary.expectedExpenses ? "bg-red-400/25" : "bg-amber-400/20"}
                fillClassName={summary.actualExpenses > summary.expectedExpenses ? "bg-red-400" : "bg-amber-400"}
                valueClassName={summary.actualExpenses > summary.expectedExpenses ? "text-red-300" : "text-amber-300"}
              />
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.05] p-5 text-slate-50 sm:p-6 lg:rounded-l-[2rem] lg:border-l lg:border-t-0">
            <div className="grid h-full content-between gap-6">
              <div>
                <p className="text-sm font-medium text-slate-400">Saldo esperado vs realizado</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Esperado</p>
                    <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-50">{formatCurrency(summary.expectedBalance)}</p>
                  </div>
                  <div className={summary.actualBalance < 0 ? "rounded-2xl border border-rose-300/20 bg-rose-400/[0.08] p-4" : "rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4"}>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Realizado</p>
                    <p className={summary.actualBalance < 0 ? "mt-2 text-2xl font-black tracking-[-0.04em] text-rose-300" : "mt-2 text-2xl font-black tracking-[-0.04em] text-emerald-300"}>{formatCurrency(summary.actualBalance)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Meta de economia</p>
                    <p className="mt-1 text-xs text-slate-300">{goal ? `Alvo mensal: ${formatCurrency(goalTarget)}` : "Cadastre uma meta para acompanhar aqui"}</p>
                  </div>
                  <p className={`text-lg font-black ${balanceTone}`}>{goal ? `${goalProgress.toFixed(0)}%` : "-"}</p>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#f5c76b]" style={{ width: `${goal ? goalProgress : 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowBar({ label, planned, actual, progress, trackClassName, fillClassName, valueClassName }: { label: string; planned: number; actual: number; progress: number; trackClassName: string; fillClassName: string; valueClassName: string }) {
  const plannedWidth = planned > 0 ? 100 : 0;
  const actualWidth = Math.min(100, Math.max(progress, actual > 0 ? 8 : 0));

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-400">Realizado {progress.toFixed(0)}% do planejado</p>
        </div>
        <div className="text-right">
          <p className={`font-black ${valueClassName}`}>{formatCurrency(actual)}</p>
          <p className="text-xs text-slate-400">de {formatCurrency(planned)}</p>
        </div>
      </div>
      <div className="h-14 overflow-hidden rounded-2xl bg-white/10 p-1.5">
        <div className={`relative h-full rounded-xl ${trackClassName}`} style={{ width: `${plannedWidth}%` }}>
          <div className={`absolute inset-y-0 left-0 rounded-xl ${fillClassName}`} style={{ width: `${actualWidth}%` }} />
        </div>
      </div>
    </div>
  );
}

function percentOf(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return Math.max(0, (actual / planned) * 100);
}

function buildAlerts(summary: ReturnType<typeof summarizeEntries>, budgetRows: ReturnType<typeof expensesByBudget>, dueIncome: FinancialEntry[], goal: SavingsGoal | null) {
  const alerts: string[] = [];
  if (summary.expectedExpenses > 0 && summary.actualExpenses > summary.expectedExpenses) alerts.push("Saídas realizadas acima do total planejado para o mês.");
  dueIncome.forEach((entry) => alerts.push(`Entrada planejada ainda não realizada: ${entry.description}.`));
  budgetRows.filter((row) => row.planned > 0 && row.actual > row.planned).forEach((row) => alerts.push(`${row.category.name} ultrapassou o orçamento planejado.`));
  if (goal && summary.actualBalance < Number(goal.monthly_target)) alerts.push("Saldo realizado está menor que a meta de economia mensal.");
  return alerts;
}

function toneClass(tone: "emerald" | "amber" | "red") {
  return {
    emerald: "rounded-full bg-emerald-400/12 px-2 py-0.5 text-xs text-emerald-200",
    amber: "rounded-full bg-[#f5c76b]/15 px-2 py-0.5 text-xs text-[#f5c76b]",
    red: "rounded-full bg-rose-400/12 px-2 py-0.5 text-xs text-rose-200",
  }[tone];
}

function toneLabel(tone: "emerald" | "amber" | "red") {
  return { emerald: "Dentro", amber: "Próximo", red: "Ultrapassou" }[tone];
}
