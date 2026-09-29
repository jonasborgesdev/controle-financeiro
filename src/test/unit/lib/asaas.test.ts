import { describe, expect, it } from "vitest";
import { markAsaasDuplicates, normalizeAsaasPayment, suggestAsaasIncomeCategory } from "@/lib/asaas";
import type { Category, FinancialEntry } from "@/types/database";

describe("asaas", () => {
  it("normaliza pagamento recebido usando valor líquido e descrição humana", () => {
    const payment = normalizeAsaasPayment({
      id: "pay_123",
      customer: "cus_1",
      value: 100,
      netValue: 96.51,
      description: "Mensalidade site",
      billingType: "PIX",
      status: "RECEIVED",
      paymentDate: "2026-09-12",
      externalReference: "NF-10",
    }, new Map([["cus_1", "Cliente Teste"]]));

    expect(payment).toMatchObject({
      externalId: "pay_123",
      customerName: "Cliente Teste",
      description: "Cliente Teste · Mensalidade site · Pix",
      date: "2026-09-12",
      grossValue: 100,
      netValue: 96.51,
      amount: 96.51,
    });
    expect(payment?.notes).toContain("Valor bruto: 100.00");
  });

  it("marca duplicata por external_id do Asaas", () => {
    const normalized = normalizeAsaasPayment({ id: "pay_123", customer: null, value: 100, netValue: 99, description: "Cliente", billingType: "BOLETO", status: "CONFIRMED", paymentDate: "2026-09-10" });
    const items = markAsaasDuplicates([normalized!], [baseEntry({ source: "asaas", external_id: "pay_123" })], "account-1", "category-income");

    expect(items[0]!.duplicate).toBe(true);
    expect(items[0]!.selected).toBe(false);
    expect(items[0]!.duplicateReason).toContain("ID do Asaas");
  });

  it("marca duplicata por fallback de conta, data, valor e descrição", () => {
    const normalized = normalizeAsaasPayment({ id: "pay_456", customer: null, value: 100, netValue: 99, description: "Cliente", billingType: "PIX", status: "RECEIVED", paymentDate: "2026-09-10" });
    const items = markAsaasDuplicates([normalized!], [baseEntry({ description: normalized!.description, actual_amount: 99, expected_amount: 99, due_date: "2026-09-10" })], "account-1", "category-income");

    expect(items[0]!.duplicate).toBe(true);
    expect(items[0]!.duplicateReason).toContain("parecido");
  });

  it("sugere ganhos variáveis como classificação padrão", () => {
    expect(suggestAsaasIncomeCategory([
      baseCategory("expense", "Gastos variáveis", "expense"),
      baseCategory("income", "Ganhos variáveis", "income"),
    ], "user-1")).toBe("income");
  });
});

function baseEntry(overrides: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    monthly_balance_id: "balance-1",
    account_id: "account-1",
    category_id: "category-income",
    entry_type: "income",
    status: "paid",
    description: "Cliente · Pix",
    expected_amount: 99,
    actual_amount: 99,
    due_date: "2026-09-10",
    paid_date: "2026-09-10",
    source: "manual",
    recurring_rule_id: null,
    external_id: null,
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function baseCategory(id: string, name: string, type: "income" | "expense"): Category {
  return {
    id,
    user_id: null,
    name,
    icon: null,
    color: null,
    type,
    parent_id: null,
    is_default: true,
    is_active: true,
    created_at: "2026-09-01T00:00:00Z",
  };
}
