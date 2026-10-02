import { describe, expect, it } from "vitest";
import { summarizeEntries } from "@/lib/finance";
import { buildMonthlyReport } from "@/lib/reports";
import { buildFinancialProjection } from "@/lib/projections";
import { buildAiInputSummary } from "@/lib/ai";
import {
  TRANSFER_CATEGORY_NAME,
  buildTransferPair,
  defaultTransferDescription,
  findTransferPair,
  isInternalTransfer,
  splitEntries,
  summarizeInternalMovements,
  transferCategoryIds,
  tryAcquireTransferLock,
  validateTransferInput,
} from "@/lib/transfers";
import type { Account, Category, FinancialEntry, Financing, SavingsGoal } from "@/types/database";

const userId = "user-1";

function makeEntry(overrides: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    user_id: userId,
    monthly_balance_id: "balance-1",
    account_id: "account-1",
    category_id: "category-1",
    entry_type: "expense",
    status: "paid",
    description: "Lançamento teste",
    expected_amount: 100,
    actual_amount: 100,
    due_date: "2026-10-10",
    paid_date: "2026-10-10",
    source: "manual",
    recurring_rule_id: null,
    external_id: null,
    transfer_group_id: null,
    notes: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function makeTransferLegs(amount = 500): FinancialEntry[] {
  const groupId = "group-123";
  return [
    makeEntry({ id: "leg-expense", entry_type: "expense", account_id: "account-origem", source: "transfer", transfer_group_id: groupId, expected_amount: amount, actual_amount: amount, description: "Transferência Conjunta → PJ" }),
    makeEntry({ id: "leg-income", entry_type: "income", account_id: "account-destino", source: "transfer", transfer_group_id: groupId, expected_amount: amount, actual_amount: amount, description: "Transferência Conjunta → PJ" }),
  ];
}

const transferCategory: Category = {
  id: "category-transfer",
  user_id: null,
  name: TRANSFER_CATEGORY_NAME,
  icon: "🔄",
  color: null,
  type: "transfer",
  parent_id: null,
  is_default: true,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
};

const account: Account = {
  id: "account-1",
  user_id: userId,
  name: "Santander Conjunta",
  type: "personal",
  bank: "Santander",
  description: null,
  initial_balance: 1000,
  is_active: true,
  color: null,
  icon: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("validateTransferInput", () => {
  const base = {
    fromAccountId: "account-origem",
    toAccountId: "account-destino",
    amountRaw: "500",
    date: "2026-10-02",
    descriptionRaw: "Transferência Conjunta → PJ",
    status: "paid" as const,
  };

  it("aceita transferência válida", () => {
    const validated = validateTransferInput(base);
    expect(validated.amount).toBe(500);
    expect(validated.date).toBe("2026-10-02");
  });

  it("bloqueia origem igual ao destino", () => {
    expect(() => validateTransferInput({ ...base, toAccountId: "account-origem" })).toThrow("contas diferentes");
  });

  it("bloqueia valor zero ou inválido", () => {
    expect(() => validateTransferInput({ ...base, amountRaw: "0" })).toThrow("maior que zero");
    expect(() => validateTransferInput({ ...base, amountRaw: "-10" })).toThrow("maior que zero");
    expect(() => validateTransferInput({ ...base, amountRaw: "abc" })).toThrow("maior que zero");
  });

  it("bloqueia data inválida e descrição curta", () => {
    expect(() => validateTransferInput({ ...base, date: "2026-13-40" })).toThrow("inválida");
    expect(() => validateTransferInput({ ...base, descriptionRaw: "x" })).toThrow("2 caracteres");
  });

  it("respeita o limite de descrição de security.ts", () => {
    const validated = validateTransferInput({ ...base, descriptionRaw: `  ${"a".repeat(200)}  ` });
    expect(validated.description.length).toBeLessThanOrEqual(120);
  });
});

describe("buildTransferPair", () => {
  it("cria os 2 lados com mesmo grupo, valor, data e status", () => {
    const validated = validateTransferInput({
      fromAccountId: "account-origem",
      toAccountId: "account-destino",
      amountRaw: 500,
      date: "2026-10-02",
      descriptionRaw: "Transferência Conjunta → PJ",
      status: "paid",
    });
    const [expenseLeg, incomeLeg] = buildTransferPair({
      userId,
      monthlyBalanceId: "balance-1",
      categoryId: "category-transfer",
      validated,
    });

    expect(expenseLeg.entry_type).toBe("expense");
    expect(incomeLeg.entry_type).toBe("income");
    expect(expenseLeg.account_id).toBe("account-origem");
    expect(incomeLeg.account_id).toBe("account-destino");
    expect(expenseLeg.transfer_group_id).toBe(incomeLeg.transfer_group_id);
    expect(expenseLeg.expected_amount).toBe(500);
    expect(incomeLeg.expected_amount).toBe(500);
    expect(expenseLeg.due_date).toBe("2026-10-02");
    expect(incomeLeg.due_date).toBe("2026-10-02");
    expect(expenseLeg.status).toBe("paid");
    expect(incomeLeg.status).toBe("paid");
    expect(expenseLeg.actual_amount).toBe(500);
    expect(expenseLeg.source).toBe("transfer");
    expect(incomeLeg.source).toBe("transfer");
    expect(expenseLeg.category_id).toBe("category-transfer");
    expect(incomeLeg.category_id).toBe("category-transfer");
    expect(expenseLeg.description).toBe(incomeLeg.description);
  });

  it("par previsto não preenche valor/data realizados", () => {
    const validated = validateTransferInput({
      fromAccountId: "a",
      toAccountId: "b",
      amountRaw: 100,
      date: "2026-10-05",
      descriptionRaw: "Teste",
      status: "planned",
    });
    const [expenseLeg] = buildTransferPair({ userId, monthlyBalanceId: "balance-1", categoryId: null, validated });
    expect(expenseLeg.actual_amount).toBeNull();
    expect(expenseLeg.paid_date).toBeNull();
  });
});

describe("identificação de transferência", () => {
  it("detecta por source, por grupo e por categoria (fallback)", () => {
    const ids = transferCategoryIds([transferCategory]);
    expect(isInternalTransfer(makeEntry({ source: "transfer" }))).toBe(true);
    expect(isInternalTransfer(makeEntry({ transfer_group_id: "g1" }))).toBe(true);
    expect(isInternalTransfer(makeEntry({ category_id: "category-transfer" }), ids)).toBe(true);
    expect(isInternalTransfer(makeEntry({ source: "manual", category_id: "category-transfer" }))).toBe(false);
    expect(isInternalTransfer(makeEntry())).toBe(false);
  });

  it("separa reais de internas e resume movimentações", () => {
    const entries = [makeEntry({ entry_type: "income", expected_amount: 2000, actual_amount: 2000 }), ...makeTransferLegs(500)];
    const { real, internal } = splitEntries(entries, [transferCategory]);
    expect(real).toHaveLength(1);
    expect(internal).toHaveLength(2);
    const totals = summarizeInternalMovements(internal);
    expect(totals.count).toBe(2);
    expect(totals.pairs).toBe(1);
    expect(totals.actualTotal).toBe(500);
  });

  it("encontra o par pelo grupo", () => {
    const entries = [makeEntry({ id: "other" }), ...makeTransferLegs()];
    expect(findTransferPair(entries, "group-123")).toHaveLength(2);
    expect(findTransferPair(entries, "missing")).toHaveLength(0);
  });

  it("gera descrição padrão Origem → Destino", () => {
    expect(defaultTransferDescription("Santander Conjunta", "Nubank PJ Jonas")).toBe("Transferência Santander Conjunta → Nubank PJ Jonas");
  });

  it("lock bloqueia duplo envio da mesma transferência", () => {
    const validated = validateTransferInput({
      fromAccountId: "a",
      toAccountId: "b",
      amountRaw: 10,
      date: "2026-10-02",
      descriptionRaw: "Teste lock",
      status: "paid",
    });
    expect(tryAcquireTransferLock("user-lock-1", validated, 60000, 1000)).toBe(true);
    expect(tryAcquireTransferLock("user-lock-1", validated, 60000, 1001)).toBe(false);
  });
});

describe("agregadores excluem transferências", () => {
  const realIncome = makeEntry({ id: "real-income", entry_type: "income", expected_amount: 2000, actual_amount: 2000, source: "manual" });
  const realExpense = makeEntry({ id: "real-expense", entry_type: "expense", expected_amount: 800, actual_amount: 800, source: "manual" });

  it("summarizeEntries ignora o par linkado", () => {
    const summary = summarizeEntries([realIncome, realExpense, ...makeTransferLegs(500)]);
    expect(summary.actualIncome).toBe(2000);
    expect(summary.actualExpenses).toBe(800);
    expect(summary.actualBalance).toBe(1200);
  });

  it("relatório mensal separa movimentações internas", () => {
    const report = buildMonthlyReport([realIncome, realExpense, ...makeTransferLegs(500)], [account], [transferCategory], []);
    expect(report.summary.actualIncome).toBe(2000);
    expect(report.summary.actualExpenses).toBe(800);
    expect(report.internalMovements.count).toBe(2);
    expect(report.internalMovements.actualTotal).toBe(500);
    expect(report.topExpenses.some((entry) => entry.source === "transfer")).toBe(false);
    expect(report.topIncome.some((entry) => entry.source === "transfer")).toBe(false);
  });

  it("projeção não projeta transferência como receita/despesa", () => {
    const projection = buildFinancialProjection({
      startYear: 2026,
      startMonth: 10,
      months: 1,
      entries: [realIncome, realExpense, ...makeTransferLegs(500)],
      recurringRules: [],
      budgets: [],
      savingsGoals: [] as SavingsGoal[],
      financings: [] as Financing[],
      accounts: [account],
      categories: [transferCategory],
    });
    expect(projection.months[0]?.projectedIncome).toBe(2000);
    expect(projection.months[0]?.projectedExpenses).toBe(800);
    expect(projection.assumptions.some((assumption) => assumption.includes("Transferências"))).toBe(true);
  });

  it("IA exclui transferências dos totais e cita como interna", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      entries: [realIncome, realExpense, ...makeTransferLegs(500)],
      accounts: [account],
      categories: [transferCategory],
      goals: [],
      financings: [],
    });
    expect(summary.totals.actualIncome).toBe(2000);
    expect(summary.totals.actualExpenses).toBe(800);
    expect(summary.internalTransfers.count).toBe(2);
    expect(summary.internalTransfers.actualTotal).toBe(500);
    expect(summary.adjustableEntries.some((entry) => entry.source === "transfer")).toBe(false);
    expect(summary.counts.entries).toBe(2);
  });
});
