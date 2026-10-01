import { createServerFn } from "@tanstack/react-start";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout, isValidPeriodRange, tryAcquireActionLock } from "@/lib/security";
import type { Account, Category, FinancialEntry, IntegrationSetting } from "@/types/database";

const ASAAS_TIMEOUT_MS = 15000;
const ASAAS_SYNC_LOCK_TTL_MS = 60000;
const ASAAS_MAX_OFFSET = 500;

export type AsaasEnvironment = "sandbox" | "production";
export type AsaasPaymentStatus = "RECEIVED" | "CONFIRMED" | string;

export interface AsaasPayment {
  id: string
  customer: string | null
  value: number
  netValue?: number | null
  description?: string | null
  billingType?: string | null
  status: AsaasPaymentStatus
  dueDate?: string | null
  paymentDate?: string | null
  clientPaymentDate?: string | null
  creditDate?: string | null
  externalReference?: string | null
}

export interface AsaasReviewPayment {
  id: string
  externalId: string
  selected: boolean
  duplicate: boolean
  duplicateReason: string | null
  customerName: string | null
  description: string
  billingType: string
  status: AsaasPaymentStatus
  date: string
  grossValue: number
  netValue: number
  amount: number
  accountId: string
  categoryId: string
  notes: string
}

interface AsaasCustomer {
  id: string
  name?: string | null
}

interface AsaasListResponse {
  hasMore?: boolean
  totalCount?: number
  limit?: number
  offset?: number
  data?: AsaasPayment[]
  errors?: Array<{ code?: string; description?: string }>
}

export function asaasBaseUrl(environment: AsaasEnvironment) {
  return environment === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com";
}

export function normalizeAsaasPayment(payment: AsaasPayment, customerNameById = new Map<string, string>()): Omit<AsaasReviewPayment, "selected" | "duplicate" | "duplicateReason" | "accountId" | "categoryId"> | null {
  if (!payment.id || !["RECEIVED", "CONFIRMED"].includes(payment.status)) return null;
  const date = payment.paymentDate ?? payment.clientPaymentDate ?? payment.creditDate ?? payment.dueDate;
  if (!date) return null;
  const grossValue = Number(payment.value ?? 0);
  const netValue = Number(payment.netValue ?? payment.value ?? 0);
  if (netValue <= 0) return null;

  const customerName = payment.customer ? customerNameById.get(payment.customer) ?? null : null;
  const billingType = humanBillingType(payment.billingType);
  const pieces = [customerName, payment.description?.trim(), billingType].filter(Boolean);
  const description = pieces.length > 0 ? pieces.join(" · ") : `Recebimento Asaas ${payment.id}`;
  const notes = [
    `Importado do Asaas. ID externo: ${payment.id}.`,
    `Valor líquido usado no lançamento: ${netValue.toFixed(2)}.`,
    `Valor bruto: ${grossValue.toFixed(2)}.`,
    payment.externalReference ? `Referência externa: ${payment.externalReference}.` : null,
  ].filter(Boolean).join(" ");

  return {
    id: payment.id,
    externalId: payment.id,
    customerName,
    description,
    billingType,
    status: payment.status,
    date,
    grossValue,
    netValue,
    amount: netValue,
    notes,
  };
}

export function markAsaasDuplicates(payments: Array<Omit<AsaasReviewPayment, "selected" | "duplicate" | "duplicateReason" | "accountId" | "categoryId">>, entries: FinancialEntry[], defaultAccountId: string, defaultCategoryId: string) {
  return payments.map((payment) => {
    const duplicateByExternalId = entries.find((entry) => entry.source === "asaas" && entry.external_id === payment.externalId);
    const duplicateByFallback = entries.find((entry) => (
      entry.account_id === defaultAccountId
      && entry.status === "paid"
      && entry.entry_type === "income"
      && entry.due_date === payment.date
      && Number(entry.actual_amount ?? entry.expected_amount) === payment.amount
      && normalizeText(entry.description) === normalizeText(payment.description)
    ));

    const duplicate = Boolean(duplicateByExternalId || duplicateByFallback);
    return {
      ...payment,
      accountId: defaultAccountId,
      categoryId: defaultCategoryId,
      selected: !duplicate,
      duplicate,
      duplicateReason: duplicateByExternalId ? "Já existe um lançamento com este ID do Asaas." : duplicateByFallback ? "Já existe um lançamento muito parecido nesta conta, data e valor." : null,
    };
  });
}

