import { describe, expect, it } from "vitest";
import { buildFinancialProjection } from "@/lib/projections";
import type { Account, Budget, Category, FinancialEntry, Financing, RecurringRule, SavingsGoal } from "@/types/database";

const account: Account = {
  id: "account-1",
  user_id: "user-1",
  name: "Conta principal",
  type: "personal",
  bank: null,
  description: null,
  initial_balance: 500,
  is_active: true,
  color: null,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const variableExpenseCategory: Category = {
  id: "cat-var-expense",
  user_id: null,
  name: "Gastos variáveis",
  icon: null,
  color: null,
  type: "expense",
  parent_id: null,
  is_default: true,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

const fixedExpenseCategory: Category = { ...variableExpenseCategory, id: "cat-fixed-expense", name: "Gastos fixos" };
const incomeCategory: Category = { ...variableExpenseCategory, id: "cat-income", name: "Ganhos fixos", type: "income" };

const goal: SavingsGoal = {
  id: "goal-1",
  user_id: "user-1",
  name: "Economia mensal",
  target_amount: 600,
  current_amount: 0,
  monthly_target: 50,
  deadline: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const salaryRule: RecurringRule = {
  id: "rule-income",
  user_id: "user-1",
  account_id: account.id,
  category_id: incomeCategory.id,
  entry_type: "income",
  description: "Salário",
  amount: 3000,
  day_of_month: 5,
  start_year: 2026,
  start_month: 1,
  end_year: null,
  end_month: null,
  is_active: true,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const rentRule: RecurringRule = { ...salaryRule, id: "rule-expense", category_id: fixedExpenseCategory.id, entry_type: "expense", description: "Aluguel", amount: 1200, day_of_month: 10 };

const financing: Financing = {
  id: "financing-1",
  user_id: "user-1",
  account_id: account.id,
  category_id: fixedExpenseCategory.id,
  name: "Carro",
  original_amount: 12000,
  installment_amount: 600,
  total_installments: 20,
  paid_installments: 2,
  due_day: 15,
  start_date: "2026-01-15",
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseEntry: FinancialEntry = {
  id: "entry-1",
  user_id: "user-1",
  monthly_balance_id: "balance-1",
  account_id: account.id,
  category_id: variableExpenseCategory.id,
  entry_type: "expense",
  status: "paid",
  description: "Mercado",
  expected_amount: 300,
  actual_amount: 300,
  due_date: "2026-06-10",
  paid_date: "2026-06-10",
  source: "manual",
  recurring_rule_id: null,
  external_id: null,
  financing_id: null,
  installment_year: null,
  installment_month: null,
  notes: null,
  created_at: "2026-06-10T00:00:00Z",
  updated_at: "2026-06-10T00:00:00Z",
};

describe("projections", () => {
  it("projeta 6 meses com recorrencias, media variavel, meta e financiamentos", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "apr-var", due_date: "2026-04-10", paid_date: "2026-04-10", actual_amount: 300 },
      { ...baseEntry, id: "may-var", due_date: "2026-05-10", paid_date: "2026-05-10", actual_amount: 600 },
      { ...baseEntry, id: "jun-var", due_date: "2026-06-10", paid_date: "2026-06-10", actual_amount: 900 },
      { ...baseEntry, id: "past-income", due_date: "2026-06-05", paid_date: "2026-06-05", entry_type: "income", category_id: incomeCategory.id, expected_amount: 3000, actual_amount: 3000, source: "recurring", recurring_rule_id: salaryRule.id },
    ];

    const projection = buildFinancialProjection({
      startYear: 2026,
      startMonth: 7,
      months: 6,
      averageWindowMonths: 3,
      entries,
      recurringRules: [salaryRule, rentRule],
      accounts: [account],
      categories: [variableExpenseCategory, fixedExpenseCategory, incomeCategory],
      budgets: [],
      savingsGoals: [goal],
      financings: [financing],
    });

    expect(projection.months).toHaveLength(6);
    expect(projection.variableAverage.expenses).toBe(600);
    expect(projection.months[0]).toMatchObject({ projectedIncome: 3000, projectedExpenses: 2400, projectedBalance: 600, savingsGap: 0, financingImpact: 600, risk: "healthy" });
    expect(projection.financingImpactTotal).toBe(3600);
    expect(projection.status).toBe("healthy");
  });

  it("sinaliza saldo negativo e planejamento deficitario", () => {
    const projection = buildFinancialProjection({
      startYear: 2026,
      startMonth: 7,
      months: 3,
      entries: [],
      recurringRules: [{ ...salaryRule, amount: 1000 }, { ...rentRule, amount: 1500 }],
      accounts: [{ ...account, initial_balance: 0 }],
      categories: [fixedExpenseCategory, incomeCategory],
      budgets: [],
      savingsGoals: [goal],
      financings: [financing],
    });

    expect(projection.monthsAtRisk).toBe(3);
    expect(projection.status).toBe("critical");
    expect(projection.alerts.join(" ")).toContain("saldo negativo");
  });

  it("usa orcamento quando ele e maior que os lancamentos existentes", () => {
    const budget: Budget = {
      id: "budget-1",
      user_id: "user-1",
      category_id: variableExpenseCategory.id,
      year: 2026,
      month: 7,
      planned_amount: 1000,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    };
    const plannedEntry: FinancialEntry = { ...baseEntry, id: "planned-var", status: "planned", due_date: "2026-07-12", paid_date: null, expected_amount: 250, actual_amount: null };

    const projection = buildFinancialProjection({
      startYear: 2026,
      startMonth: 7,
      months: 1,
      entries: [plannedEntry],
      recurringRules: [salaryRule],
      accounts: [account],
      categories: [variableExpenseCategory, incomeCategory],
      budgets: [budget],
      savingsGoals: [goal],
      financings: [],
    });

    expect(projection.months[0]?.plannedExpenses).toBe(1000);
    expect(projection.months[0]?.projectedBalance).toBe(2000);
  });
});
