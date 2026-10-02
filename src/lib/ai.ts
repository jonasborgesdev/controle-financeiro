import { createServerFn } from "@tanstack/react-start";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildAnnualReport, buildMonthlyReport } from "@/lib/reports";
import { formatCurrency, monthBounds } from "@/lib/finance";
import { splitEntries, summarizeInternalMovements } from "@/lib/transfers";
import { isValidPeriodRange, tryAcquireActionLock } from "@/lib/security";
import type { Account, AiAnalysis, Category, FinancialEntry, Financing, IntegrationSetting, Json, SavingsGoal } from "@/types/database";

export type AiAnalysisType = "monthly" | "annual" | "savings" | "planning";
export type AiProvider = "gemini" | "groq";

export interface AiStructuredResponse {
  resumo: string;
  diagnostico_numerico: string[];
  pontos_de_atencao: string[];
  lancamentos_para_revisar: string[];
  onde_cortar_gastos: string[];
  ajustes_recomendados: string[];
  proximas_acoes: string[];
  meta_de_economia: string;
  aviso: string;
}

export interface AiInputSummary {
  analysisType: AiAnalysisType;
  period: { start: string; end: string; label: string };
  dataFingerprint: string;
  counts: { entries: number; paidEntries: number; plannedEntries: number; expenseEntries: number; incomeEntries: number };
  totals: {
    expectedIncome: number;
    actualIncome: number;
    expectedExpenses: number;
    actualExpenses: number;
    expectedBalance: number;
    actualBalance: number;
  };
  plannedVsActual: {
    incomeDifference: number;
    expenseDifference: number;
    balanceDifference: number;
  };
  financialDiagnosis: {
    status: "critical" | "attention" | "healthy";
    mainReason: string;
    secondaryReasons: string[];
    message: string;
    expenseIncomeRatio: number | null;
    breakEvenGap: number;
    monthlyGoalGap: number;
    planWasDeficit: boolean;
    planQuality: "deficit_planned" | "tight_plan" | "positive_plan" | "missing_plan";
    interpretationRule: string;
  };
  topExpenseCategories: Array<{ name: string; planned: number; actual: number; variance: number; percentOfExpenses: number }>;
  categoriesOverPlanned: Array<{ name: string; planned: number; actual: number; overBy: number }>;
  adjustableEntries: Array<{ label: string; date: string; category: string; accountLabel: string; amount: number; status: "paid" | "planned"; source: string; reason: string }>;
  accounts: Array<{ label: string; actualIncome: number; actualExpenses: number; actualBalance: number }>;
  savingsGoal: { name: string; monthlyTarget: number; currentAmount: number; reachedInPeriod: boolean | null } | null;
  financings: { activeCount: number; monthlyCommitment: number; remainingEstimated: number };
  monthlyTrend: Array<{ month: string; income: number; expenses: number; balance: number }>;
  internalTransfers: { count: number; expectedTotal: number; actualTotal: number };
  alerts: string[];
  privacy: { rawDescriptionsSent: false; accountNamesSanitized: true; onlyAggregatedData: false; limitedSanitizedEntryCandidates: true };
}

const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,external_id,transfer_group_id,financing_id,installment_year,installment_month,notes,created_at,updated_at";
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const goalColumns = "id,user_id,name,target_amount,current_amount,monthly_target,deadline,is_active,created_at,updated_at";
const financingColumns = "id,user_id,account_id,category_id,name,original_amount,installment_amount,total_installments,paid_installments,due_day,start_date,status,notes,created_at,updated_at";
const analysisColumns = "id,user_id,analysis_type,period_start,period_end,input_summary,ai_response,model_used,created_at";
const settingsColumns = "id,user_id,provider,enabled,environment,default_account_id,default_category_id,last_sync_at,created_at,updated_at";

export function getAiProviderConfig() {
  const configuredProvider = (process.env["AI_PROVIDER"] ?? "gemini").toLowerCase();
  const provider: AiProvider = configuredProvider === "groq" ? "groq" : "gemini";
  const model = provider === "groq" ? process.env["GROQ_MODEL"] || "openai/gpt-oss-20b" : process.env["GEMINI_MODEL"] || "gemini-3.8-flash";
  const apiKey = provider === "groq" ? process.env["GROQ_API_KEY"] : process.env["GEMINI_API_KEY"];
  return { provider, model, configured: Boolean(apiKey), apiKey: apiKey ?? null };
}

export function getAiFallbackProviderConfig(primaryProvider: AiProvider) {
  const provider: AiProvider = primaryProvider === "gemini" ? "groq" : "gemini";
  const model = provider === "groq" ? process.env["GROQ_MODEL"] || "openai/gpt-oss-20b" : process.env["GEMINI_MODEL"] || "gemini-3.8-flash";
  const apiKey = provider === "groq" ? process.env["GROQ_API_KEY"] : process.env["GEMINI_API_KEY"];
  return { provider, model, configured: Boolean(apiKey), apiKey: apiKey ?? null };
}

