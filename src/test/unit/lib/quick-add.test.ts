import { describe, expect, it } from "vitest";
import { parseQuickAddParam, quickAddEntryType, quickAddRoute } from "@/lib/quick-add";

describe("quick-add (?novo=)", () => {
  it("interpreta os valores aceitos pelo deep-link", () => {
    expect(parseQuickAddParam("gasto")).toBe("gasto");
    expect(parseQuickAddParam("expense")).toBe("gasto");
    expect(parseQuickAddParam("ganho")).toBe("ganho");
    expect(parseQuickAddParam("income")).toBe("ganho");
    expect(parseQuickAddParam("1")).toBe("transferencia");
    expect(parseQuickAddParam("transferencia")).toBe("transferencia");
  });

  it("rejeita valores ausentes ou inválidos", () => {
    expect(parseQuickAddParam(undefined)).toBeNull();
    expect(parseQuickAddParam(null)).toBeNull();
    expect(parseQuickAddParam("")).toBeNull();
    expect(parseQuickAddParam("xyz")).toBeNull();
    expect(parseQuickAddParam(1)).toBeNull();
  });

  it("mapeia tipo de entrada e rota de navegação", () => {
    expect(quickAddEntryType("gasto")).toBe("expense");
    expect(quickAddEntryType("ganho")).toBe("income");
    expect(quickAddEntryType("transferencia")).toBeNull();
    expect(quickAddRoute("gasto")).toEqual({ to: "/transacoes", search: { novo: "gasto" } });
    expect(quickAddRoute("ganho")).toEqual({ to: "/transacoes", search: { novo: "ganho" } });
    expect(quickAddRoute("transferencia")).toEqual({ to: "/transferencias", search: { novo: "1" } });
  });
});
