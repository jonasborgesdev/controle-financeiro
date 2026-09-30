import type { Account, Budget, Category, FinancialEntry, MonthlyBalance, RecurringRule, RecurringTransaction, SavingsGoal, Transaction } from "@/types/database";

export const defaultExpenseClassifications = new Set(["Gastos fixos", "Gastos variáveis"]);
export const defaultIncomeClassifications = new Set(["Ganhos fixos", "Ganhos variáveis"]);

export function isFinanceClassification(category: Category, userId: string) {
  if (!category.is_active || category.parent_id !== null) return false;
  if (category.user_id === userId) return true;
  if (category.type === "expense") return defaultExpenseClassifications.has(category.name);
  if (category.type === "income") return defaultIncomeClassifications.has(category.name);
  return false;
}

export function transactionSignedAmount(transaction: Pick<Transaction, "amount" | "type">) {
  if (transaction.type === "expense") return -Number(transaction.amount);
  if (transaction.type === "income") return Number(transaction.amount);
  return 0;
}

export function accountBalance(account: Account, transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.account_id === account.id)
    .reduce((balance, transaction) => balance + transactionSignedAmount(transaction), Number(account.initial_balance ?? 0));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year: year || new Date().getFullYear(), month: month || new Date().getMonth() + 1 };
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function monthBounds(month: string) {
  const { year, month: monthNumber } = parseMonthKey(month);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function shiftMonth(month: string, offset: number) {
  const { year, month: monthNumber } = parseMonthKey(month);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

export function entryExpectedSignedAmount(entry: Pick<FinancialEntry, "entry_type" | "expected_amount" | "status">) {
  return entry.entry_type === "expense" ? -Number(entry.expected_amount) : Number(entry.expected_amount);
}

export function entryActualAmount(entry: Pick<FinancialEntry, "actual_amount" | "expected_amount" | "status">) {
  if (entry.status !== "paid") return 0;
  return Number(entry.actual_amount ?? entry.expected_amount);
}

export function entryDisplayAmount(entry: Pick<FinancialEntry, "actual_amount" | "expected_amount" | "status">) {
  return entry.status === "paid" ? entryActualAmount(entry) : Number(entry.expected_amount);
}

export function entryActualSignedAmount(entry: Pick<FinancialEntry, "entry_type" | "actual_amount" | "expected_amount" | "status">) {
  const value = entryActualAmount(entry);
  return entry.entry_type === "expense" ? -value : value;
}

export function entryProjectedSignedAmount(entry: Pick<FinancialEntry, "entry_type" | "actual_amount" | "expected_amount" | "status">) {
  if (entry.status === "paid") return entryActualSignedAmount(entry);
  return entryExpectedSignedAmount(entry);
}

export function entryEffectiveDate(entry: Pick<FinancialEntry, "due_date" | "paid_date" | "status">) {
  return entry.status === "paid" && entry.paid_date ? entry.paid_date : entry.due_date;
}

export function summarizeEntries(entries: FinancialEntry[]) {
  const expectedIncome = entries.filter((entry) => entry.entry_type === "income").reduce((total, entry) => total + Number(entry.expected_amount), 0);
  const expectedExpenses = entries.filter((entry) => entry.entry_type === "expense").reduce((total, entry) => total + Number(entry.expected_amount), 0);
  const actualIncome = entries.filter((entry) => entry.entry_type === "income" && entry.status === "paid").reduce((total, entry) => total + entryActualAmount(entry), 0);
  const actualExpenses = entries.filter((entry) => entry.entry_type === "expense" && entry.status === "paid").reduce((total, entry) => total + entryActualAmount(entry), 0);

  return {
    expectedIncome,
    expectedExpenses,
    expectedBalance: expectedIncome - expectedExpenses,
    actualIncome,
    actualExpenses,
    actualBalance: actualIncome - actualExpenses,
    remainingIncome: expectedIncome - actualIncome,
    remainingExpenses: expectedExpenses - actualExpenses,
  };
}

export function expensesByBudget(categories: Category[], budgets: Budget[], entries: FinancialEntry[]) {
  const budgetByCategory = new Map(budgets.map((budget) => [budget.category_id, Number(budget.planned_amount)]));

  return categories
    .filter((category) => category.type === "expense")
    .map((category) => {
      const planned = budgetByCategory.get(category.id) ?? 0;
      const actual = entries
        .filter((entry) => entry.entry_type === "expense" && entry.status === "paid" && entry.category_id === category.id)
        .reduce((total, entry) => total + entryActualAmount(entry), 0);
      return {
        category,
        planned,
        actual,
        difference: planned - actual,
        percent: planned > 0 ? (actual / planned) * 100 : actual > 0 ? 100 : 0,
      };
    })
    .filter((row) => row.planned > 0 || row.actual > 0)
    .sort((first, second) => second.planned + second.actual - (first.planned + first.actual));
}

export function budgetTone(percent: number) {
  if (percent > 100) return "red";
  if (percent >= 85) return "amber";
  return "emerald";
}

export function activeSavingsGoal(goals: SavingsGoal[]) {
  return goals.find((goal) => goal.is_active) ?? null;
}

export function accountBalanceFromEntries(account: Account, entries: FinancialEntry[]) {
  return entries
    .filter((entry) => entry.account_id === account.id && entry.status === "paid")
    .reduce((balance, entry) => balance + entryActualSignedAmount(entry), Number(account.initial_balance ?? 0));
}

export function accountProjectedBalanceFromEntries(account: Account, entries: FinancialEntry[]) {
  return entries
    .filter((entry) => entry.account_id === account.id)
    .reduce((balance, entry) => balance + entryProjectedSignedAmount(entry), Number(account.initial_balance ?? 0));
}

export function accountBalancesFromEntries(accounts: Account[], entries: FinancialEntry[]) {
  return accounts.map((account) => ({
    account,
    currentBalance: accountBalanceFromEntries(account, entries),
    projectedBalance: accountProjectedBalanceFromEntries(account, entries),
  }));
}

export function expensesByCategory(entries: FinancialEntry[], categories: Category[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totals = entries
    .filter((entry) => entry.entry_type === "expense")
    .reduce<Map<string, { id: string; name: string; value: number; color: string | null }>>((map, entry) => {
      const category = entry.category_id ? categoryById.get(entry.category_id) : null;
      const id = category?.id ?? "sem-categoria";
      const current = map.get(id) ?? { id, name: category?.name ?? "Sem classificação", value: 0, color: category?.color ?? null };
      current.value += entryDisplayAmount(entry);
      map.set(id, current);
      return map;
    }, new Map());

  return Array.from(totals.values()).sort((first, second) => second.value - first.value);
}

export function latestEntries(entries: FinancialEntry[], limit = 5) {
  return [...entries]
    .sort((first, second) => {
      const dateDiff = new Date(entryEffectiveDate(second)).getTime() - new Date(entryEffectiveDate(first)).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    })
    .slice(0, limit);
}

export function recurringRuleAppliesToMonth(rule: RecurringRule, year: number, month: number) {
  if (!rule.is_active) return false;
  const current = year * 100 + month;
  const start = rule.start_year * 100 + rule.start_month;
  const end = rule.end_year && rule.end_month ? rule.end_year * 100 + rule.end_month : null;
  return current >= start && (!end || current <= end);
}

export function dueDateForMonth(dayOfMonth: number, year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function balanceKey(balance: Pick<MonthlyBalance, "year" | "month">) {
  return monthKey(balance.year, balance.month);
}

export function recurringSignedAmount(recurring: Pick<RecurringTransaction, "amount" | "type">) {
  return recurring.type === "expense" ? -Number(recurring.amount) : Number(recurring.amount);
}

export function isRecurringDueInMonth(recurring: RecurringTransaction, month: string) {
  const monthStart = `${month}-01`;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dueDay = Math.min(recurring.day_of_month, lastDay);
  const dueDate = `${month}-${String(dueDay).padStart(2, "0")}`;

  return recurring.is_active && recurring.start_date <= dueDate && (!recurring.end_date || recurring.end_date >= monthStart);
}

export function recurringDueDate(recurring: RecurringTransaction, month: string) {
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dueDay = Math.min(recurring.day_of_month, lastDay);
  return `${month}-${String(dueDay).padStart(2, "0")}`;
}

export function isRecurringAlreadyRealized(recurring: RecurringTransaction, transactions: Transaction[], month: string) {
  const normalizedDescription = recurring.description.trim().toLowerCase();

  return transactions.some((transaction) => (
    transaction.date.startsWith(month)
    && transaction.account_id === recurring.account_id
    && transaction.type === recurring.type
    && Number(transaction.amount) === Number(recurring.amount)
    && transaction.description.trim().toLowerCase() === normalizedDescription
  ));
}