export function buildAiInputSummary(input: { analysisType: AiAnalysisType; periodStart: string; periodEnd: string; entries: FinancialEntry[]; trendEntries?: FinancialEntry[]; accounts: Account[]; categories: Category[]; goals: SavingsGoal[]; financings: Financing[] }) : AiInputSummary {
  // Semana 10.2: transferências saem dos totais/candidatos/tendência e viram
  // movimentação interna citada à parte (nunca receita nova nem corte).
  const { real: realEntries, internal: internalEntries } = splitEntries(input.entries, input.categories);
  const { real: realTrendEntries } = splitEntries(input.trendEntries ?? input.entries, input.categories);
  const internalTotals = summarizeInternalMovements(internalEntries);
  const entries = realEntries;
  const periodLabel = input.periodStart.slice(0, 7) === input.periodEnd.slice(0, 7) ? input.periodStart.slice(0, 7) : `${input.periodStart} a ${input.periodEnd}`;
  const year = Number(input.periodStart.slice(0, 4));
  const monthly = buildMonthlyReport(entries, input.accounts, input.categories, input.goals);
  const annual = buildAnnualReport(entries, input.accounts, input.categories, input.goals, year);
  const report = input.analysisType === "annual" || input.analysisType === "planning" ? annual : monthly;
  const summary = report.summary;
  const byCategory = report.byCategory
    .filter((row) => row.actualExpenses > 0 || row.expectedExpenses > 0)
    .slice(0, 8)
    .map((row) => ({
      name: sanitizeLabel(row.name, "Classificacao"),
      planned: roundMoney(row.expectedExpenses),
      actual: roundMoney(row.actualExpenses),
      variance: roundMoney(row.actualExpenses - row.expectedExpenses),
      percentOfExpenses: summary.actualExpenses > 0 ? roundPercent((row.actualExpenses / summary.actualExpenses) * 100) : 0,
    }));
  const categoriesOverPlanned = byCategory
    .filter((category) => category.planned > 0 && category.actual > category.planned)
    .map((category) => ({ name: category.name, planned: category.planned, actual: category.actual, overBy: roundMoney(category.actual - category.planned) }))
    .slice(0, 6);
  const byAccount = report.byAccount.slice(0, 6).map((row, index) => ({
    label: `Conta ${index + 1}`,
    actualIncome: roundMoney(row.actualIncome),
    actualExpenses: roundMoney(row.actualExpenses),
    actualBalance: roundMoney(row.actualBalance),
  }));
  const activeGoal = input.goals.find((goal) => goal.is_active) ?? null;
  const monthlyTarget = Number(activeGoal?.monthly_target || 50);
  const financialDiagnosis = buildFinancialDiagnosis(summary, monthlyTarget);
  const activeFinancings = input.financings.filter((financing) => financing.status === "active");
  const monthlyCommitment = activeFinancings.reduce((total, financing) => total + Number(financing.installment_amount), 0);
  const remainingEstimated = activeFinancings.reduce((total, financing) => total + Math.max(0, financing.total_installments - financing.paid_installments) * Number(financing.installment_amount), 0);
  const trend = monthlyTrend(realTrendEntries);
  const alerts = buildAggregatedAlerts(summary, byCategory, monthlyTarget, monthlyCommitment);
  const adjustableEntries = buildAdjustableEntries(entries, input.accounts, input.categories, categoriesOverPlanned.map((category) => category.name));
  const counts = {
    entries: entries.length,
    paidEntries: entries.filter((entry) => entry.status === "paid").length,
    plannedEntries: entries.filter((entry) => entry.status === "planned").length,
    expenseEntries: entries.filter((entry) => entry.entry_type === "expense").length,
    incomeEntries: entries.filter((entry) => entry.entry_type === "income").length,
  };
  const fingerprint = analysisFingerprint({
    type: input.analysisType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    counts,
    totals: summary,
    financialDiagnosis,
    categories: byCategory,
    adjustableEntries,
  });

  return {
    analysisType: input.analysisType,
    period: { start: input.periodStart, end: input.periodEnd, label: periodLabel },
    dataFingerprint: fingerprint,
    counts,
    totals: {
      expectedIncome: roundMoney(summary.expectedIncome),
      actualIncome: roundMoney(summary.actualIncome),
      expectedExpenses: roundMoney(summary.expectedExpenses),
      actualExpenses: roundMoney(summary.actualExpenses),
      expectedBalance: roundMoney(summary.expectedBalance),
      actualBalance: roundMoney(summary.actualBalance),
    },
    plannedVsActual: {
      incomeDifference: roundMoney(summary.actualIncome - summary.expectedIncome),
      expenseDifference: roundMoney(summary.actualExpenses - summary.expectedExpenses),
      balanceDifference: roundMoney(summary.actualBalance - summary.expectedBalance),
    },
    financialDiagnosis,
    topExpenseCategories: byCategory,
    categoriesOverPlanned,
    adjustableEntries,
    accounts: byAccount,
    savingsGoal: activeGoal ? {
      name: sanitizeLabel(activeGoal.name, "Meta"),
      monthlyTarget: roundMoney(monthlyTarget),
      currentAmount: roundMoney(Number(activeGoal.current_amount || 0)),
      reachedInPeriod: Number(activeGoal.monthly_target || 0) > 0 ? summary.actualBalance >= Number(activeGoal.monthly_target) : null,
    } : { name: "Meta mínima", monthlyTarget: 50, currentAmount: 0, reachedInPeriod: summary.actualBalance >= 50 },
    financings: {
      activeCount: activeFinancings.length,
      monthlyCommitment: roundMoney(monthlyCommitment),
      remainingEstimated: roundMoney(remainingEstimated),
    },
    monthlyTrend: trend,
    internalTransfers: {
      count: internalEntries.length,
      expectedTotal: roundMoney(internalTotals.expectedTotal),
      actualTotal: roundMoney(internalTotals.actualTotal),
    },
    alerts,
    privacy: { rawDescriptionsSent: false, accountNamesSanitized: true, onlyAggregatedData: false, limitedSanitizedEntryCandidates: true },
  };
}

