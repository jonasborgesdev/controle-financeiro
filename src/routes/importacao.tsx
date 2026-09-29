import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, isFinanceClassification, monthLabel, parseMonthKey } from "@/lib/finance";
import { importSummary, markDuplicates, parseStatement, suggestCategoryId, type ImportBank, type ImportFileType, type ReviewTransaction } from "@/lib/importer";
import { extractPdfText } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, FinancialEntry, ImportHistory, MonthlyBalance } from "@/types/database";

const accountColumns = "id,user_id,name,type,bank,description,initial_balance,is_active,color,icon,created_at,updated_at";
const categoryColumns = "id,user_id,name,icon,color,type,parent_id,is_default,is_active,created_at";
const entryColumns = "id,user_id,monthly_balance_id,account_id,category_id,entry_type,status,description,expected_amount,actual_amount,due_date,paid_date,source,recurring_rule_id,notes,created_at,updated_at";
const balanceColumns = "id,user_id,year,month,label,created_at,updated_at";
const historyColumns = "id,user_id,account_id,filename,file_type,bank,total_transactions,imported_transactions,duplicated_transactions,ignored_transactions,status,error_message,created_at";

export const Route = createFileRoute("/importacao")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: ImportPage,
});

function ImportPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [accountId, setAccountId] = useState("");
  const [bank, setBank] = useState<ImportBank>("automatic");
  const [file, setFile] = useState<File | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categoryByType = useMemo(() => ({
    income: categories.filter((category) => category.type === "income" && isFinanceClassification(category, user.id)),
    expense: categories.filter((category) => category.type === "expense" && isFinanceClassification(category, user.id)),
  }), [categories, user.id]);
  const summary = importSummary(reviewItems);
  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  const loadBaseData = async () => {
    setLoading(true);
    setError(null);
    const [accountsResult, categoriesResult, historyResult] = await Promise.all([
      supabase.from("accounts").select(accountColumns).eq("is_active", true).order("name"),
      supabase.from("categories").select(categoryColumns).eq("is_active", true).order("type").order("name"),
      supabase.from("import_history").select(historyColumns).order("created_at", { ascending: false }).limit(10),
    ]);

    const requestError = accountsResult.error ?? categoriesResult.error ?? historyResult.error;
    if (requestError) setError(requestError.message);
    setAccounts(accountsResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setHistory(historyResult.data ?? []);
    if (!accountId && accountsResult.data?.[0]) setAccountId(accountsResult.data[0].id);
    setLoading(false);
  };

  useEffect(() => {
    void loadBaseData();
  }, []);

  const processFile = async () => {
    setError(null);
    setSuccess(null);
    if (!accountId) {
      setError("Escolha uma conta antes de processar o extrato.");
      return;
    }
    if (!file) {
      setError("Selecione um arquivo CSV ou OFX para continuar.");
      return;
    }

    const fileType = detectFileType(file.name);
    if (!fileType) {
        setError("Arquivo inválido. Envie um CSV, OFX ou PDF de extrato exportado pelo banco.");
      return;
    }

    setProcessing(true);
    try {
      const content = fileType === "pdf" ? await extractPdfText(file) : await file.text();
      const parsed = parseStatement(content, fileType, bank);
      if (parsed.length === 0) {
        setReviewItems([]);
        setError("Não encontrei lançamentos válidos nesse arquivo. Confira se ele é um extrato bancário em CSV, OFX ou PDF com data, descrição e valor dos movimentos.");
        return;
      }

      const { data, error: entriesError } = await supabase
        .from("financial_entries")
        .select(entryColumns)
        .eq("account_id", accountId)
        .order("due_date", { ascending: false });

      if (entriesError) throw entriesError;

      const nextItems = markDuplicates(parsed, data ?? [], accountId).map((item) => ({
        ...item,
        accountId,
        categoryId: suggestCategoryId(item, categories, user.id),
      }));
      setReviewItems(nextItems);
      setSuccess(`${parsed.length} lançamento(s) encontrados. Revise antes de salvar.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não consegui processar o arquivo.");
    } finally {
      setProcessing(false);
    }
  };

  const confirmImport = async () => {
    setError(null);
    setSuccess(null);
    if (!file || !accountId) return;
    const fileType = detectFileType(file.name) ?? "csv";
    const selectedItems = reviewItems.filter((item) => item.selected && !item.duplicate);
    if (selectedItems.length === 0) {
      setError("Nenhum lançamento selecionado para importar.");
      return;
    }

    setSaving(true);
    let historyId: string | null = null;
    try {
      const duplicated = reviewItems.filter((item) => item.duplicate).length;
      const ignored = reviewItems.length - selectedItems.length - duplicated;
      const { data: history, error: startHistoryError } = await supabase
        .from("import_history")
        .insert({
          user_id: user.id,
          account_id: accountId,
          filename: file.name,
          file_type: fileType,
          bank,
          total_transactions: reviewItems.length,
          imported_transactions: 0,
          duplicated_transactions: duplicated,
          ignored_transactions: Math.max(ignored, 0),
          status: "processing",
          error_message: null,
        })
        .select("id")
        .single();
      if (startHistoryError) throw startHistoryError;
      historyId = history.id;

      const balances = await ensureMonthlyBalances(selectedItems.map((item) => item.date));
      const rows = selectedItems.map((item) => {
        const { year, month } = parseMonthKey(item.date.slice(0, 7));
        const balance = balances.get(`${year}-${month}`);
        if (!balance) throw new Error(`Não consegui criar o balanço de ${monthLabel(year, month)}.`);

        return {
          user_id: user.id,
          monthly_balance_id: balance.id,
          account_id: item.accountId,
          category_id: item.categoryId || null,
          entry_type: item.type,
          status: item.status,
          description: item.description.trim(),
          expected_amount: item.amount,
          actual_amount: item.status === "paid" ? item.amount : null,
          due_date: item.date,
          paid_date: item.status === "paid" ? item.date : null,
          source: "imported" as const,
          recurring_rule_id: null,
          notes: item.externalId ? `Importado do extrato. ID externo: ${item.externalId}` : "Importado do extrato.",
        };
      });

      const { error: insertError } = await supabase.from("financial_entries").insert(rows);
      if (insertError) throw insertError;

      const { error: historyError } = await supabase.from("import_history").update({
        imported_transactions: selectedItems.length,
        status: "completed",
        error_message: null,
      }).eq("id", historyId);
      if (historyError) throw historyError;

      setSuccess(`${selectedItems.length} lançamento(s) importados. Duplicatas e itens ignorados não foram salvos.`);
      setReviewItems([]);
      await loadBaseData();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Erro ao salvar importação.";
      setError(message);
      if (historyId) await supabase.from("import_history").update({ status: "error", error_message: message }).eq("id", historyId);
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
      const { data, error: balanceError } = await supabase
        .from("monthly_balances")
        .upsert(payload, { onConflict: "user_id,year,month" })
        .select(balanceColumns)
        .single();
      if (balanceError) throw balanceError;
      result.set(`${year}-${month}`, data as MonthlyBalance);
    }

    return result;
  };

  const updateItem = (id: string, patch: Partial<ReviewTransaction>) => {
    setReviewItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="finance-glass-strong overflow-hidden rounded-[2.25rem] p-5 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-cyan-200">Importação CSV/OFX/PDF</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">Extrato entra só depois da sua revisão.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">Exporte o extrato em CSV, OFX ou PDF no app/site do banco. PDFs tabulares são reconstruídos em linhas antes da leitura, e nada é salvo sem a sua conferência.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <Upload className="mt-1 size-5 text-cyan-200" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-50">Leitura genérica com revisão</p>
                  <p className="mt-1 text-sm text-slate-400">O banco é só uma ajuda opcional. O sistema tenta detectar data, descrição e valor em extratos tabulares.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? <StateMessage tone="error" title="Atenção" description={error} /> : null}
        {success ? <StateMessage tone="success" title="Tudo certo" description={success} /> : null}
        {loading ? <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-slate-400">Carregando dados para importação...</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>1. Processar arquivo</CardTitle>
            <CardDescription>Escolha a conta, mantenha banco em automático quando não tiver certeza e selecione o CSV/OFX/PDF exportado.</CardDescription>
          </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="import-account">Conta</Label>
                <select id="import-account" className="finance-select" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                  <option value="">Selecione</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-bank">Banco</Label>
                <select id="import-bank" className="finance-select" value={bank} onChange={(event) => setBank(event.target.value as ImportBank)}>
                  <option value="automatic">Automático</option>
                  <option value="nubank">Nubank</option>
                  <option value="santander">Santander</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-file">Arquivo CSV/OFX/PDF</Label>
                <Input id="import-file" type="file" accept=".csv,.ofx,.pdf,text/csv,application/x-ofx,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </div>
              <Button type="button" onClick={processFile} disabled={processing}>{processing ? "Processando..." : "Processar"}</Button>
            </div>
            <p className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-400/[0.07] p-3 text-sm text-amber-100">PDFs variam muito entre bancos. Confira datas, valores e tipo de lançamento antes de importar.</p>
          </CardContent>
        </Card>

        {reviewItems.length > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>2. Revisar antes de salvar</CardTitle>
                  <CardDescription>{summary.total} encontrado(s), {summary.income} entrada(s), {summary.expense} saída(s), {summary.duplicates} possível(is) duplicata(s). Ajuste qualquer linha antes de salvar.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setReviewItems((items) => items.map((item) => ({ ...item, selected: !item.duplicate })))}>Selecionar válidos</Button>
                  <Button type="button" onClick={confirmImport} disabled={saving}>{saving ? "Importando..." : `Importar ${summary.selected}`}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <SummaryPill label="Total" value={summary.total} tone="cyan" />
                <SummaryPill label="Entradas" value={summary.income} tone="emerald" />
                <SummaryPill label="Saídas" value={summary.expense} tone="rose" />
                <SummaryPill label="Revisar" value={summary.needsReview} tone="gold" />
              </div>
              <div className="grid gap-3">
                {reviewItems.map((item) => (
                  <ReviewItem key={item.id} item={item} accounts={accounts} categories={categoryByType[item.type]} accountName={accountNameById.get(item.accountId) ?? "Conta"} onChange={(patch) => updateItem(item.id, patch)} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Histórico de importações</CardTitle>
            <CardDescription>Últimos arquivos processados neste usuário.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-50">{item.filename}</p>
                      <p className="mt-1 text-sm text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.bank} · {item.account_id ? accountNameById.get(item.account_id) ?? "Conta" : "Conta removida"}</p>
                    </div>
                    <div className="text-sm text-slate-300 sm:text-right">
                      <p><span className="text-emerald-300">{item.imported_transactions}</span> importados</p>
                      <p><span className="text-rose-300">{item.duplicated_transactions}</span> duplicatas · {item.ignored_transactions} ignorados</p>
                    </div>
                  </div>
                  {item.error_message ? <p className="mt-3 text-sm text-rose-200">{item.error_message}</p> : null}
                </div>
              ))}
              {history.length === 0 ? <p className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/[0.06] p-4 text-sm text-cyan-100">Nenhuma importação registrada ainda.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ReviewItem({ item, accounts, categories, accountName, onChange }: { item: ReviewTransaction; accounts: Account[]; categories: Category[]; accountName: string; onChange: (patch: Partial<ReviewTransaction>) => void }) {
  const toneClass = item.type === "income" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className={item.duplicate ? "rounded-2xl border border-amber-300/25 bg-amber-400/[0.08] p-4" : "rounded-2xl border border-white/10 bg-white/[0.05] p-4"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-100">
          <input type="checkbox" checked={item.selected} disabled={item.duplicate} onChange={(event) => onChange({ selected: event.target.checked })} className="size-5 accent-emerald-400" />
          {item.duplicate ? "Duplicata provável" : "Importar"}
        </label>
        <p className={`text-right font-black ${toneClass}`}>{item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}</p>
      </div>
      {item.duplicateReason ? <p className="mb-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-3 text-sm text-amber-100">{item.duplicateReason}</p> : null}
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.75fr_0.7fr_0.8fr_0.8fr_0.9fr]">
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input value={item.description} onChange={(event) => onChange({ description: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={item.date} onChange={(event) => onChange({ date: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Valor</Label>
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={item.amount} onChange={(event) => onChange({ amount: Number(event.target.value || 0) })} />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <select className="finance-select" value={item.type} onChange={(event) => onChange({ type: event.target.value as ReviewTransaction["type"], categoryId: "" })}>
            <option value="income">Entrada</option>
            <option value="expense">Saída</option>
          </select>
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
        <span>{accountName}</span>
        <span>·</span>
        <select className="rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-slate-200" value={item.status} onChange={(event) => onChange({ status: event.target.value as ReviewTransaction["status"] })} aria-label="Status do item">
          <option value="paid">Realizado</option>
          <option value="planned">Previsto</option>
        </select>
        {item.externalId ? <><span>·</span><span>ID externo: {item.externalId}</span></> : null}
      </div>
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "cyan" | "emerald" | "rose" | "gold" }) {
  const className = {
    cyan: "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-100",
    rose: "border-rose-300/18 bg-rose-400/[0.08] text-rose-100",
    gold: "border-[#f5c76b]/20 bg-[#f5c76b]/[0.08] text-[#fff3c4]",
  }[tone];
  return <div className={`rounded-2xl border p-4 ${className}`}><p className="text-xs uppercase tracking-[0.12em] opacity-70">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function StateMessage({ tone, title, description }: { tone: "error" | "success"; title: string; description: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const className = tone === "success" ? "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100" : "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  return <div className={`flex gap-3 rounded-2xl border p-4 ${className}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm opacity-85">{description}</p></div></div>;
}

function detectFileType(filename: string): ImportFileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".ofx")) return "ofx";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}
