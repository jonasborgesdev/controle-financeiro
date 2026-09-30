import { describe, expect, it } from "vitest";
import { financingEntriesForMonth, financingNextDueDate, financingProgressPercent, financingRemainingAmount, financingRemainingInstallments, hasFinancingInstallmentForMonth, monthlyFinancingCommitment } from "@/lib/financings";
import type { FinancialEntry, Financing } from "@/types/database";

const financing: Financing = {
  id: "fin-1",
  user_id: "user-1",
  account_id: "account-1",
  category_id: "category-1",
  name: "Carro",
  original_amount: 36000,
  installment_amount: 1000,
  total_installments: 36,
  paid_installments: 12,
  due_day: 10,
  start_date: "2026-01-10",
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function entry(overrides: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    monthly_balance_id: "balance-1",
    account_id: "account-1",
    category_id: "category-1",
    entry_type: "expense",
    status: "planned",
    description: "Parcela financiamento: Carro",
    expected_amount: 1000,
    actual_amount: null,
    due_date: "2026-09-10",
    paid_date: null,
    source: "financing",
    recurring_rule_id: null,
    external_id: null,
    financing_id: "fin-1",
    installment_year: 2026,
    installment_month: 9,
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("financing helpers", () => {
  it("calcula parcelas restantes, valor restante e progresso", () => {
    expect(financingRemainingInstallments(financing)).toBe(24);
    expect(financingRemainingAmount(financing)).toBe(24000);
    expect(financingProgressPercent(financing)).toBeCloseTo(33.333, 2);
  });

  it("calcula compromisso mensal apenas de financiamentos ativos com saldo", () => {
    expect(monthlyFinancingCommitment([
      financing,
      { ...financing, id: "fin-2", installment_amount: 500, status: "inactive" },
      { ...financing, id: "fin-3", installment_amount: 800, paid_installments: 36 },
    ])).toBe(1000);
  });

  it("calcula próximo vencimento respeitando vencimento já passado", () => {
    expect(financingNextDueDate(financing, new Date("2026-09-01T12:00:00"))).toBe("2026-09-10");
    expect(financingNextDueDate(financing, new Date("2026-09-11T12:00:00"))).toBe("2026-10-10");
  });

  it("identifica parcela já gerada no mês", () => {
    const entries = [entry({})];
    expect(hasFinancingInstallmentForMonth(entries, "fin-1", 2026, 9)).toBe(true);
    expect(hasFinancingInstallmentForMonth(entries, "fin-1", 2026, 10)).toBe(false);
  });

  it("lista lançamentos de financiamento por vínculo, fonte ou descrição legada", () => {
    const entries = [
      entry({}),
      entry({ id: "entry-2", financing_id: null, source: "manual", description: "Parcela financiamento: Casa" }),
      entry({ id: "entry-3", financing_id: null, source: "manual", description: "Mercado" }),
    ];
    expect(financingEntriesForMonth(entries)).toHaveLength(2);
  });
});