export function buildAiPrompt(type: AiAnalysisType, summary: AiInputSummary) {
  const labels: Record<AiAnalysisType, string> = {
    monthly: "analise mensal do periodo, comparando planejado vs realizado",
    annual: "analise anual com tendencias, melhor/pior comportamento e oportunidades",
    savings: "sugestoes praticas para economizar e atingir pelo menos R$ 50 por mes",
    planning: "feedback do planejamento e preparacao de base para planejamento anual",
  };

  return `Voce e um assistente de organizacao financeira pessoal. Gere uma ${labels[type]}.

Regras obrigatorias:
- Responda em portugues do Brasil.
- Seja direto, pratico e especifico.
- Use somente os dados enviados. Nao invente dados, valores, percentuais ou lancamentos.
- Compare explicitamente os totais enviados com planejado vs realizado.
- O campo financialDiagnosis e a regra absoluta do saldo realizado mandam mais do que comparativos relativos.
- Se financialDiagnosis.status for "critical" ou totals.actualBalance for negativo, o resumo deve dizer que o periodo fechou negativo/critico. Nao use tom de "bom", "saudavel", "positivo" ou "dentro do esperado".
- Se totals.expectedBalance tambem for negativo, explique que o planejamento do periodo ja nasceu deficitario e que ficar um pouco melhor que o planejado nao significa resultado bom.
- Quando o saldo for negativo, explique o motivo central: despesas realizadas maiores que entradas realizadas, citando o gap de financialDiagnosis.breakEvenGap.
- Para o proximo mes, informe quanto precisa melhorar no minimo para empatar e quanto precisa melhorar para bater a meta mensal usando financialDiagnosis.breakEvenGap e financialDiagnosis.monthlyGoalGap.
- Quando existirem adjustableEntries, cite os lancamentos candidatos pelo label sanitizado, valor e motivo.
- Evite respostas genericas como "revisar gastos fixos" sem dizer qual categoria/lancamento/valor motivou a recomendacao.
- Se os dados forem poucos, diga isso, mas ainda extraia o maximo dos totais e lancamentos candidatos.
- Nao de conselho financeiro irresponsavel.
- Nao sugira investimento especifico.
- Explique que sao sugestoes de apoio, nao garantia.
- Se os dados forem insuficientes, diga claramente.
- Nao peca dados sensiveis.
- A IA nao pode criar, editar ou excluir lancamentos.
- Retorne apenas JSON valido, sem markdown fora do JSON.
- Todos os campos que sao listas devem ser arrays de strings. Nunca retorne objetos dentro de arrays.
- Em lancamentos_para_revisar, cada item deve ser uma string no formato "Label sanitizado - R$ valor - motivo".
- Em onde_cortar_gastos, nao sugira cortes irrelevantes perto do deficit. Se o deficit for alto, priorize categorias/lancamentos de maior impacto e diga quando um corte pequeno e insuficiente.
- Quando os maiores lancamentos forem importados ou possivelmente transferencias/classificacoes genericas, recomende revisar classificacao antes de tratar como corte definitivo.
- Quando adjustableEntries indicar possivel duplicidade ou possivel transferencia interna, recomende conferir antes de tratar como gasto cortavel.
- O campo internalTransfers informa movimentacoes internas entre contas do casal (ex: PJ para conta conjunta). Elas NAO sao receita nova nem gasto cortavel: cite apenas como movimentacao interna, sem sugerir corte.

Formato JSON esperado:
{
  "resumo": "texto curto",
  "diagnostico_numerico": ["item com valores"],
  "pontos_de_atencao": ["item"],
  "lancamentos_para_revisar": ["item com label, valor e motivo"],
  "onde_cortar_gastos": ["item"],
  "ajustes_recomendados": ["item"],
  "proximas_acoes": ["item"],
  "meta_de_economia": "texto curto",
  "aviso": "Analise automatica baseada nos dados cadastrados. Use como apoio, nao como decisao definitiva."
}

Dados agregados e anonimizados:
${JSON.stringify(summary)}`;
}

export function parseAiResponse(text: string): AiStructuredResponse {
  const fallback: AiStructuredResponse = {
    resumo: text.trim() || "A IA retornou uma resposta vazia.",
    diagnostico_numerico: [],
    pontos_de_atencao: [],
    lancamentos_para_revisar: [],
    onde_cortar_gastos: [],
    ajustes_recomendados: [],
    proximas_acoes: [],
    meta_de_economia: "Revise a analise antes de tomar decisoes.",
    aviso: "Analise automatica baseada nos dados cadastrados. Use como apoio, nao como decisao definitiva.",
  };
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
    const parsed = JSON.parse(cleaned) as Partial<AiStructuredResponse>;
    return {
      resumo: String(parsed.resumo || fallback.resumo),
      diagnostico_numerico: asStringArray(parsed.diagnostico_numerico),
      pontos_de_atencao: asStringArray(parsed.pontos_de_atencao),
      lancamentos_para_revisar: asStringArray(parsed.lancamentos_para_revisar),
      onde_cortar_gastos: asStringArray(parsed.onde_cortar_gastos),
      ajustes_recomendados: asStringArray(parsed.ajustes_recomendados),
      proximas_acoes: asStringArray(parsed.proximas_acoes),
      meta_de_economia: String(parsed.meta_de_economia || fallback.meta_de_economia),
      aviso: String(parsed.aviso || fallback.aviso),
    };
  } catch {
    return fallback;
  }
}

