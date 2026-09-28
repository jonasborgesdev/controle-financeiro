import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { accountBalanceFromEntries, accountProjectedBalanceFromEntries, formatCurrency } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Account, FinancialEntry } from "@/types/database";

type AccountForm = {
  name: string;
  bank: string;
  initial_balance: string;
};

const emptyForm: AccountForm = {
  name: "",
  bank: "",
  initial_balance: "0",
};

export const Route = createFileRoute("/contas")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/login" });
    }

    return { user: data.session.user };
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    const [accountsResult, transactionsResult] = await Promise.all([
      supabase.from("accounts").select("*").order("is_active", { ascending: false }).order("name"),
      supabase.from("financial_entries").select("*"),
    ]);
    if (accountsResult.error) setError(accountsResult.error.message);
    if (transactionsResult.error) setError(transactionsResult.error.message);
    setAccounts(accountsResult.data ?? []);
    setEntries(transactionsResult.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const openNewAccount = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      type: "personal" as const,
      bank: form.bank.trim() || null,
      description: null,
      initial_balance: Number(form.initial_balance || 0),
      is_active: true,
      color: null,
      icon: null,
    };

    const result = editingId
      ? await supabase.from("accounts").update(payload).eq("id", editingId)
      : await supabase.from("accounts").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      setModalOpen(false);
      await loadAccounts();
    }

    setSaving(false);
  };

  const editAccount = (account: Account) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      bank: account.bank ?? "",
      initial_balance: String(account.initial_balance ?? 0),
    });
    setModalOpen(true);
  };

  const toggleAccount = async (account: Account) => {
    const action = account.is_active ? "desativar" : "reativar";
    if (!window.confirm(`Tem certeza que deseja ${action} esta conta?`)) return;

    const { error } = await supabase.from("accounts").update({ is_active: !account.is_active }).eq("id", account.id);
    if (error) setError(error.message);
    await loadAccounts();
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-300">Carteira operacional</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-5xl">Contas com saldo vivo.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">O saldo atual usa só realizados. O saldo previsto mostra quanto deve sobrar considerando os lançamentos planejados.</p>
            </div>
            <Button type="button" onClick={openNewAccount}>Nova conta</Button>
          </div>
        </section>
        <Card>
          <CardHeader>
            <CardTitle>Contas</CardTitle>
            <CardDescription>{accounts.length} conta(s) cadastrada(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-gray-500">Carregando...</p> : null}
            <div className="grid gap-3">
              {accounts.map((account) => (
                <div key={account.id} className="rounded-xl border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-950">{account.name}</h3>
                        {!account.is_active ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inativa</span> : null}
                      </div>
                      <p className="text-sm text-gray-500">{account.bank || "Sem banco informado"}</p>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-gray-500">Saldo inicial</p>
                          <p className="font-semibold text-gray-950">{formatCurrency(Number(account.initial_balance ?? 0))}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3">
                          <p className="text-emerald-700">Saldo atual</p>
                          <p className="font-semibold text-emerald-900">{formatCurrency(accountBalanceFromEntries(account, entries))}</p>
                        </div>
                        <div className="rounded-lg bg-cyan-50 p-3">
                          <p className="text-cyan-700">Saldo previsto</p>
                          <p className="font-semibold text-cyan-900">{formatCurrency(accountProjectedBalanceFromEntries(account, entries))}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => editAccount(account)}>Editar</Button>
                      <Button type="button" variant="destructive" onClick={() => toggleAccount(account)}>{account.is_active ? "Desativar" : "Reativar"}</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && accounts.length === 0 ? <p className="text-sm text-gray-500">Nenhuma conta cadastrada.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Modal title={editingId ? "Editar conta" : "Nova conta"} description="Configure o saldo inicial para o sistema calcular o saldo atual e o previsto automaticamente." open={modalOpen} onClose={() => setModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank">Banco</Label>
                <Input id="bank" value={form.bank} onChange={(event) => setForm({ ...form, bank: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial_balance">Saldo inicial</Label>
                <Input id="initial_balance" type="number" step="0.01" value={form.initial_balance} onChange={(event) => setForm({ ...form, initial_balance: event.target.value })} />
              </div>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar conta"}</Button>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
