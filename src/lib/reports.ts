import type { Account, Category, FinancialEntry, SavingsGoal } from "@/types/database";
import { entryActualAmount, formatCurrency, summarizeEntries } from "@/lib/finance";

export type ReportDistributionRow = {
  id: string;
  name: string;
  color: string | null;
  expectedIncome: number;
  actualIncome: number;
  expectedExpenses: number;
  actualExpenses: number;
  expectedBalance: number;
  actualBalance: number;
  total: number;
};

export type MonthlyReport = ReturnType<typeof buildMonthlyReport>;
export type AnnualReport = ReturnType<typeof buildAnnualReport>;

export function buildMonthlyReport(entries: FinancialEntry[], accounts: Account[], categories: Category[], goals: SavingsGoal[]) {
  const summary = summarizeEntries(entries);
  const goal = goals.find((item) => item.is_active) ?? null;
  const savingsPlanned = Number(goal?.monthly_target ?? 0);
  const savingsActual = summary.actualBalance;
  const paidEntries = entries.filter((entry) => entry.status === "paid");
  const pendingEntries = entries
    .filter((entry) => entry.status === "planned")
    .sort((first, second) => new Date(first.due_date).getTime() - new Date(second.due_date).getTime());

  return {
    entries,
    summary,
    difference: {
      income: summary.actualIncome - summary.expectedIncome,
      expenses: summary.actualExpenses - summary.expectedExpenses,
      balance: summary.actualBalance - summary.expectedBalance,
    },
    savings: {
      goal,
      planned: savingsPlanned,
      actual: savingsActual,
      reached: savingsPlanned > 0 ? savingsActual >= savingsPlanned : null,
      percent: savingsPlanned > 0 ? Math.max(0, Math.min(100, (savingsActual / savingsPlanned) * 100)) : 0,
    },
    byCategory: distributionByCategory(entries, categories),
    byAccount: distributionByAccount(entries, accounts),
    topExpenses: paidEntries
      .filter((entry) => entry.entry_type === "expense")
      .sort((first, second) => entryActualAmount(second) - entryActualAmount(first))
      .slice(0, 5),
    topIncome: paidEntries
      .filter((entry) => entry.entry_type === "income")
      .sort((first, second) => entryActualAmount(second) - entryActualAmount(first))
      .slice(0, 5),
    pendingEntries,
    insights: buildMonthlyInsights(summary, savingsPlanned),
  };
}

export function buildAnnualReport(entries: FinancialEntry[], accounts: Account[], categories: Category[], goals: SavingsGoal[], year: number) {
  const summary = summarizeEntries(entries);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthEntries = entries.filter((entry) => entry.due_date.startsWith(`${year}-${String(month).padStart(2, "0")}`));
    const monthSummary = summarizeEntries(monthEntries);
    return {
      month,
      label: new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      entries: monthEntries.length,
      ...monthSummary,
      differenceIncome: monthSummary.actualIncome - monthSummary.expectedIncome,
      differenceExpenses: monthSummary.actualExpenses - monthSummary.expectedExpenses,
      differenceBalance: monthSummary.actualBalance - monthSummary.expectedBalance,
    };
  });
  const monthsWithPaidEntries = months.filter((month) => month.actualIncome > 0 || month.actualExpenses > 0);
  const monthsWithAnyEntries = months.filter((month) => month.entries > 0);
  const bestMonth = [...monthsWithPaidEntries].sort((first, second) => second.actualBalance - first.actualBalance)[0] ?? null;
  const worstMonth = [...monthsWithPaidEntries].sort((first, second) => first.actualBalance - second.actualBalance)[0] ?? null;
  const divisor = Math.max(monthsWithPaidEntries.length, 1);
  const goal = goals.find((item) => item.is_active) ?? null;
  const savingsPlanned = Number(goal?.monthly_target ?? 0) * 12;
  const now = new Date();
  const currentMonthMarker = now.getFullYear() * 100 + now.getMonth() + 1;
  const futurePlannedBalance = months
    .filter((month) => (year * 100 + month.month) > currentMonthMarker && month.actualIncome === 0 && month.actualExpenses === 0 && month.expectedBalance !== 0)
    .reduce((total, month) => total + month.expectedBalance, 0);

  return {
    summary,
    months,
    byCategory: distributionByCategory(entries, categories),
    byAccount: distributionByAccount(entries, accounts),
    savings: {
      goal,
      planned: savingsPlanned,
      actual: summary.actualBalance,
      reached: savingsPlanned > 0 ? summary.actualBalance >= savingsPlanned : null,
      percent: savingsPlanned > 0 ? Math.max(0, Math.min(100, (summary.actualBalance / savingsPlanned) * 100)) : 0,
    },
    bestMonth,
    worstMonth,
    averages: {
      income: summary.actualIncome / divisor,
      expenses: summary.actualExpenses / divisor,
      balance: summary.actualBalance / divisor,
    },
    projection: {
      hasFuturePlanned: futurePlannedBalance !== 0,
      projectedBalance: summary.actualBalance + futurePlannedBalance,
      monthsWithData: monthsWithAnyEntries.length,
    },
  };
}