export function validateAiResponse(response: AiStructuredResponse, summary: AiInputSummary): AiStructuredResponse {
  const diagnosis = summary.financialDiagnosis;
  if (!diagnosis) return response;
  if (diagnosis.status !== "critical") return response;

  const combinedText = [response.resumo, ...response.diagnostico_numerico, ...response.pontos_de_atencao, response.meta_de_economia].join(" ").toLowerCase();
  const hasNegativeContext = combinedText.includes("negativo") || combinedText.includes("deficit") || combinedText.includes("déficit") || combinedText.includes("critico") || combinedText.includes("crítico");
  const hasBadPositiveTone = /\b(bom|boa|saudavel|saudável|positivo|tranquilo)\b/.test(combinedText);

  if (hasNegativeContext && !hasBadPositiveTone) return response;

  const criticalSummary = `O periodo fechou negativo em ${formatCurrency(Math.abs(summary.totals.actualBalance))} porque as saidas realizadas (${formatCurrency(summary.totals.actualExpenses)}) foram maiores que as entradas realizadas (${formatCurrency(summary.totals.actualIncome)}).`;
  const planWarning = diagnosis.planWasDeficit
    ? `O planejamento ja previa deficit de ${formatCurrency(Math.abs(summary.totals.expectedBalance))}; ficar ${formatCurrency(Math.abs(summary.plannedVsActual.balanceDifference))} melhor que o planejado significa apenas um resultado menos ruim, nao um mes bom.`
    : "A comparacao com o planejado nao muda o diagnostico principal: o saldo realizado ficou negativo.";
  const mainCategory = summary.topExpenseCategories[0];
  const reviewItems = summary.adjustableEntries.slice(0, 6).map((entry) => `${entry.label} - ${formatCurrency(entry.amount)} - ${entry.reason}`);
  const impactCutItems = [
    `Atacar primeiro os itens de maior impacto: o mes precisa melhorar ${formatCurrency(diagnosis.breakEvenGap)} apenas para empatar.`,
    mainCategory ? `${mainCategory.name} concentrou ${formatCurrency(mainCategory.actual)} (${mainCategory.percentOfExpenses}% das saidas); revise classificacao e possibilidade real de reducao antes de focar em cortes pequenos.` : "Revise as maiores saidas do periodo antes de focar em cortes pequenos.",
  ];

  return {
    ...response,
    resumo: criticalSummary,
    diagnostico_numerico: [
      criticalSummary,
      planWarning,
      `Para empatar no proximo mes, precisa melhorar pelo menos ${formatCurrency(diagnosis.breakEvenGap)} entre reducao de despesas e aumento de entradas.`,
      `Para bater a meta mensal, precisa melhorar ${formatCurrency(diagnosis.monthlyGoalGap)}.`,
      ...response.diagnostico_numerico.filter((item) => !/\b(bom|boa|saudavel|saudável|positivo|tranquilo)\b/i.test(item)),
    ].slice(0, 8),
    pontos_de_atencao: [
      "Resultado critico: as saidas superaram as entradas no periodo.",
      ...(diagnosis.planWasDeficit ? ["O planejamento do periodo ja nasceu deficitario e precisa ser revisado antes do proximo mes."] : []),
      ...response.pontos_de_atencao,
    ].slice(0, 8),
    lancamentos_para_revisar: response.lancamentos_para_revisar.length > 0 ? response.lancamentos_para_revisar : reviewItems,
    onde_cortar_gastos: [
      ...impactCutItems,
      ...response.onde_cortar_gastos,
    ].slice(0, 8),
    ajustes_recomendados: [
      `Reduzir despesas, aumentar entradas ou combinar os dois em pelo menos ${formatCurrency(diagnosis.breakEvenGap)} para empatar.`,
      `Refazer o planejamento para que o proximo mes nao comece com saldo previsto negativo.`,
      ...response.ajustes_recomendados,
    ].slice(0, 8),
    meta_de_economia: `Meta nao atingida. Antes de economizar, e necessario cobrir o deficit de ${formatCurrency(diagnosis.breakEvenGap)} para empatar o mes.`,
  };
}

export const getAiStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string })
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser(data.accessToken);
    const supabase = createServerSupabase();
    const { data: settings, error } = await supabase.from("integration_settings").select(settingsColumns).eq("user_id", userId).eq("provider", "ai").maybeSingle();
    if (error) throw new Error(error.message);
    const provider = getAiProviderConfig();
    return { enabled: (settings as IntegrationSetting | null)?.enabled ?? false, configured: provider.configured, provider: provider.provider, model: provider.model };
  });

