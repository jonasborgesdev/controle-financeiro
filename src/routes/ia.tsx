import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, BrainCircuit, CheckCircle2, History, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateAiAnalysis, getAiStatus, listAiAnalyses, parseAiResponse, validateAiResponse, type AiAnalysisType, type AiInputSummary, type AiStructuredResponse } from "@/lib/ai";
import { formatCurrency, monthBounds } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { AiAnalysis } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);
const currentYear = new Date().getFullYear();

export const Route = createFileRoute("/ia")({
  validateSearch: (search: Record<string, unknown>) => ({
    type: typeof search["type"] === "string" ? search["type"] : undefined,
    month: typeof search["month"] === "string" ? search["month"] : undefined,
    year: typeof search["year"] === "string" ? Number(search["year"]) : typeof search["year"] === "number" ? search["year"] : undefined,
  }),
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: AiPage,
});

function AiPage() {
  const search = Route.useSearch();
  const supabase = createClient();
  const [analysisType, setAnalysisType] = useState<AiAnalysisType>(isAnalysisType(search.type) ? search.type : "monthly");
  const [selectedMonth, setSelectedMonth] = useState(search.month ?? currentMonth);
  const [selectedYear, setSelectedYear] = useState(search.year ?? currentYear);
  const [status, setStatus] = useState<{ enabled: boolean; configured: boolean; provider: string; model: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<AiAnalysis[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AiAnalysis | null>(null);
  const [parsed, setParsed] = useState<AiStructuredResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "empty"; text: string } | null>(null);
  const period = useMemo(() => periodFor(analysisType, selectedMonth, selectedYear), [analysisType, selectedMonth, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    try {
      const [statusResult, historyResult] = await Promise.all([
        getAiStatus({ data: { accessToken: data.session?.access_token ?? "" } }),
        listAiAnalyses({ data: { accessToken: data.session?.access_token ?? "", limit: 10 } }),
      ]);
      setStatus(statusResult as { enabled: boolean; configured: boolean; provider: string; model: string });
      setHistoryItems((historyResult as { analyses: AiAnalysis[] }).analyses);
      if (!statusResult.enabled) setMessage({ tone: "empty", text: "IA desativada. Ative em Configurações para gerar análises." });
      else if (!statusResult.configured) setMessage({ tone: "error", text: "IA ativada, mas a API key não está configurada no servidor." });
    } catch (caughtError) {
      setMessage({ tone: "error", text: caughtError instanceof Error ? caughtError.message : "Não consegui carregar o módulo de IA." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const generate = async (force = false) => {
    setGenerating(true);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    try {
      const result = await generateAiAnalysis({ data: { accessToken: data.session?.access_token ?? "", analysisType, periodStart: period.startDate, periodEnd: period.endDate, force } });
      const typedResult = result as { analysis: AiAnalysis; parsed: AiStructuredResponse; cached: boolean };
      setCurrentAnalysis(typedResult.analysis);
      setParsed(typedResult.parsed);
      setMessage({ tone: "success", text: typedResult.cached ? "Mostrei a análise salva para este período. Use 'Gerar nova análise' para chamar a IA novamente." : "Análise gerada e salva no histórico." });
      await loadData();
    } catch (caughtError) {
      setMessage({ tone: "error", text: caughtError instanceof Error ? caughtError.message : "Não consegui gerar a análise agora." });
    } finally {
      setGenerating(false);
    }
  };

  const openHistory = (analysis: AiAnalysis) => {
    setCurrentAnalysis(analysis);
    setParsed(validateAiResponse(parseAiResponse(analysis.ai_response), analysis.input_summary as unknown as AiInputSummary));
    setAnalysisType(analysis.analysis_type);
    if (analysis.analysis_type === "annual" || analysis.analysis_type === "planning") setSelectedYear(Number(analysis.period_start.slice(0, 4)));
    else setSelectedMonth(analysis.period_start.slice(0, 7));
  };

  const canGenerate = Boolean(status?.enabled && status.configured);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2.25rem] p-5 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Análise inteligente</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">IA como apoio, sem expor dados sensíveis.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">O servidor envia apenas resumos agregados: totais, classificações, contas anonimizadas, metas, financiamentos e tendências.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 size-5 text-emerald-300" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-50">{status?.configured ? "Provider configurado" : "Provider não configurado"}</p>
                  <p className="mt-1 text-sm text-slate-400">{status ? `${status.provider} · ${status.model}` : "Carregando status"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {message ? <StateMessage tone={message.tone} title={message.tone === "success" ? "Tudo certo" : message.tone === "empty" ? "Configuração necessária" : "Atenção"} description={message.text} /> : null}
        {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />)}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Gerar análise</CardTitle>
              <CardDescription>Escolha o tipo e período. Por padrão, o app usa cache para não chamar IA sem necessidade.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {analysisCards.map((card) => (
                    <button key={card.type} type="button" onClick={() => setAnalysisType(card.type)} className={analysisType === card.type ? "rounded-2xl border border-cyan-300/35 bg-cyan-400/[0.12] p-4 text-left text-cyan-50" : "rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left text-slate-200 transition hover:bg-white/[0.08]"}>
                      <p className="font-bold">{card.title}</p>
                      <p className="mt-1 text-sm opacity-75">{card.description}</p>
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  {analysisType === "annual" || analysisType === "planning" ? (
                    <div className="space-y-2"><label className="text-sm font-semibold text-slate-300" htmlFor="ai-year">Ano</label><Input id="ai-year" type="number" min="2000" max="2100" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value || currentYear))} /></div>
                  ) : (
                    <div className="space-y-2"><label className="text-sm font-semibold text-slate-300" htmlFor="ai-month">Mês</label><Input id="ai-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></div>
                  )}
                  <Button type="button" onClick={() => generate(false)} disabled={!canGenerate || generating}>{generating ? "Analisando..." : "Gerar análise"}</Button>
                  <Button type="button" variant="outline" onClick={() => generate(true)} disabled={!canGenerate || generating}>Gerar nova análise</Button>
                </div>
                <p className="rounded-2xl border border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] p-4 text-sm text-[#fff3c4]">Análise automática baseada nos dados cadastrados. Use como apoio, não como decisão definitiva. A IA não altera lançamentos.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status e privacidade</CardTitle>
              <CardDescription>Resumo do que pode ou não ir para o provider.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm">
                <StatusRow label="IA" value={status?.enabled ? "Ativada" : "Desativada"} ok={Boolean(status?.enabled)} />
                <StatusRow label="API key" value={status?.configured ? "Configurada" : "Ausente"} ok={Boolean(status?.configured)} />
                <StatusRow label="Dados brutos" value="Nunca enviados" ok />
                <StatusRow label="Contas" value="Anonimizadas" ok />
              </div>
            </CardContent>
          </Card>
        </div>

        {parsed ? <AiResponseView response={parsed} analysis={currentAnalysis} /> : <EmptyAnalysis />}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3"><History className="size-5 text-cyan-200" aria-hidden="true" /><div><CardTitle>Histórico recente</CardTitle><CardDescription>Análises salvas com o resumo agregado enviado para auditoria.</CardDescription></div></div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {historyItems.map((item) => <button key={item.id} type="button" onClick={() => openHistory(item)} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left transition hover:bg-white/[0.08]"><p className="font-semibold text-slate-50">{analysisLabel(item.analysis_type)} · {item.period_start} até {item.period_end}</p><p className="mt-1 text-sm text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.model_used}</p></button>)}
              {historyItems.length === 0 ? <p className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/[0.06] p-4 text-sm text-cyan-100">Nenhuma análise salva ainda.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

const analysisCards: Array<{ type: AiAnalysisType; title: string; description: string }> = [
  { type: "monthly", title: "Análise mensal", description: "Planejado vs realizado, categorias acima do esperado e ações práticas." },
  { type: "annual", title: "Análise anual", description: "Tendências, melhor/pior mês, riscos e oportunidades." },
  { type: "savings", title: "Economizar", description: "Cortes realistas para atingir a meta mínima mensal." },
  { type: "planning", title: "Planejamento", description: "Feedback de orçamento e base para planejamento anual." },
];

function AiResponseView({ response, analysis }: { response: AiStructuredResponse; analysis: AiAnalysis | null }) {
  const summary = analysis?.input_summary as unknown as AiInputSummary | undefined;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3"><BrainCircuit className="mt-1 size-6 text-cyan-200" aria-hidden="true" /><div><CardTitle>Resposta da IA</CardTitle><CardDescription>{analysis ? `${analysis.model_used} · ${new Date(analysis.created_at).toLocaleString("pt-BR")}` : "Análise atual"}</CardDescription></div></div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {summary?.financialDiagnosis ? <CalculatedDiagnosis summary={summary} /> : null}
          {summary?.financialDiagnosis ? <DecisionPanel summary={summary} /> : null}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Leitura da IA</p>
            <p className="mt-1 text-sm text-slate-400">Explicação textual e próximos passos sugeridos com base no diagnóstico acima.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ResponseBlock title="Resumo" tone="cyan" items={[response.resumo]} />
          <ResponseBlock title="Diagnóstico numérico" tone="slate" items={response.diagnostico_numerico} />
          <ResponseBlock title="Meta de economia" tone="gold" items={[response.meta_de_economia]} />
          <ResponseBlock title="Pontos de atenção" tone="rose" items={response.pontos_de_atencao} />
          <ResponseBlock title="Lançamentos para revisar" tone="gold" items={response.lancamentos_para_revisar} />
          <ResponseBlock title="Onde cortar gastos" tone="emerald" items={response.onde_cortar_gastos} />
          <ResponseBlock title="Ajustes recomendados" tone="emerald" items={response.ajustes_recomendados} />
          <ResponseBlock title="Próximas ações" tone="cyan" items={response.proximas_acoes} />
          <ResponseBlock title="Salvaguarda" tone="slate" items={[response.aviso]} />
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionPanel({ summary }: { summary: AiInputSummary }) {
  return (
    <div className="rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.05] p-5 text-slate-100">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Painel de decisão</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">O que olhar antes de planejar o próximo mês</h3>
        </div>
        <p className="max-w-sm text-sm leading-6 text-slate-400">Gráficos focados no problema do mês e no tamanho do ajuste necessário.</p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <IncomeExpenseChart summary={summary} />
        <GapChart summary={summary} />
        <CategoryChart summary={summary} />
        <TrendChart summary={summary} />
      </div>
      <NextMonthPlan summary={summary} />
    </div>
  );
}

function IncomeExpenseChart({ summary }: { summary: AiInputSummary }) {
  const max = Math.max(summary.totals.actualIncome, summary.totals.actualExpenses, 1);
  return <MiniChartCard title="Entradas x saídas" description="Mostra o motivo do saldo final."><BarRow label="Entradas" value={summary.totals.actualIncome} max={max} tone="income" /><BarRow label="Saídas" value={summary.totals.actualExpenses} max={max} tone="expense" /><p className="mt-3 rounded-2xl bg-slate-950/25 p-3 text-sm text-slate-300">Saíram {formatCurrency(Math.max(0, summary.totals.actualExpenses - summary.totals.actualIncome))} a mais do que entrou.</p></MiniChartCard>;
}

function GapChart({ summary }: { summary: AiInputSummary }) {
  const max = Math.max(summary.financialDiagnosis.monthlyGoalGap, summary.financialDiagnosis.breakEvenGap, 1);
  return <MiniChartCard title="Gap do próximo mês" description="Quanto precisa melhorar para virar o jogo."><BarRow label="Para empatar" value={summary.financialDiagnosis.breakEvenGap} max={max} tone="warning" /><BarRow label="Para bater meta" value={summary.financialDiagnosis.monthlyGoalGap} max={max} tone="income" /><p className="mt-3 rounded-2xl bg-slate-950/25 p-3 text-sm text-slate-300">Primeiro objetivo: zerar o déficit. Depois, buscar a meta de economia.</p></MiniChartCard>;
}

function CategoryChart({ summary }: { summary: AiInputSummary }) {
  const categories = summary.topExpenseCategories.slice(0, 4);
  const max = Math.max(...categories.map((category) => category.actual), 1);
  return <MiniChartCard title="Categorias de saída" description="Onde o dinheiro ficou concentrado.">{categories.length > 0 ? categories.map((category) => <BarRow key={category.name} label={`${category.name} (${category.percentOfExpenses}%)`} value={category.actual} max={max} tone="category" />) : <p className="text-sm text-slate-400">Sem categorias suficientes.</p>}</MiniChartCard>;
}

function TrendChart({ summary }: { summary: AiInputSummary }) {
  const trend = summary.monthlyTrend.slice(-6);
  const max = Math.max(...trend.map((row) => Math.abs(row.balance)), 1);
  return (
    <MiniChartCard title="Tendência de saldo" description="Últimos meses com lançamentos pagos.">
      {trend.length > 0 ? (
        <div className="rounded-2xl bg-slate-950/25 p-4">
          <div className="flex h-36 items-end gap-3 border-b border-white/10 pb-2">
            {trend.map((row) => {
              const height = Math.max(10, Math.round((Math.abs(row.balance) / max) * 112));
              const isNegative = row.balance < 0;
              return (
                <div key={row.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className={isNegative ? "max-w-full truncate text-[10px] font-bold text-rose-200" : "max-w-full truncate text-[10px] font-bold text-emerald-200"} title={formatCurrency(row.balance)}>{formatCompactCurrency(row.balance)}</span>
                  <div className={isNegative ? "w-full rounded-t-lg bg-rose-400/75 shadow-[0_0_18px_rgba(251,113,133,0.22)]" : "w-full rounded-t-lg bg-emerald-400/75 shadow-[0_0_18px_rgba(52,211,153,0.22)]"} style={{ height }} title={`${row.month}: ${formatCurrency(row.balance)}`} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3">
            {trend.map((row) => <span key={row.month} className="min-w-0 flex-1 text-center text-[10px] font-semibold text-slate-400">{row.month.slice(5)}</span>)}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-slate-950/25 p-4 text-sm text-slate-400">Sem tendência suficiente.</p>
      )}
    </MiniChartCard>
  );
}

function formatCompactCurrency(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1000) return `${sign}R$ ${(absolute / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatCurrency(value).replace(/\s/g, " ");
}

function NextMonthPlan({ summary }: { summary: AiInputSummary }) {
  const diagnosis = summary.financialDiagnosis;
  const mainCategory = summary.topExpenseCategories[0];
  const topEntry = summary.adjustableEntries[0];
  const actions = [
    `Meta 1: melhorar ${formatCurrency(diagnosis.breakEvenGap)} para empatar o mês.`,
    `Meta 2: melhorar ${formatCurrency(diagnosis.monthlyGoalGap)} para bater a meta de economia.`,
    mainCategory ? `Definir teto para ${mainCategory.name}, que concentrou ${formatCurrency(mainCategory.actual)} das saídas.` : "Definir teto para as maiores categorias de saída.",
    topEntry ? `Revisar primeiro: ${topEntry.label} (${formatCurrency(topEntry.amount)}).` : "Revisar os maiores lançamentos antes de cortar valores pequenos.",
    summary.totals.expectedBalance < 0 ? "Refazer o planejamento para o próximo mês não começar deficitário." : "Manter planejamento positivo e acompanhar execução semanalmente.",
  ];
  return <div className="mt-4 rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.07] p-4"><p className="font-bold text-emerald-100">Plano do próximo mês</p><div className="mt-3 grid gap-2 md:grid-cols-2">{actions.map((action) => <p key={action} className="rounded-2xl bg-slate-950/25 px-3 py-2 text-sm leading-6 text-slate-200">{action}</p>)}</div></div>;
}

function MiniChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="rounded-3xl border border-white/10 bg-slate-950/25 p-4"><p className="font-bold text-slate-50">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p><div className="mt-4 grid gap-3">{children}</div></div>;
}

function BarRow({ label, value, max, tone }: { label: string; value: number; max: number; tone: "income" | "expense" | "warning" | "category" }) {
  const color = { income: "bg-emerald-400", expense: "bg-rose-400", warning: "bg-[#f5c76b]", category: "bg-cyan-300" }[tone];
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-400"><span className="truncate">{label}</span><span className="font-bold text-slate-100">{formatCurrency(value)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, Math.min(100, (value / max) * 100))}%` }} /></div></div>;
}

function CalculatedDiagnosis({ summary }: { summary: AiInputSummary }) {
  const diagnosis = summary.financialDiagnosis;
  const statusLabel = { critical: "Crítico", attention: "Atenção", healthy: "Saudável" }[diagnosis.status];
  const statusClass = {
    critical: "border-rose-300/25 bg-rose-400/[0.10] text-rose-100",
    attention: "border-[#f5c76b]/25 bg-[#f5c76b]/[0.10] text-[#fff3c4]",
    healthy: "border-emerald-300/25 bg-emerald-400/[0.10] text-emerald-100",
  }[diagnosis.status];
  const planQuality = {
    deficit_planned: "Plano deficitário",
    tight_plan: "Plano apertado",
    positive_plan: "Plano positivo",
    missing_plan: "Sem plano completo",
  }[diagnosis.planQuality];

  return (
    <div className={`rounded-3xl border p-5 ${statusClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-75">Diagnóstico calculado pelo sistema</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">{statusLabel}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-90">{diagnosis.message}</p>
        </div>
        <span className="w-fit rounded-full border border-current/20 bg-slate-950/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">{planQuality}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Entradas" value={formatCurrency(summary.totals.actualIncome)} />
        <Metric label="Saídas" value={formatCurrency(summary.totals.actualExpenses)} />
        <Metric label="Saldo" value={formatCurrency(summary.totals.actualBalance)} />
        <Metric label="Gasto/entrada" value={diagnosis.expenseIncomeRatio === null ? "Sem entrada" : `${diagnosis.expenseIncomeRatio}%`} />
        <Metric label="Para empatar" value={formatCurrency(diagnosis.breakEvenGap)} />
        <Metric label="Para bater meta" value={formatCurrency(diagnosis.monthlyGoalGap)} />
        <Metric label="Saldo planejado" value={formatCurrency(summary.totals.expectedBalance)} />
        <Metric label="Regra" value={diagnosis.planWasDeficit ? "Plano já negativo" : "Saldo primeiro"} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-current/10 bg-slate-950/20 p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-65">{label}</p><p className="mt-1 text-base font-black text-white">{value}</p></div>;
}

function ResponseBlock({ title, items, tone }: { title: string; items: string[]; tone: "cyan" | "emerald" | "rose" | "gold" | "slate" }) {
  const className = {
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-100",
    rose: "border-rose-300/18 bg-rose-400/[0.08] text-rose-100",
    gold: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]",
    slate: "border-white/10 bg-white/[0.05] text-slate-200",
  }[tone];
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="mb-3 font-bold">{title}</p><div className="grid gap-2 text-sm leading-6">{items.length > 0 ? items.map((item) => <p key={item} className="rounded-xl bg-slate-950/20 px-3 py-2">{item}</p>) : <p>Sem apontamentos específicos.</p>}</div></div>;
}

function EmptyAnalysis() {
  return <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-400/[0.06] p-6 text-cyan-100"><div className="flex items-start gap-3"><Sparkles className="mt-1 size-5" aria-hidden="true" /><div><p className="font-semibold">Nenhuma análise aberta</p><p className="mt-1 text-sm opacity-80">Gere uma análise ou abra um item do histórico. A resposta aparecerá em blocos fáceis de ler no mobile.</p></div></div></div>;
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3"><span className="text-slate-400">{label}</span><span className={ok ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>{value}</span></div>;
}

function StateMessage({ tone, title, description }: { tone: "success" | "error" | "empty"; title: string; description: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const className = tone === "success" ? "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100" : tone === "empty" ? "border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100" : "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  return <div className={`flex gap-3 rounded-2xl border p-4 ${className}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-85">{description}</p></div></div>;
}

function periodFor(type: AiAnalysisType, month: string, year: number) {
  if (type === "annual" || type === "planning") return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  return monthBounds(month);
}

function isAnalysisType(value: unknown): value is AiAnalysisType {
  return value === "monthly" || value === "annual" || value === "savings" || value === "planning";
}

function analysisLabel(type: AiAnalysisType) {
  return { monthly: "Mensal", annual: "Anual", savings: "Economia", planning: "Planejamento" }[type];
}
