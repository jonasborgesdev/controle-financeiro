import { describe, expect, it } from "vitest";
import { markDuplicates, normalizeDate, normalizeMoney, parseCsv, parseNubankPdfText, parseOfx, parseStatement, similarDescription, suggestCategoryId } from "@/lib/importer";
import type { Category, FinancialEntry } from "@/types/database";

const categories = [
  baseCategory("expense-variable", "Gastos variáveis", "expense"),
  baseCategory("expense-fixed", "Gastos fixos", "expense"),
  baseCategory("income-variable", "Ganhos variáveis", "income"),
] satisfies Category[];

describe("statement importer", () => {
  it("parseia CSV Nubank com vírgula e data ISO", () => {
    const csv = "Data,Descrição,Valor,Tipo\n2026-03-15,iFood - Jantar,-45.90,Compra\n2026-03-16,PIX recebido,1500.00,Pix";

    expect(parseCsv(csv, "nubank")).toEqual([
      expect.objectContaining({ date: "2026-03-15", description: "iFood - Jantar", amount: 45.9, type: "expense" }),
      expect.objectContaining({ date: "2026-03-16", description: "PIX recebido", amount: 1500, type: "income" }),
    ]);
  });

  it("parseia CSV Santander com ponto e vírgula e decimal brasileiro", () => {
    const csv = "Data;Descrição;Valor;Tipo\n15/03/2026;UBER TRIP;-22,35;DÉBITO\n16/03/2026;SALARIO;5.000,00;CRÉDITO";

    expect(parseCsv(csv, "santander")).toEqual([
      expect.objectContaining({ date: "2026-03-15", amount: 22.35, type: "expense" }),
      expect.objectContaining({ date: "2026-03-16", amount: 5000, type: "income" }),
    ]);
  });

  it("normaliza datas e valores monetários", () => {
    expect(normalizeDate("2026-09-29")).toBe("2026-09-29");
    expect(normalizeDate("29/09/2026")).toBe("2026-09-29");
    expect(normalizeMoney("R$ 1.234,56")).toBe(1234.56);
    expect(normalizeMoney("-45.90")).toBe(-45.9);
    expect(normalizeMoney("43,42-")).toBe(-43.42);
  });

  it("parseia transações OFX básicas", () => {
    const ofx = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260315000000[-3:BRT]<TRNAMT>-45.90<FITID>abc123<MEMO>NETFLIX COM BR</STMTTRN></BANKTRANLIST></OFX>`;

    expect(parseOfx(ofx)).toEqual([
      expect.objectContaining({ date: "2026-03-15", description: "NETFLIX COM BR", amount: 45.9, type: "expense", externalId: "abc123" }),
    ]);
  });

  it("parseia extrato PDF Nubank extraído como texto e ignora RDB/total/saldo", () => {
    const text = `
      05 AGO 2026 Total de entradas + 4.635,00
      Transferência recebida pelo Pix AGENCIA WEBNAUTA DIG - 16.658.746/0001-27 - BANCO INTER
      4.500,00
      Resgate RDB 135,00
      Total de saídas - 4.646,45
      Aplicação RDB 100,00
      Transferência enviada pelo Pix RECEITA FEDERAL - 00.394.460/0058-87 - ITAÚ UNIBANCO S.A.
      86,05
      Compra no débito 43.914.435 GABRIELLA G 95,00
      Saldo do dia 0,00
      24 AGO 2026 Total de entradas + 85,79
      Transferência recebida pelo Pix JONAS BORGES DA SILVA 13423333731 - 26.460.470/0001-21 - ASAAS IP S.A.
      85,79
    `;

    expect(parseNubankPdfText(text)).toEqual([
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 4500, description: expect.stringContaining("Transferência recebida") }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 86.05, description: expect.stringContaining("RECEITA FEDERAL") }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 95, description: "Compra no débito 43.914.435 GABRIELLA G" }),
      expect.objectContaining({ date: "2026-08-24", type: "income", amount: 85.79, description: expect.stringContaining("ASAAS") }),
    ]);
  });

  it("parseia PDF Nubank quando o texto vem achatado sem quebras por transação", () => {
    const text = "05 AGO 2026 Total de entradas + 4.635,00 Transferência recebida pelo Pix AGENCIA WEBNAUTA DIG - 16.658.746/0001-27 - BANCO INTER (0077) Agência: 1 Conta: 5579948-5 4.500,00 Resgate RDB 135,00 Total de saídas - 4.646,45 Aplicação RDB 100,00 Transferência enviada pelo Pix RECEITA FEDERAL - 00.394.460/0058-87 - ITAÚ UNIBANCO S.A. (0341) Agência: 332 Conta: 81010-0 86,05 Compra no débito 43.914.435 GABRIELLA G 95,00 Saldo do dia 0,00 24 AGO 2026 Total de entradas + 85,79 Transferência recebida pelo Pix JONAS BORGES DA SILVA 13423333731 - 26.460.470/0001-21 - ASAAS IP S.A. (0461) Agência: 1 Conta: 860914-2 85,79 Saldo do dia 218,96";

    expect(parseNubankPdfText(text)).toEqual([
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 4500, description: expect.stringContaining("AGENCIA WEBNAUTA") }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 86.05, description: expect.stringContaining("RECEITA FEDERAL") }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 95, description: "Compra no débito 43.914.435 GABRIELLA G" }),
      expect.objectContaining({ date: "2026-08-24", type: "income", amount: 85.79, description: expect.stringContaining("ASAAS") }),
    ]);
  });

  it("parseia PDF tabular de extrato sem depender do banco selecionado", () => {
    const text = `
      EXTRATO CONSOLIDADO
      agosto/2026
      Santander
      Conta Corrente
      Movimentação
      Data Descrição Nº Documento Movimento (R$) Saldo (R$)
      SALDO EM 31/07 67,80
      03/08 PIX ENVIADO PARAISO LUBRIFICANTES LTD 43,42- 24,38
      05/08 PIX RECEBIDO
      53 808 756 ISADORA CRISTI
      2.301,44
      PIX RECEBIDO JONAS BORGES DA SILVA 134
      3.290,00
      PIX ENVIADO Jonas Borges da Silva
      476,00-
      06/08 DEBITO VISA ELECTRON BRASIL
      06/08 TREVISAN CERVEJARIA
      193769 80,00- 245,36
      10/08 PIX RECEBIDO JONAS BORGES DA SILVA - 124,04
      DEBITO VISA ELECTRON BRASIL
      08/08 REST FRANGO ASSADO
      183269 148,30-
      Saldos por Período
      Dia Saldo de Conta Corrente
      17 175,43 0,00 0,00
    `;

    expect(parseStatement(text, "pdf", "automatic")).toEqual([
      expect.objectContaining({ date: "2026-08-03", type: "expense", amount: 43.42, description: "PIX ENVIADO PARAISO LUBRIFICANTES LTD" }),
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 2301.44, description: "PIX RECEBIDO 53 808 756 ISADORA CRISTI" }),
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 3290, description: "PIX RECEBIDO JONAS BORGES DA SILVA 134" }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 476, description: "PIX ENVIADO Jonas Borges da Silva" }),
      expect.objectContaining({ date: "2026-08-06", type: "expense", amount: 80, description: "DEBITO VISA ELECTRON BRASIL TREVISAN CERVEJARIA 193769" }),
      expect.objectContaining({ date: "2026-08-10", type: "income", amount: 124.04, description: "PIX RECEBIDO JONAS BORGES DA SILVA" }),
      expect.objectContaining({ date: "2026-08-10", type: "expense", amount: 148.3, description: "DEBITO VISA ELECTRON BRASIL REST FRANGO ASSADO 183269" }),
    ]);
  });

  it("parseia PDF mesmo quando a extração não preserva cabeçalho de movimentação", () => {
    const text = `
      EXTRATO CONSOLIDADO agosto/2026
      03/08 PIX ENVIADO PARAISO LUBRIFICANTES LTD 43,42- 24,38
      05/08 PIX RECEBIDO
      53 808 756 ISADORA CRISTI
      2.301,44
      PIX ENVIADO Jonas Borges da Silva
      476,00-
      Saldos por Período
      03 24,38 0,00 0,00
    `;

    expect(parseStatement(text, "pdf", "automatic")).toEqual([
      expect.objectContaining({ date: "2026-08-03", type: "expense", amount: 43.42, description: "PIX ENVIADO PARAISO LUBRIFICANTES LTD" }),
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 2301.44, description: "PIX RECEBIDO 53 808 756 ISADORA CRISTI" }),
      expect.objectContaining({ date: "2026-08-05", type: "expense", amount: 476, description: "PIX ENVIADO Jonas Borges da Silva" }),
    ]);
  });

  it("parseia PDF com texto extraído quebrado em uma letra por linha", () => {
    const compacted = "EXTRATO CONSOLIDADOagosto/2026Movimentação03/08PIXENVIADOPARAISOLUBRIFICANTESLTD-43,42-24,3805/08PIXRECEBIDOJONASBORGESDASILVA-1.000,3206/08DEBITOVISAELECTRONBRASIL06/08TREVISANCERVEJARIA19376980,00-245,36SALDOEM31/08179,82-";
    const text = compacted.split("").join("\n");

    expect(parseStatement(text, "pdf", "automatic")).toEqual([
      expect.objectContaining({ date: "2026-08-03", type: "expense", amount: 43.42, description: expect.stringContaining("PIX ENVIADO") }),
      expect.objectContaining({ date: "2026-08-05", type: "income", amount: 1000.32, description: expect.stringContaining("PIX RECEBIDO") }),
      expect.objectContaining({ date: "2026-08-06", type: "expense", amount: 80, description: expect.stringContaining("DEBITO VISA ELECTRON BRASIL") }),
    ]);
  });

  it("sugere classificação automática simples", () => {
    expect(suggestCategoryId({ description: "IFOOD SAO PAULO", type: "expense" }, categories, "user-1")).toBe("expense-variable");
    expect(suggestCategoryId({ description: "PIX recebido cliente", type: "income" }, categories, "user-1")).toBe("income-variable");
    expect(suggestCategoryId({ description: "NETFLIX", type: "expense" }, categories, "user-1")).toBe("expense-fixed");
  });

  it("marca possíveis duplicatas por conta, data próxima, valor e descrição parecida", () => {
    const existing = [baseEntry({ description: "iFood Jantar", due_date: "2026-03-15", actual_amount: 45.9 })];
    const [item] = markDuplicates([
      { id: "1", date: "2026-03-16", description: "IFOOD - JANTAR", amount: 45.9, type: "expense", externalId: null },
    ], existing, "account-1");

    expect(item).toBeDefined();
    expect(item!.duplicate).toBe(true);
    expect(item!.selected).toBe(false);
    expect(similarDescription("iFood Jantar", "IFOOD - JANTAR")).toBe(true);
  });
});

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
    created_at: "2026-01-01T00:00:00Z",
  };
}

function baseEntry(overrides: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    monthly_balance_id: "balance-1",
    account_id: "account-1",
    category_id: "expense-variable",
    entry_type: "expense",
    status: "paid",
    description: "Lançamento",
    expected_amount: 45.9,
    actual_amount: 45.9,
    due_date: "2026-03-15",
    paid_date: "2026-03-15",
    source: "manual",
    recurring_rule_id: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