export const testAiConnection = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string })
  .handler(async ({ data }) => {
    await requireAuthenticatedUser(data.accessToken);
    const provider = getAiProviderConfig();
    if (!provider.configured || !provider.apiKey) throw new Error("API key de IA não configurada no servidor.");
    const result = await callAiProviderWithFallback(provider, buildAiPrompt("monthly", minimalSummary()));
    return { ok: true, message: `Conexão com ${result.provider === "gemini" ? "Google Gemini" : "Groq"} funcionando. Modelo: ${result.model}.` };
  });

export const listAiAnalyses = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; limit?: number })
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser(data.accessToken);
    const supabase = createServerSupabase();
    const { data: rows, error } = await supabase.from("ai_analysis").select(analysisColumns).eq("user_id", userId).order("created_at", { ascending: false }).limit(Math.min(data.limit ?? 8, 20));
    if (error) throw new Error(error.message);
    return { analyses: (rows ?? []) as AiAnalysis[] };
  });

export const generateAiAnalysis = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; analysisType: AiAnalysisType; periodStart: string; periodEnd: string; force?: boolean })
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser(data.accessToken);
    if (data.analysisType !== "monthly" && data.analysisType !== "annual" && data.analysisType !== "savings" && data.analysisType !== "planning") {
      throw new Error("Tipo de análise inválido.");
    }
    if (!isValidPeriodRange(data.periodStart, data.periodEnd, 400)) {
      throw new Error("Período inválido para análise. Use um intervalo de até 13 meses.");
    }
    if (!tryAcquireActionLock(`ia:${userId}:${data.analysisType}:${data.periodStart}:${data.periodEnd}:${data.force ? "force" : "cached"}`, 60000)) {
      throw new Error("Já existe uma análise em andamento. Aguarde um minuto e tente de novo.");
    }
    const provider = getAiProviderConfig();
    if (!provider.configured || !provider.apiKey) throw new Error("API key de IA não configurada no servidor.");
    const supabase = createServerSupabase();
    const settings = await loadAiSettings(supabase, userId);
    if (!settings?.enabled) throw new Error("IA desativada. Ative em Configurações antes de gerar análises.");

    const summary = await loadAndSummarize(supabase, userId, data.analysisType, data.periodStart, data.periodEnd);
    if (summary.totals.expectedIncome === 0 && summary.totals.expectedExpenses === 0 && summary.totals.actualIncome === 0 && summary.totals.actualExpenses === 0) {
      throw new Error("Dados insuficientes para análise. Cadastre lançamentos previstos ou realizados no período.");
    }

    if (!data.force) {
      const { data: cached, error: cacheError } = await supabase.from("ai_analysis").select(analysisColumns)
        .eq("user_id", userId)
        .eq("analysis_type", data.analysisType)
        .eq("period_start", data.periodStart)
        .eq("period_end", data.periodEnd)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cacheError) throw new Error(cacheError.message);
      const cachedAnalysis = cached as AiAnalysis | null;
      if (cachedAnalysis && cachedFingerprint(cachedAnalysis) === summary.dataFingerprint) return { analysis: cachedAnalysis, cached: true, parsed: validateAiResponse(parseAiResponse(cachedAnalysis.ai_response), summary) };
    }
    const aiResult = await callAiProviderWithFallback(provider, buildAiPrompt(data.analysisType, summary));
    const { data: saved, error } = await supabase.from("ai_analysis").insert({
      user_id: userId,
      analysis_type: data.analysisType,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      input_summary: summary as unknown as Json,
      ai_response: aiResult.text,
      model_used: `${aiResult.provider}:${aiResult.model}`,
    }).select(analysisColumns).single();
    if (error) throw new Error(error.message);
    return { analysis: saved as AiAnalysis, cached: false, parsed: validateAiResponse(parseAiResponse(aiResult.text), summary) };
  });

async function loadAndSummarize(supabase: ReturnType<typeof createServerSupabase>, userId: string, analysisType: AiAnalysisType, periodStart: string, periodEnd: string) {
  const trendStart = shiftDateMonth(periodStart, -5);
  const [entriesResult, trendEntriesResult, accountsResult, categoriesResult, goalsResult, financingsResult] = await Promise.all([
    supabase.from("financial_entries").select(entryColumns).eq("user_id", userId).gte("due_date", periodStart).lte("due_date", periodEnd).order("due_date"),
    supabase.from("financial_entries").select(entryColumns).eq("user_id", userId).gte("due_date", trendStart).lte("due_date", periodEnd).order("due_date"),
    supabase.from("accounts").select(accountColumns).eq("user_id", userId).eq("is_active", true).order("name"),
    supabase.from("categories").select(categoryColumns).eq("is_active", true).order("name"),
    supabase.from("savings_goals").select(goalColumns).eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
    supabase.from("financings").select(financingColumns).eq("user_id", userId).eq("status", "active"),
  ]);
  const requestError = entriesResult.error ?? trendEntriesResult.error ?? accountsResult.error ?? categoriesResult.error ?? goalsResult.error;
  if (requestError) throw new Error(requestError.message);
  const entries = entriesResult.data as FinancialEntry[] ?? [];
  const trendEntries = trendEntriesResult.data as FinancialEntry[] ?? [];
  return buildAiInputSummary({
    analysisType,
    periodStart,
    periodEnd,
    entries,
    trendEntries,
    accounts: accountsResult.data as Account[] ?? [],
    categories: categoriesResult.data as Category[] ?? [],
    goals: goalsResult.data as SavingsGoal[] ?? [],
    financings: financingsResult.error ? [] : financingsResult.data as Financing[] ?? [],
  });
}

