/**
 * Helpers de segurança e performance (Semana 10.1).
 *
 * Centraliza limites de texto/upload, validação de valores e datas,
 * fetch com timeout para integrações externas e lock simples em memória
 * (best-effort) contra ações duplicadas por clique/toque repetido.
 *
 * O lock em memória NÃO é distribuído: em serverless (Vercel) cada
 * instância tem seu próprio mapa. Ele evita o duplo clique na mesma
 * instância; a proteção definitiva continua sendo o botão desabilitado
 * no frontend + deduplicação por external_id/fingerprint no banco.
 */

export const DESCRIPTION_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 80;
export const FILENAME_MAX_LENGTH = 120;

export const MAX_MONEY_AMOUNT = 999999999.99;

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_PAGES = 50;
export const MAX_IMPORT_ROWS = 5000;
export const ALLOWED_UPLOAD_EXTENSIONS = ["csv", "ofx", "pdf"] as const;

export type UploadFileType = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export function sanitizeText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function parseMoneyAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const normalized = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  if (normalized > MAX_MONEY_AMOUNT) return null;
  return Math.round(normalized * 100) / 100;
}

export function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-").map(Number);
  const year = yearRaw ?? 0;
  const month = monthRaw ?? 0;
  const day = dayRaw ?? 0;
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidPeriodRange(start: string, end: string, maxDays = 366) {
  if (!isValidDateString(start) || !isValidDateString(end)) return false;
  if (start > end) return false;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  return days <= maxDays;
}

export function getUploadFileType(fileName: string): UploadFileType | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "ofx" || extension === "pdf") return extension;
  return null;
}

export function validateUploadFile(file: { name: string; size: number }): string | null {
  const fileType = getUploadFileType(file.name);
  if (!fileType) {
    return "Arquivo inválido. Envie um CSV, OFX ou PDF de extrato exportado pelo banco.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Não consegui ler o tamanho do arquivo. Tente novamente.";
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Arquivo muito grande (limite de 10 MB). Exporte um período menor e tente de novo.";
  }
  return null;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("O serviço externo demorou demais. Tente novamente em alguns minutos.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const actionLocks = new Map<string, number>();

/**
 * Tenta adquirir um lock simples por chave (usuário/ação/período).
 * Retorna true na primeira chamada dentro da janela; false se ainda bloqueado.
 */
export function tryAcquireActionLock(key: string, ttlMs = 60000, now = Date.now()) {
  const expiresAt = actionLocks.get(key);
  if (expiresAt !== undefined && expiresAt > now) return false;
  actionLocks.set(key, now + ttlMs);
  return true;
}

export function clearActionLocks() {
  actionLocks.clear();
}