function distributionByCategory(entries: FinancialEntry[], categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return distributionByKey(entries, (entry) => {
    const category = entry.category_id ? byId.get(entry.category_id) : null;
    return {
      id: category?.id ?? "sem-classificacao",
      name: category?.name ?? "Sem classificação",
      color: category?.color ?? null,
    };
  });
}

function distributionByAccount(entries: FinancialEntry[], accounts: Account[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return distributionByKey(entries, (entry) => {
    const account = entry.account_id ? byId.get(entry.account_id) : null;
    return {
      id: account?.id ?? "sem-conta",
      name: account?.name ?? "Sem conta",
      color: account?.color ?? null,
    };
  });
}

function distributionByKey(entries: FinancialEntry[], getKey: (entry: FinancialEntry) => { id: string; name: string; color: string | null }) {
  const rows = entries.reduce<Map<string, ReportDistributionRow>>((map, entry) => {
    const key = getKey(entry);
    const row = map.get(key.id) ?? {
      id: key.id,
      name: key.name,
      color: key.color,
      expectedIncome: 0,
      actualIncome: 0,
      expectedExpenses: 0,
      actualExpenses: 0,
      expectedBalance: 0,
      actualBalance: 0,
      total: 0,
    };

    if (entry.entry_type === "income") {
      row.expectedIncome += Number(entry.expected_amount);
      if (entry.status === "paid") row.actualIncome += entryActualAmount(entry);
    } else {
      row.expectedExpenses += Number(entry.expected_amount);
      if (entry.status === "paid") row.actualExpenses += entryActualAmount(entry);
    }

    row.expectedBalance = row.expectedIncome - row.expectedExpenses;
    row.actualBalance = row.actualIncome - row.actualExpenses;
    row.total = row.actualIncome + row.actualExpenses;
    map.set(key.id, row);
    return map;
  }, new Map());

  return Array.from(rows.values()).sort((first, second) => second.total - first.total);
}

function buildMonthlyInsights(summary: ReturnType<typeof summarizeEntries>, savingsPlanned: number) {
  const insights: string[] = [];
  if (summary.expectedExpenses > 0 && summary.actualExpenses > summary.expectedExpenses) {
    insights.push(`Saídas ficaram acima do planejado em ${formatCurrency(summary.actualExpenses - summary.expectedExpenses)}.`);
  }
  if (summary.expectedIncome > 0 && summary.actualIncome < summary.expectedIncome) {
    insights.push(`Entradas ficaram abaixo do esperado em ${formatCurrency(summary.expectedIncome - summary.actualIncome)}.`);
  }
  if (savingsPlanned > 0) {
    insights.push(summary.actualBalance >= savingsPlanned ? "Meta de economia atingida neste mês." : `Meta de economia ainda não atingida: faltam ${formatCurrency(savingsPlanned - summary.actualBalance)}.`);
  }
  if (insights.length === 0) insights.push("Mês sem alertas críticos nos comparativos principais.");
  return insights;
}