async function loadAiSettings(supabase: ReturnType<typeof createServerSupabase>, userId: string) {
  const { data, error } = await supabase.from("integration_settings").select(settingsColumns).eq("user_id", userId).eq("provider", "ai").maybeSingle();
  if (error) throw new Error(error.message);
  return data as IntegrationSetting | null;
}

export async function callAiProviderWithFallback(config: ReturnType<typeof getAiProviderConfig>, prompt: string) {
  try {
    const text = await callAiProvider(config, prompt);
    return { text, provider: config.provider, model: config.model, fallback: false };
  } catch (error) {
    const fallback = getAiFallbackProviderConfig(config.provider);
    if (!fallback.configured || !fallback.apiKey) throw error;
    const text = await callAiProvider(fallback, prompt);
    return { text, provider: fallback.provider, model: fallback.model, fallback: true };
  }
}

async function callAiProvider(config: ReturnType<typeof getAiProviderConfig>, prompt: string) {
  if (!config.apiKey) throw new Error("API key de IA não configurada no servidor.");
  const response = config.provider === "groq" ? await callGroq(config.apiKey, config.model, prompt) : await callGemini(config.apiKey, config.model, prompt);
  if (!response.trim()) throw new Error("A IA retornou uma resposta vazia ou inválida.");
  return response;
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  }, 10000);
  if (!response.ok) throw new Error(await aiErrorMessage(response, "Gemini"));
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

async function callGroq(apiKey: string, model: string, prompt: string) {
  const payload = { model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] };
  let response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, 15000);
  if (response.status === 400) {
    response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...payload, response_format: undefined }),
    }, 15000);
  }
  if (!response.ok) throw new Error(await aiErrorMessage(response, "Groq"));
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
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

async function aiErrorMessage(response: Response, provider: string) {
  if (response.status === 401 || response.status === 403) return `API key do ${provider} inválida ou sem permissão.`;
  if (response.status === 429) return `${provider} limitou as requisições agora. Tente novamente em alguns minutos.`;
  if (response.status >= 500) return `${provider} indisponível no momento. Tente novamente mais tarde.`;
  if (response.status === 400) return `Erro do ${provider} (400): ${await safeProviderErrorDetail(response)}.`;
  return `Erro do ${provider} (${response.status}).`;
}

async function safeProviderErrorDetail(response: Response) {
  try {
    const body = await response.clone().json() as { error?: { message?: unknown }; message?: unknown };
    const message = typeof body.error?.message === "string" ? body.error.message : typeof body.message === "string" ? body.message : null;
    return sanitizeProviderError(message || "requisição inválida");
  } catch {
    try {
      return sanitizeProviderError((await response.clone().text()) || "requisição inválida");
    } catch {
      return "requisição inválida";
    }
  }
}

function sanitizeProviderError(message: string) {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[api-key]").replace(/[\w.+-]+@[\w.-]+/g, "[email]").replace(/\s+/g, " ").slice(0, 240);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Provider de IA demorou para responder. Tentando alternativa disponível.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function monthlyTrend(entries: FinancialEntry[]) {
  const months = new Map<string, { month: string; income: number; expenses: number; balance: number }>();
  for (const entry of entries) {
    if (entry.status !== "paid") continue;
    if (entry.source === "transfer" || entry.transfer_group_id) continue;
    const key = entry.due_date.slice(0, 7);
    const row = months.get(key) ?? { month: key, income: 0, expenses: 0, balance: 0 };
    const value = Number(entry.actual_amount ?? entry.expected_amount);
    if (entry.entry_type === "income") row.income += value;
    if (entry.entry_type === "expense") row.expenses += value;
    row.balance = row.income - row.expenses;
    months.set(key, row);
  }
  return Array.from(months.values()).sort((first, second) => first.month.localeCompare(second.month)).slice(-6).map((row) => ({ month: row.month, income: roundMoney(row.income), expenses: roundMoney(row.expenses), balance: roundMoney(row.balance) }));
}

function buildAggregatedAlerts(summary: AiInputSummary["totals"], topCategories: AiInputSummary["topExpenseCategories"], monthlyTarget: number, monthlyFinancingCommitment: number) {
  const alerts: string[] = [];
  if (summary.expectedExpenses > 0 && summary.actualExpenses > summary.expectedExpenses) alerts.push(`Saídas acima do planejado em ${formatCurrency(summary.actualExpenses - summary.expectedExpenses)}.`);
  if (summary.expectedIncome > 0 && summary.actualIncome < summary.expectedIncome) alerts.push(`Entradas abaixo do previsto em ${formatCurrency(summary.expectedIncome - summary.actualIncome)}.`);
  if (summary.actualBalance < monthlyTarget) alerts.push(`Saldo realizado abaixo da meta mensal de ${formatCurrency(monthlyTarget || 50)}.`);
  if (summary.actualIncome > 0 && monthlyFinancingCommitment / summary.actualIncome > 0.25) alerts.push("Financiamentos passam de 25% das entradas realizadas do período.");
  const overBudget = topCategories.find((category) => category.planned > 0 && category.actual > category.planned);
  if (overBudget) alerts.push(`${overBudget.name} ficou acima do planejado em ${formatCurrency(overBudget.variance)}.`);
  return alerts.slice(0, 6);
}