export function suggestAsaasIncomeCategory(categories: Category[], userId: string) {
  return categories.find((category) => category.type === "income" && category.user_id === userId && category.name === "Ganhos variáveis")?.id
    ?? categories.find((category) => category.type === "income" && category.user_id === null && category.name === "Ganhos variáveis")?.id
    ?? categories.find((category) => category.type === "income" && category.name.toLowerCase().includes("vari"))?.id
    ?? categories.find((category) => category.type === "income")?.id
    ?? "";
}

export function asaasSyncSummary(items: AsaasReviewPayment[]) {
  const duplicates = items.filter((item) => item.duplicate).length;
  const selected = items.filter((item) => item.selected && !item.duplicate).length;
  return {
    total: items.length,
    selected,
    duplicates,
    ignored: items.length - selected - duplicates,
    grossValue: items.reduce((total, item) => total + item.grossValue, 0),
    netValue: items.reduce((total, item) => total + item.netValue, 0),
  };
}

export function formatAsaasStatus(status: AsaasPaymentStatus) {
  if (status === "RECEIVED") return "Recebido";
  if (status === "CONFIRMED") return "Confirmado";
  return status;
}

export const testAsaasConnection = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; environment: AsaasEnvironment })
  .handler(async ({ data }) => {
    await requireAuthenticatedUser(data.accessToken);
    const apiKey = getAsaasApiKey();
    const response = await fetchWithTimeout(`${asaasBaseUrl(data.environment)}/v3/payments?limit=1&offset=0`, {
      headers: asaasHeaders(apiKey),
    }, ASAAS_TIMEOUT_MS);
    if (!response.ok) throw new Error(await asaasErrorMessage(response));
    return { ok: true, message: `Conexão com Asaas ${data.environment === "production" ? "produção" : "sandbox"} funcionando.` };
  });

export const syncAsaasPayments = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; periodStart: string; periodEnd: string })
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser(data.accessToken);
    if (!isValidPeriodRange(data.periodStart, data.periodEnd)) {
      throw new Error("Período inválido para sincronizar. Use um intervalo de até 12 meses.");
    }
    if (!tryAcquireActionLock(`asaas:${userId}:${data.periodStart}:${data.periodEnd}`, ASAAS_SYNC_LOCK_TTL_MS)) {
      throw new Error("Já existe uma sincronização em andamento. Aguarde um minuto e tente de novo.");
    }
    const supabase = createServerSupabase();
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("id,user_id,provider,enabled,environment,default_account_id,default_category_id,last_sync_at,created_at,updated_at")
      .eq("user_id", userId)
      .eq("provider", "asaas")
      .maybeSingle();

    if (settingsError) throw new Error(settingsError.message);
    const integration = settings as IntegrationSetting | null;
    if (!integration?.enabled) throw new Error("A integração Asaas está desativada. Ative em Configurações antes de sincronizar.");
    if (!integration.default_account_id) throw new Error("Escolha uma conta padrão para receber lançamentos do Asaas.");

    const apiKey = getAsaasApiKey();
    const payments = await listReceivedPayments(apiKey, integration.environment, data.periodStart, data.periodEnd);
    const customerNames = await fetchCustomerNames(apiKey, integration.environment, payments);
    const normalized = payments.map((payment) => normalizeAsaasPayment(payment, customerNames)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const { data: existingEntries, error: entriesError } = await supabase
      .from("financial_entries")
      .select("id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,notes,created_at,updated_at")
      .eq("user_id", userId)
      .eq("account_id", integration.default_account_id);
    if (entriesError) throw new Error(entriesError.message);

    const items = markAsaasDuplicates(normalized, existingEntries as FinancialEntry[] ?? [], integration.default_account_id, integration.default_category_id ?? "");
    return { items, environment: integration.environment, lastSyncAt: integration.last_sync_at };
  });

