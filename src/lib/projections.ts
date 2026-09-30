import type { Account, Budget, Category, FinancialEntry, Financing, RecurringRule, SavingsGoal } from "@/types/database";
import { dueDateForMonth, entryActualSignedAmount, entryProjectedSignedAmount, monthKey, recurringRuleAppliesToMonth } from "@/lib/finance";

export type ProjectionStatus = "healthy" | "attention" | "critical";

export type ProjectionMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
  plannedIncome: number;
  plannedExpenses: number;
  trendIncome: number;
  trendExpenses: number;
  projectedIncome: number;
  projectedExpenses: number;
  projectedBalance: number;
  cumulativeBalance: number;
  savingsTarget: number;
  savingsGap: number;
  financingImpact: number;
  risk: ProjectionStatus;
  alerts: string[];
};

export type ProjectionSummary = {
  months: ProjectionMonth[];
  totalProjectedIncome: number;
  totalProjectedExpenses: number;
  finalProjectedBalance: number;
  monthsAtRisk: number;
  savingsTargetTotal: number;
  financingImpactTotal: number;
  status: ProjectionStatus;
  assumptions: string[];
  alerts: string[];
  variableAverage: { income: number; expenses: number; monthsUsed: number; windowMonths: number };
};

type BuildProjectionInput = {
  startYear: number;
  startMonth: number;
  months?: number;
  averageWindowMonths?: number;
  entries: FinancialEntry[];
  recurringRules: RecurringRule[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  financings: Financing[];
  accounts: Account[];
  categories?: Category[];
};

export function buildFinancialProjection(input: BuildProjectionInput): ProjectionSummary {
  const monthsToProject = input.months ?? 6;
  const averageWindowMonths = input.averageWindowMonths ?? 3;
  const projectionMonths = Array.from({ length: monthsToProject }, (_, index) => addMonths(input.startYear, input.startMonth, index));
  const firstMonth = projectionMonths[0]!;
  const firstMonthKey = monthKey(firstMonth.year, firstMonth.month);
  const startingBalance = currentBalanceBeforeMonth(input.accounts, input.entries, firstMonthKey);
  const categoryById = new Map((input.categories ?? []).map((category) => [category.id, category]));
  const variableAverage = variableAverages(input.entries, categoryById, input.startYear, input.startMonth, averageWindowMonths);
  const activeGoal = input.savingsGoals.find((goal) => goal.is_active) ?? null;
  const savingsTarget = Number(activeGoal?.monthly_target ?? 0);
  let cumulativeBalance = startingBalance;

  const months = projectionMonths.map(({ year, month }) => {
    const key = monthKey(year, month);
    const entries = input.entries.filter((entry) => entry.due_date.startsWith(key));
    const explicit = summarizeExplicitEntries(entries);
    const missingRecurring = summarizeMissingRecurring(input.recurringRules, entries, year, month);
    const missingFinancing = summarizeMissingFinancing(input.financings, entries, year, month);
    const budgetTopUp = summarizeBudgetTopUp(input.budgets, entries, year, month);

    const plannedIncome = roundMoney(explicit.income + missingRecurring.income);
    const plannedExpenses = roundMoney(explicit.expenses + missingRecurring.expenses + missingFinancing.expenses + budgetTopUp.expenses);
    const trendIncome = roundMoney(missingRecurring.income + variableAverage.income);
    const trendExpenses = roundMoney(missingRecurring.expenses + missingFinancing.expenses + variableAverage.expenses);
    const projectedIncome = roundMoney(plannedIncome > 0 ? plannedIncome : trendIncome);
    const projectedExpenses = roundMoney(Math.max(plannedExpenses, trendExpenses));
    const projectedBalance = roundMoney(projectedIncome - projectedExpenses);
    cumulativeBalance = roundMoney(cumulativeBalance + projectedBalance);
    const savingsGap = roundMoney(Math.max(0, savingsTarget - projectedBalance));
    const risk = projectionRisk({ projectedIncome, projectedExpenses, projectedBalance, cumulativeBalance, savingsTarget, financingImpact: missingFinancing.expenses + explicit.financingExpenses });
    const alerts = buildMonthAlerts({ projectedIncome, projectedExpenses, projectedBalance, cumulativeBalance, savingsTarget, financingImpact: missingFinancing.expenses + explicit.financingExpenses, risk });

    return {
      key,
      year,
      month,
      label: new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
      plannedIncome,
      plannedExpenses,
      trendIncome,
      trendExpenses,
      projectedIncome,
      projectedExpenses,
      projectedBalance,
      cumulativeBalance,
      savingsTarget,
      savingsGap,
      financingImpact: roundMoney(missingFinancing.expenses + explicit.financingExpenses),
      risk,
      alerts,
    };
  });

  const totalProjectedIncome = roundMoney(months.reduce((total, month) => total + month.projectedIncome, 0));
  const totalProjectedExpenses = roundMoney(months.reduce((total, month) => total + month.projectedExpenses, 0));
  const finalProjectedBalance = months.at(-1)?.cumulativeBalance ?? startingBalance;
  const monthsAtRisk = months.filter((month) => month.risk === "critical").length;
  const savingsTargetTotal = roundMoney(months.reduce((total, month) => total + month.savingsTarget, 0));
  const financingImpactTotal = roundMoney(months.reduce((total, month) => total + month.financingImpact, 0));
  const status: ProjectionStatus = months.some((month) => month.risk === "critical") ? "critical" : months.some((month) => month.risk === "attention") ? "attention" : "healthy";

  return {
    months,
    totalProjectedIncome,
    totalProjectedExpenses,
    finalProjectedBalance,
    monthsAtRisk,
    savingsTargetTotal,
    financingImpactTotal,
    status,
    assumptions: [
      `Janela principal: mês atual + ${monthsToProject - 1} meses futuros.`,
      `Média variável: últimos ${averageWindowMonths} meses realizados, ignorando recorrências e financiamentos.`,
      "Lançamentos previstos e realizados do período têm prioridade sobre médias históricas.",
      "Recorrências ativas entram quando ainda não existe lançamento gerado para o mês.",
      "Orçamentos completam despesas por classificação quando o planejado está maior que os lançamentos existentes.",
      "Financiamentos ativos entram pelo lançamento já gerado ou pela parcela estimada do contrato.",
      "A IA não participa do cálculo; ela pode apenas explicar dados em outra área do app.",
    ],
    alerts: buildProjectionAlerts(months),
    variableAverage,
  };
}

function summarizeExplicitEntries(entries: FinancialEntry[]) {
  return entries.reduce((summary, entry) => {
    const projected = Math.abs(entryProjectedSignedAmount(entry));
    if (entry.entry_type === "income") summary.income += projected;
    if (entry.entry_type === "expense") summary.expenses += projected;
    if (entry.entry_type === "expense" && (entry.source === "financing" || entry.financing_id)) summary.financingExpenses += projected;
    return summary;
  }, { income: 0, expenses: 0, financingExpenses: 0 });
}

function summarizeMissingRecurring(rules: RecurringRule[], entries: FinancialEntry[], year: number, month: number) {
  return rules.filter((rule) => recurringRuleAppliesToMonth(rule, year, month) && !entries.some((entry) => entry.recurring_rule_id === rule.id)).reduce((summary, rule) => {
    if (rule.entry_type === "income") summary.income += Number(rule.amount);
    if (rule.entry_type === "expense") summary.expenses += Number(rule.amount);
    return summary;
  }, { income: 0, expenses: 0 });
}

function summarizeMissingFinancing(financings: Financing[], entries: FinancialEntry[], year: number, month: number) {
  const expenses = financings.filter((financing) => financing.status === "active" && financingAppliesToMonth(financing, year, month) && !entries.some((entry) => entry.financing_id === financing.id && entry.installment_year === year && entry.installment_month === month)).reduce((total, financing) => total + Number(financing.installment_amount), 0);
  return { expenses };
}

function summarizeBudgetTopUp(budgets: Budget[], entries: FinancialEntry[], year: number, month: number) {
  const monthBudgets = budgets.filter((budget) => budget.year === year && budget.month === month);
  const expensesByCategory = entries.filter((entry) => entry.entry_type === "expense" && entry.category_id).reduce<Map<string, number>>((map, entry) => {
    const categoryId = String(entry.category_id);
    map.set(categoryId, (map.get(categoryId) ?? 0) + Math.abs(entryProjectedSignedAmount(entry)));
    return map;
  }, new Map());
  const expenses = monthBudgets.reduce((total, budget) => total + Math.max(0, Number(budget.planned_amount) - (expensesByCategory.get(budget.category_id) ?? 0)), 0);
  return { expenses };
}

function variableAverages(entries: FinancialEntry[], categoryById: Map<string, Category>, startYear: number, startMonth: number, windowMonths: number) {
  const historicalMonths = Array.from({ length: windowMonths }, (_, index) => addMonths(startYear, startMonth, -windowMonths + index));
  const historicalKeys = new Set(historicalMonths.map((item) => monthKey(item.year, item.month)));
  const totals = new Map<string, { income: number; expenses: number }>();
  for (const key of historicalKeys) totals.set(key, { income: 0, expenses: 0 });

  for (const entry of entries) {
    const key = entry.due_date.slice(0, 7);
    if (entry.status !== "paid" || !historicalKeys.has(key) || !isVariableEntry(entry, categoryById)) continue;
    const row = totals.get(key)!;
    const amount = Math.abs(entryActualSignedAmount(entry));
    if (entry.entry_type === "income") row.income += amount;
    if (entry.entry_type === "expense") row.expenses += amount;
  }

  const monthsUsed = Math.max(totals.size, 1);
  const totalIncome = Array.from(totals.values()).reduce((total, row) => total + row.income, 0);
  const totalExpenses = Array.from(totals.values()).reduce((total, row) => total + row.expenses, 0);
  return { income: roundMoney(totalIncome / monthsUsed), expenses: roundMoney(totalExpenses / monthsUsed), monthsUsed, windowMonths };
}

function isVariableEntry(entry: FinancialEntry, categoryById: Map<string, Category>) {
  if (entry.source === "recurring" || entry.source === "financing" || entry.financing_id) return false;
  const category = entry.category_id ? categoryById.get(entry.category_id) : null;
  if (category?.name.toLowerCase().includes("fix")) return false;
  return true;
}

function currentBalanceBeforeMonth(accounts: Account[], entries: FinancialEntry[], startMonthKey: string) {
  const initial = accounts.reduce((total, account) => total + Number(account.initial_balance ?? 0), 0);
  return roundMoney(entries.filter((entry) => entry.status === "paid" && (entry.paid_date ?? entry.due_date).slice(0, 7) < startMonthKey).reduce((total, entry) => total + entryActualSignedAmount(entry), initial));
}

function financingAppliesToMonth(financing: Financing, year: number, month: number) {
  const start = new Date(`${financing.start_date}T00:00:00`);
  const startMarker = start.getFullYear() * 12 + start.getMonth();
  const targetMarker = year * 12 + month - 1;
  const monthsSinceStart = targetMarker - startMarker;
  const installmentNumber = monthsSinceStart + 1;
  return installmentNumber > financing.paid_installments && installmentNumber <= financing.total_installments && dueDateForMonth(financing.due_day, year, month) >= financing.start_date;
}

function projectionRisk(input: { projectedIncome: number; projectedExpenses: number; projectedBalance: number; cumulativeBalance: number; savingsTarget: number; financingImpact: number }): ProjectionStatus {
  if (input.cumulativeBalance < 0 || input.projectedBalance < 0 || input.projectedExpenses > input.projectedIncome) return "critical";
  if (input.projectedBalance < input.savingsTarget || (input.projectedIncome > 0 && input.financingImpact / input.projectedIncome > 0.25)) return "attention";
  return "healthy";
}

function buildMonthAlerts(input: { projectedIncome: number; projectedExpenses: number; projectedBalance: number; cumulativeBalance: number; savingsTarget: number; financingImpact: number; risk: ProjectionStatus }) {
  const alerts: string[] = [];
  if (input.cumulativeBalance < 0) alerts.push("Saldo acumulado projetado fica negativo.");
  if (input.projectedBalance < 0) alerts.push("Mês projetado fecha no negativo.");
  if (input.projectedExpenses > input.projectedIncome) alerts.push("Saídas projetadas maiores que entradas.");
  if (input.savingsTarget > 0 && input.projectedBalance < input.savingsTarget) alerts.push("Meta mensal de economia não é atingida.");
  if (input.projectedIncome > 0 && input.financingImpact / input.projectedIncome > 0.25) alerts.push("Financiamentos passam de 25% das entradas projetadas.");
  if (alerts.length === 0 && input.risk === "healthy") alerts.push("Mês projetado saudável dentro das premissas atuais.");
  return alerts;
}

function buildProjectionAlerts(months: ProjectionMonth[]) {
  const alerts: string[] = [];
  const negativeMonth = months.find((month) => month.cumulativeBalance < 0 || month.projectedBalance < 0);
  if (negativeMonth) alerts.push(`${negativeMonth.label}: risco de saldo negativo na projeção.`);
  const deficitMonth = months.find((month) => month.projectedExpenses > month.projectedIncome);
  if (deficitMonth) alerts.push(`${deficitMonth.label}: saídas projetadas maiores que entradas.`);
  const goalMonth = months.find((month) => month.savingsTarget > 0 && month.projectedBalance < month.savingsTarget);
  if (goalMonth) alerts.push(`${goalMonth.label}: meta de economia prevista não é atingida.`);
  const financingMonth = months.find((month) => month.projectedIncome > 0 && month.financingImpact / month.projectedIncome > 0.25);
  if (financingMonth) alerts.push(`${financingMonth.label}: financiamentos comprometem mais de 25% das entradas.`);
  if (alerts.length === 0) alerts.push("Nenhum alerta crítico nas premissas atuais da projeção.");
  return alerts;
}

function addMonths(year: number, month: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}