function buildFinancialDiagnosis(summary: AiInputSummary["totals"], monthlyTarget: number): AiInputSummary["financialDiagnosis"] {
  const breakEvenGap = roundMoney(Math.max(0, summary.actualExpenses - summary.actualIncome));
  const monthlyGoalGap = roundMoney(Math.max(0, monthlyTarget - summary.actualBalance));
  const expenseIncomeRatio = summary.actualIncome > 0 ? roundPercent((summary.actualExpenses / summary.actualIncome) * 100) : null;
  const planWasDeficit = summary.expectedBalance < 0;
  const planQuality: AiInputSummary["financialDiagnosis"]["planQuality"] = summary.expectedIncome === 0 && summary.expectedExpenses === 0 ? "missing_plan" : planWasDeficit ? "deficit_planned" : summary.expectedBalance < monthlyTarget ? "tight_plan" : "positive_plan";
  const status: AiInputSummary["financialDiagnosis"]["status"] = summary.actualBalance < 0 || summary.actualExpenses > summary.actualIncome ? "critical" : summary.actualBalance < monthlyTarget ? "attention" : "healthy";
  const mainReason = status === "critical"
    ? summary.actualExpenses > summary.actualIncome ? "expenses_higher_than_income" : "negative_balance"
    : status === "attention" ? "below_monthly_goal" : "monthly_goal_reached";
  const secondaryReasons = [
    planWasDeficit ? "planned_deficit" : null,
    monthlyGoalGap > 0 ? "goal_not_reached" : null,
    expenseIncomeRatio !== null && expenseIncomeRatio >= 80 ? "high_expense_income_ratio" : null,
    summary.actualIncome < summary.expectedIncome ? "income_below_expected" : null,
    summary.actualExpenses > summary.expectedExpenses ? "expenses_above_expected" : null,
  ].filter(Boolean) as string[];
  const message = status === "critical"
    ? `Periodo fechou negativo em ${formatCurrency(Math.abs(summary.actualBalance))}; faltaram ${formatCurrency(breakEvenGap)} para empatar e ${formatCurrency(monthlyGoalGap)} para bater a meta mensal.`
    : status === "attention"
      ? `Periodo fechou positivo, mas abaixo da meta mensal; faltaram ${formatCurrency(monthlyGoalGap)} para bater a meta.`
      : "Periodo fechou acima da meta mensal.";
  const interpretationRule = status === "critical"
    ? "Saldo negativo e despesas maiores que entradas mandam mais que comparacao com planejado. Melhor que um plano deficitario significa apenas menos ruim."
    : "Compare planejado vs realizado depois de avaliar saldo realizado, meta mensal e relacao entre entradas e saidas.";
  return { status, mainReason, secondaryReasons, message, expenseIncomeRatio, breakEvenGap, monthlyGoalGap, planWasDeficit, planQuality, interpretationRule };
}

function buildAdjustableEntries(entries: FinancialEntry[], accounts: Account[], categories: Category[], categoriesOverPlanned: string[]) {
  const accountIndex = new Map(accounts.map((account, index) => [account.id, `Conta ${index + 1}`]));
  const categoryById = new Map(categories.map((category) => [category.id, sanitizeLabel(category.name, "Classificacao")]));
  const overPlannedSet = new Set(categoriesOverPlanned);
  const paidEntries = entries.filter((entry) => entry.status === "paid");

  return entries
    .filter((entry) => entry.entry_type === "expense" && entry.source !== "transfer" && !entry.transfer_group_id)
    .map((entry) => {
      const amount = roundMoney(Number(entry.status === "paid" ? entry.actual_amount ?? entry.expected_amount : entry.expected_amount));
      const category = entry.category_id ? categoryById.get(entry.category_id) ?? "Sem classificacao" : "Sem classificacao";
      const entryDate = entry.paid_date || entry.due_date;
      const possibleDuplicate = entry.status === "paid" && paidEntries.some((candidate) => (
        candidate.id !== entry.id
        && candidate.entry_type === "expense"
        && roundMoney(Number(candidate.actual_amount ?? candidate.expected_amount)) === amount
        && (candidate.paid_date || candidate.due_date) === entryDate
      ));
      const possibleInternalTransfer = entry.status === "paid" && paidEntries.some((candidate) => (
        candidate.id !== entry.id
        && candidate.entry_type === "income"
        && roundMoney(Number(candidate.actual_amount ?? candidate.expected_amount)) === amount
        && daysBetween(candidate.paid_date || candidate.due_date, entryDate) <= 2
      ));
      const reasons = [
        entry.status === "planned" ? "lancamento previsto ainda pode ser ajustado antes de realizar" : null,
        amount >= 100 ? "valor relevante no periodo" : null,
        overPlannedSet.has(category) ? "classificacao acima do planejado" : null,
        entry.source === "financing" ? "compromisso de financiamento" : null,
        entry.source === "imported" ? "veio de importacao e pode precisar de classificacao fina" : null,
        possibleDuplicate ? "possivel duplicidade: existe outra saida com mesmo valor e mesma data" : null,
        possibleInternalTransfer ? "possivel transferencia interna: existe entrada de mesmo valor em data proxima" : null,
      ].filter(Boolean);

      return {
        label: sanitizeEntryDescription(entry.description),
        date: entry.due_date,
        category,
        accountLabel: entry.account_id ? accountIndex.get(entry.account_id) ?? "Conta" : "Sem conta",
        amount,
        status: entry.status,
        source: entry.source,
        reason: reasons.join("; ") || "despesa do periodo para revisao manual",
      };
    })
    .filter((entry) => entry.amount > 0)
    .sort((first, second) => second.amount - first.amount)
    .slice(0, 12);
}

