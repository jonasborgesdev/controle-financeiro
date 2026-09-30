import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, BrainCircuit, CheckCircle2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { testAsaasConnection, type AsaasEnvironment } from "@/lib/asaas";
import { getAiStatus, testAiConnection } from "@/lib/ai";
import { isFinanceClassification } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, IntegrationSetting, IntegrationSyncHistory } from "@/types/database";

const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const settingsColumns = "id,user_id,provider,enabled,environment,default_account_id,default_category_id,last_sync_at,created_at,updated_at";
const historyColumns = "id,user_id,provider,environment,period_start,period_end,total_found,imported_count,duplicated_count,ignored_count,status,error_message,created_at";

export const Route = createFileRoute("/configuracoes")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<IntegrationSetting | null>(null);
  const [aiSettings, setAiSettings] = useState<IntegrationSetting | null>(null);
  const [aiStatus, setAiStatus] = useState<{ enabled: boolean; configured: boolean; provider: string; model: string } | null>(null);
  const [history, setHistory] = useState<IntegrationSyncHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [environment, setEnvironment] = useState<AsaasEnvironment>("sandbox");
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [aiConnectionMessage, setAiConnectionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const incomeCategories = useMemo(() => categories.filter((category) => category.type === "income" && isFinanceClassification(category, user.id)), [categories, user.id]);
  const isConfigured = Boolean(settings?.enabled && settings.default_account_id);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);
    const [accountsResult, categoriesResult, settingsResult, historyResult] = await Promise.all([
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
      supabase.from("integration_settings").select(settingsColumns).eq("provider", "asaas").maybeSingle(),
      supabase.from("integration_sync_history").select(historyColumns).eq("provider", "asaas").order("created_at", { ascending: false }).limit(8),
    ]);
    const requestError = accountsResult.error ?? categoriesResult.error ?? settingsResult.error ?? historyResult.error;
    if (requestError) setMessage({ tone: "error", text: requestError.message });

    const nextAccounts = accountsResult.data ?? [];
    const nextCategories = categoriesResult.data ?? [];
    const nextSettings = settingsResult.data as IntegrationSetting | null;
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setSettings(nextSettings);
    setHistory(historyResult.data ?? []);
    setEnabled(nextSettings?.enabled ?? false);
    setEnvironment(nextSettings?.environment ?? "sandbox");
    setDefaultAccountId(nextSettings?.default_account_id ?? nextAccounts[0]?.id ?? "");
    setDefaultCategoryId(nextSettings?.default_category_id ?? nextCategories.find((category) => category.type === "income" && category.name === "Ganhos variáveis")?.id ?? "");
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const status = await getAiStatus({ data: { accessToken: sessionData.session?.access_token ?? "" } });
      const aiSettingsResult = await supabase.from("integration_settings").select(settingsColumns).eq("provider", "ai").maybeSingle();
      setAiStatus(status);
      setAiSettings(aiSettingsResult.data as IntegrationSetting | null);
      setAiEnabled(status.enabled);
    } catch {
      setAiStatus(null);
      setAiSettings(null);
      setAiEnabled(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    const payload = {
      user_id: user.id,
      provider: "asaas" as const,
      enabled,
      environment,
      default_account_id: defaultAccountId || null,
      default_category_id: defaultCategoryId || null,
      last_sync_at: settings?.last_sync_at ?? null,
    };
    const { data, error } = await supabase.from("integration_settings").upsert(payload, { onConflict: "user_id,provider" }).select(settingsColumns).single();
    if (error) {
      setMessage({ tone: "error", text: error.message });
    } else {
      setSettings(data as IntegrationSetting);
      setMessage({ tone: "success", text: enabled ? "Integração Asaas salva. Você já pode testar ou sincronizar." : "Integração Asaas desativada. O app continua funcionando normalmente." });
    }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    try {
      const result = await testAsaasConnection({ data: { accessToken: data.session?.access_token ?? "", environment } });
      setMessage({ tone: "success", text: result.message });
    } catch (caughtError) {
      setMessage({ tone: "error", text: caughtError instanceof Error ? caughtError.message : "Não consegui testar a conexão com o Asaas." });
    } finally {
      setTesting(false);
    }
  };

  const saveAiSettings = async () => {
    setSaving(true);
    setMessage(null);
    const payload = {
      user_id: user.id,
      provider: "ai" as const,
      enabled: aiEnabled,
      environment: "production" as const,
      default_account_id: null,
      default_category_id: null,
      last_sync_at: aiSettings?.last_sync_at ?? null,
    };
    const { data, error } = await supabase.from("integration_settings").upsert(payload, { onConflict: "user_id,provider" }).select(settingsColumns).single();
    if (error) {
      setMessage({ tone: "error", text: error.message });
    } else {
      setAiSettings(data as IntegrationSetting);
      setMessage({ tone: "success", text: aiEnabled ? "IA ativada. A geração depende da API key configurada no servidor." : "IA desativada. O app segue funcionando sem análises automáticas." });
      await loadData();
    }
    setSaving(false);
  };

  const testAi = async () => {
    setTestingAi(true);
    setMessage(null);
    setAiConnectionMessage(null);
    const { data } = await supabase.auth.getSession();
    try {
      const result = await testAiConnection({ data: { accessToken: data.session?.access_token ?? "" } });
      const text = (result as { message?: string }).message ?? "Conexão com IA funcionando.";
      setAiConnectionMessage({ tone: "success", text });
      setMessage({ tone: "success", text });
      await loadData();
    } catch (caughtError) {
      const text = caughtError instanceof Error ? caughtError.message : "Não consegui testar a IA.";
      setAiConnectionMessage({ tone: "error", text });
      setMessage({ tone: "error", text });
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2.25rem] p-5 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Configurações</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">Integrações opcionais, sem travar o controle manual.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">O Asaas complementa lançamentos de entrada. A chave fica no servidor e nunca aparece no navegador.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 size-5 text-emerald-300" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-50">Status: {isConfigured ? "ativo" : "opcional/inativo"}</p>
                  <p className="mt-1 text-sm text-slate-400">Manual, CSV/OFX/PDF e planejamento seguem funcionando mesmo se o Asaas falhar.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {message ? <StateMessage tone={message.tone} title={message.tone === "success" ? "Tudo certo" : "Atenção"} description={message.text} /> : null}
        {loading ? <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-slate-400">Carregando configurações...</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Asaas</CardTitle>
            <CardDescription>Ative quando a variável `ASAAS_API_KEY` estiver configurada no servidor/Vercel.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <span>
                  <span className="block font-semibold text-slate-50">Ativar integração</span>
                  <span className="text-sm text-slate-400">Se desligar, a ação de sincronizar não aparece no dashboard.</span>
                </span>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-emerald-400" />
              </label>
              <div className="space-y-2">
                <Label htmlFor="asaas-environment">Ambiente</Label>
                <select id="asaas-environment" className="finance-select" value={environment} onChange={(event) => setEnvironment(event.target.value as AsaasEnvironment)}>
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Produção</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asaas-account">Conta padrão</Label>
                <select id="asaas-account" className="finance-select" value={defaultAccountId} onChange={(event) => setDefaultAccountId(event.target.value)}>
                  <option value="">Selecione</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asaas-category">Classificação padrão</Label>
                <select id="asaas-category" className="finance-select" value={defaultCategoryId} onChange={(event) => setDefaultCategoryId(event.target.value)}>
                  <option value="">Sem classificação</option>
                  {incomeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" onClick={saveSettings} disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</Button>
              <Button type="button" variant="outline" onClick={testConnection} disabled={testing}>{testing ? "Testando..." : "Testar conexão"}</Button>
              {isConfigured ? <Link to="/asaas" className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.12] px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/[0.18]">Sincronizar agora</Link> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-1 size-5 text-cyan-200" aria-hidden="true" />
              <div>
                <CardTitle>IA</CardTitle>
                <CardDescription>Ative quando `GEMINI_API_KEY` ou `GROQ_API_KEY` estiver configurada no servidor/Vercel.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <span>
                  <span className="block font-semibold text-slate-50">Ativar análise inteligente</span>
                  <span className="text-sm text-slate-400">A IA só lê resumos agregados e não altera dados.</span>
                </span>
                <input type="checkbox" checked={aiEnabled} onChange={(event) => setAiEnabled(event.target.checked)} className="size-5 accent-emerald-400" />
              </label>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Status</p>
                <p className={aiStatus?.configured ? "mt-1 font-bold text-emerald-300" : "mt-1 font-bold text-rose-300"}>{aiStatus?.configured ? "Configurado" : "Não configurado"}</p>
                <p className="mt-1 text-sm text-slate-400">{aiStatus ? `${aiStatus.provider} · ${aiStatus.model}` : "Status indisponível"}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" onClick={saveAiSettings} disabled={saving}>{saving ? "Salvando..." : "Salvar IA"}</Button>
              <Button type="button" variant="outline" onClick={testAi} disabled={testingAi}>{testingAi ? "Testando..." : "Testar IA"}</Button>
              {aiStatus?.enabled ? <Link to="/ia" search={{ type: undefined, month: undefined, year: undefined }} className="rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.08] px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/[0.14]">Abrir análise inteligente</Link> : null}
            </div>
            {aiConnectionMessage ? <div className={aiConnectionMessage.tone === "success" ? "mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100" : "mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/[0.08] p-4 text-sm text-rose-100"}>{aiConnectionMessage.text}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico Asaas</CardTitle>
            <CardDescription>Últimas sincronizações confirmadas ou tentativas com erro.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {history.map((item) => <HistoryItem key={item.id} item={item} />)}
              {history.length === 0 ? <p className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/[0.06] p-4 text-sm text-cyan-100">Nenhuma sincronização Asaas registrada ainda.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function HistoryItem({ item }: { item: IntegrationSyncHistory }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-50">{item.period_start} até {item.period_end}</p>
          <p className="mt-1 text-sm text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.environment}</p>
        </div>
        <div className="text-sm text-slate-300 sm:text-right">
          <p><span className="text-cyan-200">{item.total_found}</span> encontrados · <span className="text-emerald-300">{item.imported_count}</span> importados</p>
          <p><span className="text-rose-300">{item.duplicated_count}</span> duplicatas · {item.ignored_count} ignorados</p>
        </div>
      </div>
      {item.error_message ? <p className="mt-3 text-sm text-rose-200">{item.error_message}</p> : null}
    </div>
  );
}

function StateMessage({ tone, title, description }: { tone: "success" | "error"; title: string; description: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const className = tone === "success" ? "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100" : "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  return <div className={`flex gap-3 rounded-2xl border p-4 ${className}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-85">{description}</p></div></div>;
}
