import { describe, expect, it } from "vitest";
import { buildAnnualReport, buildMonthlyReport } from "@/lib/reports";
import type { Account, Category, FinancialEntry, SavingsGoal } from "@/types/database";

const baseEntry: FinancialEntry = {
  id: "entry-1",
  user_id: "user-1",
  monthly_balance_id: "balance-1",
  account_id: "account-1",
  category_id: "category-1",
  recurring_rule_id: null,
  description: "Entrada teste",
  entry_type: "income",
  expected_amount: 1000,
  actual_amount: null,
  due_date: "2026-09-10",
  paid_date: null,
  source: "manual",
  status: "planned",
  external_id: null,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const account: Account = {
  id: "account-1",
  user_id: "user-1",
  name: "Conta principal",
  type: "personal",
  bank: null,
  description: null,
  initial_balance: 0,
  is_active: true,
  color: "#10b981",
  icon: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const category: Category = {
  id: "category-1",
  user_id: null,
  name: "Gastos fixos",
  icon: null,
  color: "#fb7185",
  type: "expense",
  parent_id: null,
  is_default: true,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
};

const goal: SavingsGoal = {
  id: "goal-1",
  user_id: "user-1",
  name: "Economia mensal",
  target_amount: 600,
  current_amount: 0,
  monthly_target: 50,
  deadline: null,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("reports", () => {
  it("monta relatorio mensal com previsto, realizado, distribuicoes e pendentes", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "income-paid", status: "paid", expected_amount: 1000, actual_amount: 950, entry_type: "income" },
      { ...baseEntry, id: "expense-paid", status: "paid", expected_amount: 400, actual_amount: 430, entry_type: "expense" },
      { ...baseEntry, id: "expense-planned", status: "planned", expected_amount: 100, actual_amount: null, entry_type: "expense" },
    ];

    const report = buildMonthlyReport(entries, [account], [category], [goal]);

    expect(report.summary.expectedIncome).toBe(1000);
    expect(report.summary.actualIncome).toBe(950);
    expect(report.summary.expectedExpenses).toBe(500);
    expect(report.summary.actualExpenses).toBe(430);
    expect(report.difference.balance).toBe(20);
    expect(report.savings.reached).toBe(true);
    expect(report.byCategory[0]).toMatchObject({ name: "Gastos fixos", actualIncome: 950, actualExpenses: 430, actualBalance: 520 });
    expect(report.byAccount[0]).toMatchObject({ name: "Conta principal", actualBalance: 520 });
    expect(report.topExpenses.map((entry) => entry.id)).toEqual(["expense-paid"]);
    expect(report.pendingEntries.map((entry) => entry.id)).toEqual(["expense-planned"]);
  });

  it("monta relatorio anual com meses, melhor/pior mes, medias e projecao", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "jan-income", due_date: "2026-01-05", status: "paid", expected_amount: 1000, actual_amount: 1000, entry_type: "income" },
      { ...baseEntry, id: "jan-expense", due_date: "2026-01-10", status: "paid", expected_amount: 300, actual_amount: 300, entry_type: "expense" },
      { ...baseEntry, id: "feb-income", due_date: "2026-02-05", status: "paid", expected_amount: 800, actual_amount: 800, entry_type: "income" },
      { ...baseEntry, id: "feb-expense", due_date: "2026-02-10", status: "paid", expected_amount: 900, actual_amount: 900, entry_type: "expense" },
      { ...baseEntry, id: "dec-planned", due_date: "2026-12-10", status: "planned", expected_amount: 200, actual_amount: null, entry_type: "income" },
    ];

    const report = buildAnnualReport(entries, [account], [category], [goal], 2026);

    expect(report.summary.actualIncome).toBe(1800);
    expect(report.summary.actualExpenses).toBe(1200);
    expect(report.months[0]!.actualBalance).toBe(700);
    expect(report.months[1]!.actualBalance).toBe(-100);
    expect(report.bestMonth?.month).toBe(1);
    expect(report.worstMonth?.month).toBe(2);
    expect(report.averages.balance).toBe(300);
    expect(report.savings.planned).toBe(600);
    expect(report.projection.hasFuturePlanned).toBe(true);
    expect(report.projection.projectedBalance).toBe(800);
  });
});
