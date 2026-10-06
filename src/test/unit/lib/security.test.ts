import { describe, expect, it } from "vitest";
import {
  clearActionLocks,
  getUploadFileType,
  isValidDateString,
  isValidPeriodRange,
  parseMoneyAmount,
  releaseActionLock,
  sanitizeText,
  tryAcquireActionLock,
  validateUploadFile,
} from "@/lib/security";

describe("security helpers", () => {
  it("sanitizeText normaliza espaços e limita tamanho", () => {
    expect(sanitizeText("  iFood   -  Jantar  ", 120)).toBe("iFood - Jantar");
    expect(sanitizeText("a".repeat(200), 120)).toHaveLength(120);
  });

  it("parseMoneyAmount rejeita valores inválidos ou abusivos", () => {
    expect(parseMoneyAmount("45.90")).toBe(45.9);
    expect(parseMoneyAmount("45,90")).toBe(45.9);
    expect(parseMoneyAmount("0")).toBeNull();
    expect(parseMoneyAmount("-10")).toBeNull();
    expect(parseMoneyAmount("abc")).toBeNull();
    expect(parseMoneyAmount("9999999999")).toBeNull();
    expect(parseMoneyAmount(null)).toBeNull();
  });

  it("isValidDateString valida formato e data real", () => {
    expect(isValidDateString("2026-10-01")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("01/10/2026")).toBe(false);
    expect(isValidDateString("1999-12-31")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("isValidPeriodRange limita janela de sincronização", () => {
    expect(isValidPeriodRange("2026-10-01", "2026-10-31")).toBe(true);
    expect(isValidPeriodRange("2026-10-31", "2026-10-01")).toBe(false);
    expect(isValidPeriodRange("2026-01-01", "2027-06-01")).toBe(false);
    expect(isValidPeriodRange("invalida", "2026-10-01")).toBe(false);
  });

  it("getUploadFileType aceita só csv/ofx/pdf", () => {
    expect(getUploadFileType("extrato.CSV")).toBe("csv");
    expect(getUploadFileType("extrato.ofx")).toBe("ofx");
    expect(getUploadFileType("extrato.pdf")).toBe("pdf");
    expect(getUploadFileType("foto.png")).toBeNull();
    expect(getUploadFileType("sem-extensao")).toBeNull();
  });

  it("validateUploadFile barra tipo inválido e arquivo gigante", () => {
    expect(validateUploadFile({ name: "extrato.csv", size: 1024 })).toBeNull();
    expect(validateUploadFile({ name: "foto.png", size: 1024 })).toContain("Arquivo inválido");
    expect(validateUploadFile({ name: "extrato.pdf", size: 50 * 1024 * 1024 })).toContain("muito grande");
    expect(validateUploadFile({ name: "extrato.csv", size: 0 })).toContain("tamanho");
  });

  it("tryAcquireActionLock bloqueia segunda chamada na janela", () => {
    clearActionLocks();
    expect(tryAcquireActionLock("asaas:user-1:2026-10", 60000, 1000)).toBe(true);
    expect(tryAcquireActionLock("asaas:user-1:2026-10", 60000, 2000)).toBe(false);
    expect(tryAcquireActionLock("asaas:user-1:2026-10", 60000, 70000)).toBe(true);
    expect(tryAcquireActionLock("ia:user-1:monthly", 60000, 2000)).toBe(true);
    clearActionLocks();
  });

  it("releaseActionLock libera a chave para nova acao legitima", () => {
    clearActionLocks();
    expect(tryAcquireActionLock("entry-status:user-1:entry-1", 60000, 1000)).toBe(true);
    expect(tryAcquireActionLock("entry-status:user-1:entry-1", 60000, 2000)).toBe(false);
    releaseActionLock("entry-status:user-1:entry-1");
    expect(tryAcquireActionLock("entry-status:user-1:entry-1", 60000, 2000)).toBe(true);
    clearActionLocks();
  });
});
