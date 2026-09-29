import { describe, expect, it } from "vitest";
import {
  accountBalancesFromEntries,
  accountBalanceFromEntries,
  accountProjectedBalanceFromEntries,
  dueDateForMonth,
  entryDisplayAmount,
  entryActualSignedAmount,
  entryExpectedSignedAmount,
  entryProjectedSignedAmount,
  expensesByCategory,
  latestEntries,
  isFinanceClassification,
  monthBounds,
  monthKey,
  parseMonthKey,
  recurringRuleAppliesToMonth,
  shiftMonth,
  summarizeEntries,
} from "@/lib/finance";
import type { Account, Category, FinancialEntry, RecurringRule } from "@/types/database";

const baseEntry: FinancialEntry = {
  id: "entry-1",
  user_id: "user-1",
  monthly_balance_id: "balance-1",
  account_id: "account-1",
  category_id: null,
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

const baseAccount: Account = {
  id: "account-1",
  user_id: "user-1",
  name: "Conta teste",
  type: "personal",
  bank: null,
  description: null,
  initial_balance: 250,
  is_active: true,
  color: null,
  icon: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const baseRule: RecurringRule = {
  id: "rule-1",
  user_id: "user-1",
  account_id: "account-1",
  category_id: null,
  description: "Internet",
  entry_type: "expense",
  amount: 120,
  day_of_month: 31,
  start_month: 9,
  start_year: 2026,
  end_month: null,
  end_year: null,
  is_active: true,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const baseCategory: Category = {
  id: "category-1",
  user_id: null,
  name: "Gastos fixos",
  icon: null,
  color: "#0891b2",
  type: "expense",
  parent_id: null,
  is_default: true,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
};

describe("finance", () => {
  it("monta e interpreta a chave mensal", () => {
    expect(monthKey(2026, 9)).toBe("2026-09");
    expect(parseMonthKey("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(monthBounds("2026-02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("calcula o valor previsto com sinal por tipo", () => {
    expect(entryExpectedSignedAmount(baseEntry)).toBe(1000);
    expect(entryExpectedSignedAmount({ ...baseEntry, entry_type: "expense", expected_amount: 80 })).toBe(-80);
  });

  it("usa apenas lancamentos realizados no realizado", () => {
    expect(entryActualSignedAmount({ ...baseEntry, status: "planned", actual_amount: 900 })).toBe(0);
    expect(entryActualSignedAmount({ ...baseEntry, status: "paid", actual_amount: 900 })).toBe(900);
    expect(entryActualSignedAmount({ ...baseEntry, entry_type: "expense", status: "paid", actual_amount: null, expected_amount: 150 })).toBe(-150);
    expect(entryDisplayAmount({ ...baseEntry, status: "planned", expected_amount: 500, actual_amount: null })).toBe(500);
    expect(entryDisplayAmount({ ...baseEntry, status: "paid", expected_amount: 500, actual_amount: 450 })).toBe(450);
  });

  it("usa valor real nos realizados e valor previsto nos previstos para projecao", () => {
    expect(entryProjectedSignedAmount({ ...baseEntry, status: "paid", expected_amount: 1000, actual_amount: 950 })).toBe(950);
    expect(entryProjectedSignedAmount({ ...baseEntry, status: "planned", expected_amount: 500, actual_amount: null })).toBe(500);
    expect(entryProjectedSignedAmount({ ...baseEntry, entry_type: "expense", status: "planned", expected_amount: 80 })).toBe(-80);
  });

  it("resume previsto e realizado do mes", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "income-paid", status: "paid", expected_amount: 1000, actual_amount: 950 },
      { ...baseEntry, id: "income-planned", status: "planned", expected_amount: 500, actual_amount: null },
      { ...baseEntry, id: "expense-paid", entry_type: "expense", status: "paid", expected_amount: 300, actual_amount: 280 },
      { ...baseEntry, id: "expense-planned", entry_type: "expense", status: "planned", expected_amount: 200 },
    ];

    expect(summarizeEntries(entries)).toEqual({
      expectedIncome: 1500,
      expectedExpenses: 500,
      expectedBalance: 1000,
      actualIncome: 950,
      actualExpenses: 280,
      actualBalance: 670,
      remainingIncome: 550,
      remainingExpenses: 220,
    });
  });

  it("calcula saldo da conta com saldo inicial e somente realizados", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "paid-income", status: "paid", actual_amount: 500 },
      { ...baseEntry, id: "planned-income", status: "planned", expected_amount: 900 },
      { ...baseEntry, id: "paid-expense", entry_type: "expense", status: "paid", actual_amount: 120 },
      { ...baseEntry, id: "other-account", account_id: "account-2", status: "paid", actual_amount: 700 },
    ];

    expect(accountBalanceFromEntries(baseAccount, entries)).toBe(630);
  });

  it("permite conta começar negativa por cheque especial ou dívida", () => {
    const account: Account = { ...baseAccount, initial_balance: -500 };
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "paid-income", status: "paid", actual_amount: 300 },
      { ...baseEntry, id: "planned-expense", entry_type: "expense", status: "planned", expected_amount: 100 },
    ];

    expect(accountBalanceFromEntries(account, entries)).toBe(-200);
    expect(accountProjectedBalanceFromEntries(account, entries)).toBe(-300);
  });

  it("calcula saldo previsto da conta com saldo inicial, realizados e previstos", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "paid-income", status: "paid", expected_amount: 700, actual_amount: 500 },
      { ...baseEntry, id: "planned-income", status: "planned", expected_amount: 900, actual_amount: null },
      { ...baseEntry, id: "planned-expense", entry_type: "expense", status: "planned", expected_amount: 120 },
      { ...baseEntry, id: "other-account", account_id: "account-2", status: "planned", expected_amount: 700 },
    ];

    expect(accountProjectedBalanceFromEntries(baseAccount, entries)).toBe(1530);
  });

  it("monta saldos por conta para o dashboard", () => {
    const otherAccount: Account = { ...baseAccount, id: "account-2", name: "Outra conta", initial_balance: 100 };
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "paid-income", status: "paid", actual_amount: 500 },
      { ...baseEntry, id: "planned-expense", entry_type: "expense", status: "planned", expected_amount: 80 },
      { ...baseEntry, id: "other-account", account_id: "account-2", status: "paid", actual_amount: 300 },
    ];

    expect(accountBalancesFromEntries([baseAccount, otherAccount], entries)).toEqual([
      { account: baseAccount, currentBalance: 750, projectedBalance: 670 },
      { account: otherAccount, currentBalance: 400, projectedBalance: 400 },
    ]);
  });

  it("agrupa gastos por categoria e ordena por maior valor", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "expense-1", entry_type: "expense", category_id: "category-1", status: "paid", actual_amount: 120 },
      { ...baseEntry, id: "expense-2", entry_type: "expense", category_id: null, status: "planned", expected_amount: 80 },
      { ...baseEntry, id: "income-1", entry_type: "income", category_id: "category-1", status: "paid", actual_amount: 500 },
    ];

    expect(expensesByCategory(entries, [baseCategory])).toEqual([
      { id: "category-1", name: "Gastos fixos", value: 120, color: "#0891b2" },
      { id: "sem-categoria", name: "Sem classificação", value: 80, color: null },
    ]);
  });

  it("considera apenas classificacoes financeiras atuais e customizadas", () => {
    const oldDefaultCategory: Category = { ...baseCategory, id: "old", name: "Alimentação", user_id: null };
    const customCategory: Category = { ...baseCategory, id: "custom", name: "Gastos de casa", user_id: "user-1", is_default: false };

    expect(isFinanceClassification(baseCategory, "user-1")).toBe(true);
    expect(isFinanceClassification(customCategory, "user-1")).toBe(true);
    expect(isFinanceClassification(oldDefaultCategory, "user-1")).toBe(false);
  });

  it("retorna os ultimos lancamentos por vencimento e criacao", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "old", due_date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
      { ...baseEntry, id: "latest-created", due_date: "2026-09-10", created_at: "2026-09-03T00:00:00Z" },
      { ...baseEntry, id: "latest-date", due_date: "2026-09-12", created_at: "2026-09-02T00:00:00Z" },
    ];

    expect(latestEntries(entries, 2).map((entry) => entry.id)).toEqual(["latest-date", "latest-created"]);
  });

  it("aplica recorrencia respeitando inicio, fim e ativo", () => {
    expect(recurringRuleAppliesToMonth(baseRule, 2026, 8)).toBe(false);
    expect(recurringRuleAppliesToMonth(baseRule, 2026, 9)).toBe(true);
    expect(recurringRuleAppliesToMonth({ ...baseRule, end_year: 2026, end_month: 10 }, 2026, 11)).toBe(false);
    expect(recurringRuleAppliesToMonth({ ...baseRule, is_active: false }, 2026, 9)).toBe(false);
  });

  it("ajusta vencimento para o ultimo dia do mes quando necessario", () => {
    expect(dueDateForMonth(31, 2026, 2)).toBe("2026-02-28");
    expect(dueDateForMonth(31, 2028, 2)).toBe("2028-02-29");
    expect(dueDateForMonth(15, 2026, 9)).toBe("2026-09-15");
  });
});
