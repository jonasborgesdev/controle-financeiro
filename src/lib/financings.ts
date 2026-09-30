import type { FinancialEntry, Financing } from "@/types/database";
import { dueDateForMonth } from "@/lib/finance";

export function financingRemainingInstallments(financing: Pick<Financing, "total_installments" | "paid_installments">) {
  return Math.max(0, financing.total_installments - financing.paid_installments);
}

export function financingRemainingAmount(financing: Pick<Financing, "total_installments" | "paid_installments" | "installment_amount">) {
  return financingRemainingInstallments(financing) * Number(financing.installment_amount);
}

export function financingProgressPercent(financing: Pick<Financing, "total_installments" | "paid_installments">) {
  if (financing.total_installments <= 0) return 0;
  return Math.max(0, Math.min(100, (financing.paid_installments / financing.total_installments) * 100));
}

export function financingNextDueDate(financing: Pick<Financing, "due_day" | "start_date" | "status" | "total_installments" | "paid_installments">, referenceDate = new Date()) {
  if (financing.status !== "active" || financingRemainingInstallments(financing) <= 0) return null;

  const start = new Date(`${financing.start_date}T00:00:00`);
  let year = referenceDate.getFullYear();
  let month = referenceDate.getMonth() + 1;
  let dueDate = dueDateForMonth(financing.due_day, year, month);

  if (new Date(`${dueDate}T23:59:59`) < referenceDate) {
    const next = new Date(year, month, 1);
    year = next.getFullYear();
    month = next.getMonth() + 1;
    dueDate = dueDateForMonth(financing.due_day, year, month);
  }

  const startMonth = start.getFullYear() * 100 + start.getMonth() + 1;
  const dueMonth = year * 100 + month;
  return dueMonth < startMonth ? dueDateForMonth(financing.due_day, start.getFullYear(), start.getMonth() + 1) : dueDate;
}

export function monthlyFinancingCommitment(financings: Array<Pick<Financing, "status" | "paid_installments" | "total_installments" | "installment_amount">>) {
  return financings
    .filter((financing) => financing.status === "active" && financingRemainingInstallments(financing) > 0)
    .reduce((total, financing) => total + Number(financing.installment_amount), 0);
}

export function hasFinancingInstallmentForMonth(entries: Array<Pick<FinancialEntry, "financing_id" | "installment_year" | "installment_month" | "description">>, financingId: string, year: number, month: number) {
  return entries.some((entry) => (
    entry.financing_id === financingId
    && entry.installment_year === year
    && entry.installment_month === month
  ));
}

export function financingEntriesForMonth(entries: FinancialEntry[]) {
  return entries.filter((entry) => entry.financing_id || entry.source === "financing" || entry.description.toLowerCase().startsWith("parcela financiamento:"));
}