function daysBetween(firstDate: string, secondDate: string) {
  const first = new Date(`${firstDate}T00:00:00Z`).getTime();
  const second = new Date(`${secondDate}T00:00:00Z`).getTime();
  if (Number.isNaN(first) || Number.isNaN(second)) return Number.POSITIVE_INFINITY;
  return Math.abs(first - second) / 86_400_000;
}

function sanitizeEntryDescription(value: string) {
  const withoutSensitivePatterns = value
    .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
    .replace(/\b\d{2}\.??\d{3}\.??\d{3}\/?\d{0,4}-?\d{0,2}\b/g, "[documento]")
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/pix\s+[^\s]+/gi, "Pix")
    .replace(/transfer[eê]ncia\s+[^\s]+/gi, "Transferencia");
  return sanitizeLabel(withoutSensitivePatterns, "Lancamento");
}

function analysisFingerprint(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function cachedFingerprint(analysis: AiAnalysis) {
  const summary = analysis.input_summary as { dataFingerprint?: unknown } | null;
  return typeof summary?.dataFingerprint === "string" ? summary.dataFingerprint : null;
}

function sanitizeLabel(value: string, fallback: string) {
  return value.trim().replace(/[\w.+-]+@[\w.-]+/g, "[email]").replace(/\d{2,}/g, "#").slice(0, 48) || fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringifyAiListItem).filter(Boolean).slice(0, 8) : [];
}

function stringifyAiListItem(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  const label = firstString(item, ["label", "nome", "description", "descricao", "lançamento", "lancamento", "item"]);
  const reason = firstString(item, ["motivo", "reason", "justificativa", "acao", "ação"]);
  const category = firstString(item, ["category", "categoria"]);
  const rawAmount = item["valor"] ?? item["amount"] ?? item["total"];
  const amount = typeof rawAmount === "number" ? formatCurrency(rawAmount) : typeof rawAmount === "string" && rawAmount.trim() ? rawAmount.trim() : "";
  return [label, amount, category, reason].filter(Boolean).join(" - ");
}

function firstString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function shiftDateMonth(date: string, offset: number) {
  const current = new Date(`${date.slice(0, 7)}-01T00:00:00`);
  current.setMonth(current.getMonth() + offset);
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`;
}

function minimalSummary(): AiInputSummary {
  const bounds = monthBounds(new Date().toISOString().slice(0, 7));
  return {
    analysisType: "monthly",
    period: { start: bounds.startDate, end: bounds.endDate, label: bounds.startDate.slice(0, 7) },
    dataFingerprint: "minimal",
    counts: { entries: 2, paidEntries: 2, plannedEntries: 0, expenseEntries: 1, incomeEntries: 1 },
    totals: { expectedIncome: 100, actualIncome: 100, expectedExpenses: 50, actualExpenses: 45, expectedBalance: 50, actualBalance: 55 },
    plannedVsActual: { incomeDifference: 0, expenseDifference: -5, balanceDifference: 5 },
    financialDiagnosis: { status: "healthy", mainReason: "monthly_goal_reached", secondaryReasons: [], message: "Periodo fechou acima da meta mensal.", expenseIncomeRatio: 45, breakEvenGap: 0, monthlyGoalGap: 0, planWasDeficit: false, planQuality: "positive_plan", interpretationRule: "Compare planejado vs realizado depois de avaliar saldo realizado, meta mensal e relacao entre entradas e saidas." },
    topExpenseCategories: [{ name: "Gastos variaveis", planned: 50, actual: 45, variance: -5, percentOfExpenses: 100 }],
    categoriesOverPlanned: [],
    adjustableEntries: [{ label: "Despesa variavel", date: bounds.startDate, category: "Gastos variaveis", accountLabel: "Conta 1", amount: 45, status: "paid", source: "manual", reason: "exemplo de teste" }],
    accounts: [{ label: "Conta 1", actualIncome: 100, actualExpenses: 45, actualBalance: 55 }],
    savingsGoal: { name: "Meta minima", monthlyTarget: 50, currentAmount: 0, reachedInPeriod: true },
    financings: { activeCount: 0, monthlyCommitment: 0, remainingEstimated: 0 },
    monthlyTrend: [{ month: bounds.startDate.slice(0, 7), income: 100, expenses: 45, balance: 55 }],
    internalTransfers: { count: 0, expectedTotal: 0, actualTotal: 0 },
    alerts: [],
    privacy: { rawDescriptionsSent: false, accountNamesSanitized: true, onlyAggregatedData: false, limitedSanitizedEntryCandidates: true },
  };
}
