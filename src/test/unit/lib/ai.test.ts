import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiInputSummary, buildAiPrompt, callAiProviderWithFallback, parseAiResponse, validateAiResponse, type AiAnalysisType } from "@/lib/ai";
import type { Account, Category, FinancialEntry, Financing, SavingsGoal } from "@/types/database";

describe("ai", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("consolida dados sem enviar descrições brutas nem nomes de contas", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      entries: [
        entry({ description: "Cliente Pessoa Sensível", entry_type: "income", expected_amount: 5000, actual_amount: 4800, status: "paid", category_id: "income" }),
        entry({ description: "CPF 12345678900 mercado", entry_type: "expense", expected_amount: 1000, actual_amount: 1250, status: "paid", category_id: "expense" }),
      ],
      accounts: [account({ id: "account-real", name: "Santander Jonas 12345" })],
      categories: [category({ id: "income", name: "Ganhos variáveis", type: "income" }), category({ id: "expense", name: "Alimentação 123456", type: "expense" })],
      goals: [goal({ monthly_target: 50 })],
      financings: [financing({ installment_amount: 800, total_installments: 10, paid_installments: 2 })],
    });

    expect(summary.totals.actualIncome).toBe(4800);
    expect(summary.totals.actualExpenses).toBe(1250);
    expect(summary.financialDiagnosis.status).toBe("healthy");
    expect(summary.accounts[0]?.label).toBe("Conta 1");
    expect(JSON.stringify(summary)).not.toContain("Cliente Pessoa");
    expect(JSON.stringify(summary)).not.toContain("Santander Jonas");
    expect(JSON.stringify(summary)).not.toContain("12345678900");
    expect(summary.adjustableEntries.length).toBeGreaterThan(0);
    expect(summary.adjustableEntries[0]?.accountLabel).not.toContain("Santander Jonas");
    expect(summary.privacy).toEqual({ rawDescriptionsSent: false, accountNamesSanitized: true, onlyAggregatedData: false, limitedSanitizedEntryCandidates: true });
  });

  it("gera prompt com regras de segurança e formato JSON", () => {
    const prompt = buildAiPrompt("savings", minimalSummary("savings"));

    expect(prompt).toContain("Nao sugira investimento especifico");
    expect(prompt).toContain("Retorne apenas JSON valido");
    expect(prompt).toContain("A IA nao pode criar, editar ou excluir lancamentos");
  });

  it("marca saldo negativo como crítico mesmo quando melhor que o planejado", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      entries: [
        entry({ entry_type: "income", expected_amount: 5000, actual_amount: 5000, status: "paid" }),
        entry({ entry_type: "expense", expected_amount: 9700, actual_amount: 9600, status: "paid" }),
      ],
      accounts: [account({})],
      categories: [category({})],
      goals: [goal({ monthly_target: 200 })],
      financings: [],
    });
    const prompt = buildAiPrompt("monthly", summary);

    expect(summary.totals.actualBalance).toBe(-4600);
    expect(summary.plannedVsActual.balanceDifference).toBe(100);
    expect(summary.financialDiagnosis.status).toBe("critical");
    expect(summary.financialDiagnosis.mainReason).toBe("expenses_higher_than_income");
    expect(summary.financialDiagnosis.breakEvenGap).toBe(4600);
    expect(summary.financialDiagnosis.monthlyGoalGap).toBe(4800);
    expect(summary.financialDiagnosis.planWasDeficit).toBe(true);
    expect(summary.financialDiagnosis.planQuality).toBe("deficit_planned");
    expect(prompt).toContain("Nao use tom de \"bom\"");
    expect(prompt).toContain("planejamento do periodo ja nasceu deficitario");
  });

  it("corrige resposta otimista quando o diagnóstico é crítico", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      entries: [
        entry({ entry_type: "income", expected_amount: 5000, actual_amount: 5000, status: "paid" }),
        entry({ entry_type: "expense", expected_amount: 9700, actual_amount: 9600, status: "paid" }),
      ],
      accounts: [account({})],
      categories: [category({})],
      goals: [goal({ monthly_target: 200 })],
      financings: [],
    });
    const guarded = validateAiResponse(parseAiResponse(JSON.stringify({ resumo: "O mês foi bom e saudável porque ficou melhor que o planejado.", meta_de_economia: "Tudo certo" })), summary);

    expect(guarded.resumo).toContain("fechou negativo");
    expect(guarded.diagnostico_numerico.join(" ")).toContain("menos ruim");
    expect(guarded.meta_de_economia).toContain("Meta nao atingida");
  });

  it("parseia resposta JSON e mantém fallback para texto simples", () => {
    const parsed = parseAiResponse(JSON.stringify({ resumo: "Resumo", pontos_de_atencao: ["Atenção"], onde_cortar_gastos: ["Corte"], proximas_acoes: ["Ação"], meta_de_economia: "R$ 50", aviso: "Aviso" }));
    expect(parsed.resumo).toBe("Resumo");
    expect(parsed.proximas_acoes).toEqual(["Ação"]);

    const fallback = parseAiResponse("Texto livre");
    expect(fallback.resumo).toBe("Texto livre");
    expect(fallback.aviso).toContain("apoio");
  });

  it("converte objetos da IA em itens legíveis nas listas", () => {
    const parsed = parseAiResponse(JSON.stringify({
      resumo: "Resumo",
      lancamentos_para_revisar: [{ label: "Pix sanitizado", valor: 3416.4, motivo: "valor relevante" }],
      onde_cortar_gastos: [{ categoria: "Gastos variáveis", valor: "R$ 3.416,40", acao: "revisar classificação" }],
    }));

    expect(parsed.lancamentos_para_revisar[0]).toBe("Pix sanitizado - R$ 3.416,40 - valor relevante");
    expect(parsed.onde_cortar_gastos[0]).toContain("Gastos variáveis");
    expect(parsed.lancamentos_para_revisar[0]).not.toBe("[object Object]");
  });

  it("prioriza lançamentos ajustáveis de maior valor", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      entries: [
        entry({ description: "Previsto pequeno", entry_type: "expense", expected_amount: 50, actual_amount: null, status: "planned" }),
        entry({ description: "Gasto grande", entry_type: "expense", expected_amount: 3416.4, actual_amount: 3416.4, status: "paid", source: "imported" }),
      ],
      accounts: [account({})],
      categories: [category({})],
      goals: [],
      financings: [],
    });

    expect(summary.adjustableEntries[0]?.label).toBe("Gasto grande");
    expect(summary.adjustableEntries[0]?.amount).toBe(3416.4);
  });

  it("marca possíveis duplicidades e transferências internas nos candidatos", () => {
    const summary = buildAiInputSummary({
      analysisType: "monthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      entries: [
        entry({ id: "expense-1", description: "Saída duplicada A", entry_type: "expense", expected_amount: 3416.4, actual_amount: 3416.4, status: "paid", paid_date: "2026-09-10", due_date: "2026-09-10", source: "imported" }),
        entry({ id: "expense-2", description: "Saída duplicada B", entry_type: "expense", expected_amount: 3416.4, actual_amount: 3416.4, status: "paid", paid_date: "2026-09-10", due_date: "2026-09-10", source: "imported" }),
        entry({ id: "income-1", description: "Entrada parecida", entry_type: "income", expected_amount: 3416.4, actual_amount: 3416.4, status: "paid", paid_date: "2026-09-11", due_date: "2026-09-11", source: "imported" }),
      ],
      accounts: [account({})],
      categories: [category({})],
      goals: [],
      financings: [],
    });

    const firstReason = summary.adjustableEntries[0]?.reason ?? "";
    expect(firstReason).toContain("possivel duplicidade");
    expect(firstReason).toContain("possivel transferencia interna");
  });

  it("usa Groq como fallback quando Gemini falha", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ resumo: "Fallback ok" }) } }] }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await callAiProviderWithFallback({ provider: "gemini", model: "gemini-3.8-flash", configured: true, apiKey: "gemini-test-key" }, "prompt");

    expect(result.provider).toBe("groq");
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.fallback).toBe(true);
    expect(result.text).toContain("Fallback ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repete Groq sem response_format quando o provider rejeita JSON mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "response_format not supported" } }), { status: 400, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ resumo: "Groq ok" }) } }] }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await callAiProviderWithFallback({ provider: "groq", model: "openai/gpt-oss-20b", configured: true, apiKey: "groq-test-key" }, "prompt JSON");
    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(result.text).toContain("Groq ok");
    expect(firstPayload.response_format).toEqual({ type: "json_object" });
    expect(secondPayload.response_format).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function minimalSummary(analysisType: AiAnalysisType) {
  return buildAiInputSummary({
    analysisType,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    entries: [entry({})],
    accounts: [account({})],
    categories: [category({})],
    goals: [],
    financings: [],
  });
}

function entry(overrides: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    monthly_balance_id: "balance-1",
    account_id: "account-1",
    category_id: "category-1",
    entry_type: "expense",
    status: "paid",
    description: "Descrição sensível",
    expected_amount: 100,
    actual_amount: 90,
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

function account(overrides: Partial<Account>): Account {
  return {
    id: "account-1",
    user_id: "user-1",
    name: "Conta real",
    type: "personal",
    bank: "Banco",
    description: null,
    initial_balance: 0,
    is_active: true,
    color: null,
    icon: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function category(overrides: Partial<Category>): Category {
  return {
    id: "category-1",
    user_id: null,
    name: "Gastos variáveis",
    icon: null,
    color: null,
    type: "expense",
    parent_id: null,
    is_default: true,
    is_active: true,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function goal(overrides: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: "goal-1",
    user_id: "user-1",
    name: "Reserva",
    target_amount: 1000,
    current_amount: 0,
    monthly_target: 50,
    deadline: null,
    is_active: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function financing(overrides: Partial<Financing>): Financing {
  return {
    id: "financing-1",
    user_id: "user-1",
    account_id: "account-1",
    category_id: "category-1",
    name: "Financiamento",
    original_amount: 10000,
    installment_amount: 500,
    total_installments: 20,
    paid_installments: 0,
    due_day: 10,
    start_date: "2026-01-01",
    status: "active",
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}
