/**
 * Transferências entre contas — Semana 10.2 (D040).
 *
 * Modelo: par linkado em `financial_entries` (saída na origem + entrada no
 * destino) com o mesmo `transfer_group_id` e `source = 'transfer'`.
 * Transferências NÃO entram nos totais reais de receita/despesa; saldos por
 * conta continuam corretos porque cada lado movimenta a sua conta.
 */

import { DESCRIPTION_MAX_LENGTH, isValidDateString, parseMoneyAmount, sanitizeText, tryAcquireActionLock } from "@/lib/security";
import type { Category, FinancialEntry } from "@/types/database";

export const TRANSFER_CATEGORY_NAME = "Transferências";

export type TransferStatus = "planned" | "paid";

export type TransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amountRaw: string | number;
  date: string;
  descriptionRaw: string;
  status: TransferStatus;
};

export type ValidatedTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
  status: TransferStatus;
};

type TransferLike = Pick<FinancialEntry, "source" | "category_id"> & {
  transfer_group_id?: string | null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

/** Ids das categorias de transferência (fallback para legados sem source='transfer'). */
export function transferCategoryIds(categories: Category[]): Set<string> {
  return new Set(
    categories
      .filter((category) => normalizeName(category.name) === normalizeName(TRANSFER_CATEGORY_NAME))
      .map((category) => category.id),
  );
}

/** Critério oficial: source='transfer'. Fallback: grupo linkado ou categoria Transferências. */
export function isInternalTransfer(entry: TransferLike, transferIds?: Set<string>): boolean {
  if (entry.source === "transfer") return true;
  if (entry.transfer_group_id) return true;
  if (transferIds && entry.category_id && transferIds.has(entry.category_id)) return true;
  return false;
}

export function splitEntries<T extends TransferLike>(entries: T[], categories?: Category[]): { real: T[]; internal: T[] } {
  const transferIds = categories ? transferCategoryIds(categories) : undefined;
  const real: T[] = [];
  const internal: T[] = [];
  for (const entry of entries) {
    if (isInternalTransfer(entry, transferIds)) internal.push(entry);
    else real.push(entry);
  }
  return { real, internal };
}

export function summarizeInternalMovements<T extends TransferLike & Pick<FinancialEntry, "entry_type" | "expected_amount" | "actual_amount" | "status">>(entries: T[]) {
  const expenseLegs = entries.filter((entry) => entry.entry_type === "expense");
  const expectedTotal = expenseLegs.reduce((total, entry) => total + Number(entry.expected_amount), 0);
  const actualTotal = expenseLegs
    .filter((entry) => entry.status === "paid")
    .reduce((total, entry) => total + Number(entry.actual_amount ?? entry.expected_amount), 0);
  return { count: entries.length, pairs: Math.floor(entries.length / 2), expectedTotal, actualTotal };
}

export function defaultTransferDescription(originName: string, destinationName: string) {
  const origin = originName.trim() || "Origem";
  const destination = destinationName.trim() || "Destino";
  return sanitizeText(`Transferência ${origin} → ${destination}`, DESCRIPTION_MAX_LENGTH);
}

/** Valida o formulário de transferência com mensagens humanas em PT-BR. */
export function validateTransferInput(input: TransferInput): ValidatedTransferInput {
  if (!input.fromAccountId) throw new Error("Escolha a conta de origem.");
  if (!input.toAccountId) throw new Error("Escolha a conta de destino.");
  if (input.fromAccountId === input.toAccountId) throw new Error("Origem e destino precisam ser contas diferentes.");

  const amount = parseMoneyAmount(input.amountRaw);
  if (amount === null) throw new Error("Informe um valor maior que zero para a transferência.");

  if (!isValidDateString(input.date)) throw new Error("Data da transferência inválida.");

  const description = sanitizeText(input.descriptionRaw, DESCRIPTION_MAX_LENGTH);
  if (description.length < 2) throw new Error("Descreva a transferência com pelo menos 2 caracteres.");

  if (input.status !== "planned" && input.status !== "paid") throw new Error("Status da transferência inválido.");

  return {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount,
    date: input.date,
    description,
    status: input.status,
  };
}

export type TransferLegPayload = {
  user_id: string;
  monthly_balance_id: string;
  account_id: string;
  category_id: string | null;
  entry_type: "income" | "expense";
  status: TransferStatus;
  description: string;
  expected_amount: number;
  actual_amount: number | null;
  due_date: string;
  paid_date: string | null;
  source: "transfer";
  recurring_rule_id: null;
  external_id: null;
  transfer_group_id: string;
  notes: string | null;
};

function newTransferGroupId(explicit?: string) {
  if (explicit) return explicit;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Monta o par linkado (saída origem + entrada destino) com o mesmo
 * `transfer_group_id`, mesmo valor/data/status, tipos opostos e
 * categoria Transferências nos dois lados.
 */
export function buildTransferPair(input: {
  userId: string;
  monthlyBalanceId: string;
  categoryId: string | null;
  validated: ValidatedTransferInput;
  groupId?: string;
}): [TransferLegPayload, TransferLegPayload] {
  const groupId = newTransferGroupId(input.groupId);
  const base = {
    user_id: input.userId,
    monthly_balance_id: input.monthlyBalanceId,
    category_id: input.categoryId,
    status: input.validated.status,
    description: input.validated.description,
    expected_amount: input.validated.amount,
    actual_amount: input.validated.status === "paid" ? input.validated.amount : null,
    due_date: input.validated.date,
    paid_date: input.validated.status === "paid" ? input.validated.date : null,
    source: "transfer" as const,
    recurring_rule_id: null,
    external_id: null,
    transfer_group_id: groupId,
    notes: `Transferência entre contas (par ${groupId}).`,
  };

  return [
    { ...base, account_id: input.validated.fromAccountId, entry_type: "expense" },
    { ...base, account_id: input.validated.toAccountId, entry_type: "income" },
  ];
}

/** Encontra o par de uma transferência a partir do grupo. */
export function findTransferPair<T extends TransferLike & { id: string }>(entries: T[], groupId: string): T[] {
  return entries.filter((entry) => entry.transfer_group_id === groupId);
}

/**
 * Lock anti-duplo-envio (reaproveita security.ts). Retorna true na primeira
 * chamada; false se a mesma transferência já foi enviada há pouco.
 */
export function tryAcquireTransferLock(userId: string, validated: ValidatedTransferInput, ttlMs = 30000, now = Date.now()) {
  const key = `transfer:${userId}:${validated.fromAccountId}:${validated.toAccountId}:${validated.amount}:${validated.date}:${validated.status}`;
  return tryAcquireActionLock(key, ttlMs, now);
}