async function listReceivedPayments(apiKey: string, environment: AsaasEnvironment, periodStart: string, periodEnd: string) {
  const statuses = ["RECEIVED", "CONFIRMED"];
  const byId = new Map<string, AsaasPayment>();
  for (const status of statuses) {
    let offset = 0;
    let hasMore = true;
    while (hasMore && offset < ASAAS_MAX_OFFSET) {
      const url = new URL(`${asaasBaseUrl(environment)}/v3/payments`);
      url.searchParams.set("status", status);
      url.searchParams.set("paymentDate[ge]", periodStart);
      url.searchParams.set("paymentDate[le]", periodEnd);
      url.searchParams.set("limit", "100");
      url.searchParams.set("offset", String(offset));
      const response = await fetchWithTimeout(url, { headers: asaasHeaders(apiKey) }, ASAAS_TIMEOUT_MS);
      if (!response.ok) throw new Error(await asaasErrorMessage(response));
      const body = await response.json() as AsaasListResponse;
      for (const payment of body.data ?? []) byId.set(payment.id, payment);
      hasMore = Boolean(body.hasMore);
      offset += Number(body.limit ?? 100);
    }
  }
  return Array.from(byId.values()).sort((first, second) => (first.paymentDate ?? first.dueDate ?? "").localeCompare(second.paymentDate ?? second.dueDate ?? ""));
}

async function fetchCustomerNames(apiKey: string, environment: AsaasEnvironment, payments: AsaasPayment[]) {
  const ids = Array.from(new Set(payments.map((payment) => payment.customer).filter((id): id is string => Boolean(id)))).slice(0, 50);
  const result = new Map<string, string>();
  await Promise.all(ids.map(async (id) => {
    const response = await fetchWithTimeout(`${asaasBaseUrl(environment)}/v3/customers/${id}`, { headers: asaasHeaders(apiKey) }, ASAAS_TIMEOUT_MS);
    if (!response.ok) return;
    const customer = await response.json() as AsaasCustomer;
    if (customer.name) result.set(id, customer.name);
  }));
  return result;
}

async function requireAuthenticatedUser(accessToken: string) {
  if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");
  const supabase = createServerSupabase(false);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Sessão inválida. Faça login novamente.");
  return data.user.id;
}

function createServerSupabase(useServiceRole = true) {
  const url = process.env["VITE_SUPABASE_URL"];
  const key = useServiceRole ? process.env["SUPABASE_SERVICE_ROLE_KEY"] : process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) throw new Error("Variáveis do Supabase não configuradas no servidor.");
  return createSupabaseClient(url, key);
}

function getAsaasApiKey() {
  const apiKey = process.env["ASAAS_API_KEY"];
  if (!apiKey) throw new Error("API key do Asaas não configurada no servidor.");
  return apiKey;
}

function asaasHeaders(apiKey: string) {
  return {
    access_token: apiKey,
    accept: "application/json",
    "user-agent": "ControleFinanceiro/1.0.0",
  };
}

async function asaasErrorMessage(response: Response) {
  if (response.status === 401) return "API key do Asaas inválida ou sem permissão.";
  if (response.status === 429) return "O Asaas limitou as requisições agora. Tente novamente em alguns minutos.";
  if (response.status >= 500) return "Asaas indisponível no momento. Tente novamente mais tarde.";
  try {
    const body = await response.json() as AsaasListResponse;
    return body.errors?.map((error) => error.description).filter(Boolean).join(" ") || `Erro do Asaas (${response.status}).`;
  } catch {
    return `Erro do Asaas (${response.status}).`;
  }
}

function humanBillingType(value?: string | null) {
  const labels: Record<string, string> = {
    PIX: "Pix",
    BOLETO: "Boleto",
    CREDIT_CARD: "Cartão de crédito",
    DEBIT_CARD: "Cartão de débito",
    TRANSFER: "Transferência",
    DEPOSIT: "Depósito",
    UNDEFINED: "Forma não informada",
  };
  return labels[value ?? ""] ?? value ?? "Forma não informada";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}
