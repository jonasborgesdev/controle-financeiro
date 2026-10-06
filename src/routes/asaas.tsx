import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CloudLightning } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountScope } from "@/lib/account-scope";
import { asaasSyncSummary, formatAsaasStatus, syncAsaasPayments, type AsaasReviewPayment } from "@/lib/asaas";
import { formatCurrency, monthBounds, monthLabel, parseMonthKey } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, IntegrationSetting, MonthlyBalance } from "@/types/database";

const currentMonth = new Date().toISOString().slice(0, 7);
const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const settingsColumns = "id,user_id,provider,enabled,environment,default_account_id,default_category_id,last_sync_at,created_at,updated_at";
const balanceColumns = "id,user_id,year,month,label,created_at,updated_at";

export const Route = createFileRoute("/asaas")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: AsaasPage,
});

function AsaasPage() {
  const { user } = Route.useRouteContext();
  const { accountId: selectedAccountId } = useAccountScope();
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<IntegrationSetting | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [items, setItems] = useState<AsaasReviewPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "empty"; text: string } | null>(null);
  const summary = asaasSyncSummary(items);
  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const categoryByType = useMemo(() => categories.filter((category) => category.type === "income"), [categories]);

  const loadBaseData = async () => {
    setLoading(true);
    setMessage(null);
    const [accountsResult, categoriesResult, settingsResult] = await Promise.all([
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
      supabase.from("integration_settings").select(settingsColumns).eq("provider", "asaas").maybeSingle(),
    ]);
    const requestError = accountsResult.error ?? categoriesResult.error ?? settingsResult.error;
    if (requestError) setMessage({ tone: "error", text: requestError.message });
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setSettings(settingsResult.data as IntegrationSetting | null);
    setLoading(false);
  };

  useEffect(() => {
    void loadBaseData();
  }, []);

  const syncPeriod = async () => {
    setSyncing(true);
    setItems([]);
    setMessage(null);
    const { startDate, endDate } = monthBounds(selectedMonth);
    const { data } = await supabase.auth.getSession();
    try {
      const result = await syncAsaasPayments({ data: { accessToken: data.session?.access_token ?? "", periodStart: startDate, periodEnd: endDate } });
      const defaultAccountId = selectedAccountId === "all" ? undefined : selectedAccountId;
      const itemsWithAccount = defaultAccountId ? result.items.map((item) => ({ ...item, accountId: defaultAccountId })) : result.items;
      setItems(itemsWithAccount);
      setMessage(result.items.length === 0 ? { tone: "empty", text: "Nenhum pagamento recebido encontrado no Asaas para este período." } : { tone: "success", text: `${result.items.length} pagamento(s) encontrado(s). Revise antes de salvar.` });
    } catch (caughtError) {
      const text = caughtError instanceof Error ? caughtError.message : "Não consegui sincronizar o Asaas.";
      setMessage({ tone: "error", text });
      await saveHistory(0, 0, 0, 0, "error", text);
    } finally {
      setSyncing(false);
    }
  };

  const confirmImport = async () => {
    setSaving(true);
    setMessage(null);
    const selectedItems = items.filter((item) => item.selected && !item.duplicate);
    if (selectedItems.length === 0) {
      setMessage({ tone: "error", text: "Nenhum pagamento novo selecionado para importar." });
      setSaving(false);
      return;
    }
    try {
      const balances = await ensureMonthlyBalances(selectedItems.map((item) => item.date));
      const rows = selectedItems.map((item) => {
        const { year, month } = parseMonthKey(item.date.slice(0, 7));
        const balance = balances.get(`${year}-${month}`);
        if (!balance) throw new Error(`Não consegui criar o balanço de ${monthLabel(year, month)}.`);
        return {
          user_id: user.id,
          monthly_balance_id: balance.id,
          account_id: item.accountId || null,
          category_id: item.categoryId || null,
          entry_type: "income" as const,
          status: "paid" as const,
          description: item.description.trim(),
          expected_amount: item.amount,
          actual_amount: item.amount,
          due_date: item.date,
          paid_date: item.date,
          source: "asaas" as const,
          recurring_rule_id: null,
          external_id: item.externalId,
          notes: item.notes,
        };
      });
      const { error: insertError } = await supabase.from("financial_entries").insert(rows);
      if (insertError) throw insertError;
      await saveHistory(summary.total, selectedItems.length, summary.duplicates, summary.ignored, "completed", null);
      await supabase.from("integration_settings").update({ last_sync_at: new Date().toISOString() }).eq("provider", "asaas");
      setItems([]);
      setMessage({ tone: "success", text: `${selectedItems.length} recebimento(s) do Asaas importado(s) como entradas realizadas.` });
    } catch (caughtError) {
      const text = caughtError instanceof Error ? caughtError.message : "Erro ao salvar lançamentos do Asaas.";
      setMessage({ tone: "error", text });
      await saveHistory(summary.total, 0, summary.duplicates, summary.ignored, "error", text);
    } finally {
      setSaving(false);
    }
  };

  const ensureMonthlyBalances = async (dates: string[]) => {
    const keys = Array.from(new Set(dates.map((date) => date.slice(0, 7))));
    const result = new Map<string, MonthlyBalance>();
    for (const key of keys) {
      const { year, month } = parseMonthKey(key);
      const payload = { user_id: user.id, year, month, label: monthLabel(year, month) };
      const { data, error } = await supabase.from("monthly_balances").upsert(payload, { onConflict: "user_id,year,month" }).select(balanceColumns).single();
      if (error) throw error;
      result.set(`${year}-${month}`, data as MonthlyBalance);
    }
    return result;
  };

  const saveHistory = async (total: number, imported: number, duplicated: number, ignored: number, status: "completed" | "error", errorMessage: string | null) => {
    const { startDate, endDate } = monthBounds(selectedMonth);
    await supabase.from("integration_sync_history").insert({
      user_id: user.id,
      provider: "asaas",
      environment: settings?.environment ?? "sandbox",
      period_start: startDate,
      period_end: endDate,
      total_found: total,
      imported_count: imported,
      duplicated_count: duplicated,
      ignored_count: ignored,
      status,
      error_message: errorMessage,
    });
  };

  const updateItem = (id: string, patch: Partial<AsaasReviewPayment>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const { year, month } = parseMonthKey(selectedMonth);
  const monthTitle = monthLabel(year, month);
  const integrationReady = Boolean(settings?.enabled && settings.default_account_id);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHero eyebrow="Sincronização Asaas" title="Recebimentos entram depois da sua aprovação." description="Busque pagamentos recebidos no período, revise conta/classificação/descrição e só então grave como entrada realizada.">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-start gap-3">
                <CloudLightning className="mt-1 size-5 text-cyan-200" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-50">{settings?.environment === "production" ? "Produção" : "Sandbox"}</p>
                  <p className="mt-1 text-sm text-slate-400">Valor importado: líquido (`netValue`). O bruto fica nas observações.</p>
                </div>
              </div>
            </div>
        </PageHero>

        {message ? <StateMessage tone={message.tone} title={message.tone === "success" ? "Tudo certo" : message.tone === "empty" ? "Sem recebimentos" : "Atenção"} description={message.text} /> : null}
        {loading ? <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-slate-400">Carregando integração...</p> : null}
        {!loading && !integrationReady ? <StateMessage tone="error" title="Asaas ainda não configurado" description="Ative a integração e escolha uma conta padrão em Configurações antes de sincronizar." /> : null}

        <Card>
          <CardHeader>
            <CardTitle>1. Buscar recebimentos</CardTitle>
            <CardDescription>Por padrão, o sistema usa o mês selecionado e filtra pagamentos RECEIVED/CONFIRMED por data de pagamento.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <MonthPicker id="asaas-month" label="Mês" value={selectedMonth} onChange={setSelectedMonth} />
              <Button type="button" onClick={syncPeriod} disabled={!integrationReady || syncing}>{syncing ? "Sincronizando..." : `Sincronizar ${monthTitle}`}</Button>
              <Link to="/configuracoes" className="rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.08] px-4 py-3 text-center text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/[0.14]">Configurações</Link>
            </div>
          </CardContent>
        </Card>

        {items.length > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>2. Revisar pagamentos</CardTitle>
                  <CardDescription>{summary.total} encontrado(s), {summary.selected} novo(s), {summary.duplicates} duplicata(s). Total líquido: {formatCurrency(summary.netValue)}.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: !item.duplicate })))}>Selecionar válidos</Button>
                  <Button type="button" onClick={confirmImport} disabled={saving}>{saving ? "Importando..." : `Importar ${summary.selected}`}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <SummaryPill label="Encontrados" value={summary.total} tone="cyan" />
                <SummaryPill label="Novos" value={summary.selected} tone="emerald" />
                <SummaryPill label="Duplicados" value={summary.duplicates} tone="rose" />
                <SummaryPill label="Líquido" value={formatCurrency(summary.netValue)} tone="gold" />
              </div>
              <div className="grid gap-3">
                {items.map((item) => <ReviewItem key={item.id} item={item} accounts={accounts} categories={categoryByType} accountName={accountNameById.get(item.accountId) ?? "Conta"} onChange={(patch) => updateItem(item.id, patch)} />)}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReviewItem({ item, accounts, categories, accountName, onChange }: { item: AsaasReviewPayment; accounts: Account[]; categories: Category[]; accountName: string; onChange: (patch: Partial<AsaasReviewPayment>) => void }) {
  return (
    <div className={item.duplicate ? "rounded-2xl border border-amber-300/25 bg-amber-400/[0.08] p-4" : "rounded-2xl border border-white/10 bg-white/[0.05] p-4"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-100">
          <input type="checkbox" checked={item.selected} disabled={item.duplicate} onChange={(event) => onChange({ selected: event.target.checked })} className="size-5 accent-emerald-400" />
          {item.duplicate ? "Duplicata" : "Importar"}
        </label>
        <div className="text-right">
          <p className="font-black text-emerald-300">+{formatCurrency(item.amount)}</p>
          <p className="text-xs text-slate-400">bruto {formatCurrency(item.grossValue)}</p>
        </div>
      </div>
      {item.duplicateReason ? <p className="mb-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-3 text-sm text-amber-100">{item.duplicateReason}</p> : null}
      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.75fr_0.75fr_0.9fr_0.9fr]">
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input value={item.description} onChange={(event) => onChange({ description: event.target.value })} />
        </div>
        <div className="space-y-2">
          <DatePicker label="Data" value={item.date} onChange={(value) => onChange({ date: value })} />
        </div>
        <div className="space-y-2">
          <Label>Valor líquido</Label>
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={item.amount} onChange={(event) => onChange({ amount: Number(event.target.value || 0) })} />
        </div>
        <div className="space-y-2">
          <Label>Conta</Label>
          <select className="finance-select" value={item.accountId} onChange={(event) => onChange({ accountId: event.target.value })}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Classificação</Label>
          <select className="finance-select" value={item.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
            <option value="">Sem classificação</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{accountName}</span><span>·</span><span>{item.billingType}</span><span>·</span><span>{formatAsaasStatus(item.status)}</span><span>·</span><span>ID: {item.externalId}</span>
      </div>
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number | string; tone: "cyan" | "emerald" | "rose" | "gold" }) {
  const className = {
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-100",
    rose: "border-rose-300/18 bg-rose-400/[0.08] text-rose-100",
    gold: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]",
  }[tone];
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="text-xs uppercase tracking-[0.12em] opacity-70">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function StateMessage({ tone, title, description }: { tone: "success" | "error" | "empty"; title: string; description: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const className = tone === "success" ? "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100" : tone === "empty" ? "border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100" : "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  return <div className={`flex gap-3 rounded-2xl border p-4 ${className}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-85">{description}</p></div></div>;
}
