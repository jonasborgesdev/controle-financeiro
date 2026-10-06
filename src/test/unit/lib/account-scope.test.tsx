import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ALL_ACCOUNTS_VALUE, AccountScopeProvider, filterEntriesByAccount, useAccountScope } from "@/lib/account-scope";
import type { Account, FinancialEntry } from "@/types/database";

const accounts: Account[] = [
  { id: "acc-1", user_id: "user-1", name: "Conta A", type: "personal", bank: null, description: null, initial_balance: 100, is_active: true, color: null, icon: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "acc-2", user_id: "user-1", name: "Conta B", type: "personal", bank: null, description: null, initial_balance: 200, is_active: true, color: null, icon: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "acc-3", user_id: "user-1", name: "Inativa", type: "personal", bank: null, description: null, initial_balance: 0, is_active: false, color: null, icon: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

function CurrentAccount() {
  const { accountId } = useAccountScope();
  return <div data-testid="current-account">{accountId}</div>;
}

function Selector() {
  const { accountId, accounts: loadedAccounts, selectAccount } = useAccountScope();
  return (
    <select value={accountId} onChange={(event) => selectAccount(event.target.value)} data-testid="selector">
      <option value={ALL_ACCOUNTS_VALUE}>Todas</option>
      {loadedAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
    </select>
  );
}

function AccountLoader({ accounts: accountsToLoad }: { accounts: Account[] }) {
  const { setAccounts } = useAccountScope();
  useEffect(() => {
    setAccounts(accountsToLoad);
  }, [setAccounts, accountsToLoad]);
  return null;
}

function TestHarness({ accounts: accountsToLoad }: { accounts: Account[] }) {
  return (
    <AccountScopeProvider userId="user-1">
      <AccountLoader accounts={accountsToLoad} />
      <CurrentAccount />
      <Selector />
    </AccountScopeProvider>
  );
}

describe("account-scope", () => {
  it("começa em 'Todas' quando não há conta salva", () => {
    render(<TestHarness accounts={accounts} />);
    expect(screen.getByTestId("current-account").textContent).toBe(ALL_ACCOUNTS_VALUE);
  });

  it("permite selecionar uma conta", async () => {
    render(<TestHarness accounts={accounts} />);
    const selector = screen.getByTestId("selector");
    await userEvent.selectOptions(selector, "acc-2");
    expect(selector).toHaveValue("acc-2");
    expect(screen.getByTestId("current-account").textContent).toBe("acc-2");
  });

  it("fallback para 'Todas' quando a conta selecionada é removida/desativada", async () => {
    const { rerender } = render(<TestHarness accounts={accounts} />);
    const selector = screen.getByTestId("selector");
    const currentAccount = screen.getByTestId("current-account");

    await userEvent.selectOptions(selector, "acc-2");
    expect(currentAccount.textContent).toBe("acc-2");

    rerender(<TestHarness accounts={accounts.filter((account) => account.id !== "acc-2")} />);
    await waitFor(() => expect(currentAccount.textContent).toBe(ALL_ACCOUNTS_VALUE));
  });

  it("filtra entradas por conta", () => {
    const entries: FinancialEntry[] = [
      { ...baseEntry, id: "e1", account_id: "acc-1" },
      { ...baseEntry, id: "e2", account_id: "acc-2" },
      { ...baseEntry, id: "e3", account_id: null },
    ];
    expect(filterEntriesByAccount(entries, ALL_ACCOUNTS_VALUE)).toHaveLength(3);
    expect(filterEntriesByAccount(entries, "acc-1")).toHaveLength(1);
    expect(filterEntriesByAccount(entries, "acc-1")[0]?.id).toBe("e1");
    expect(filterEntriesByAccount(entries, "missing")).toHaveLength(0);
  });
});

const baseEntry: FinancialEntry = {
  id: "entry-1",
  user_id: "user-1",
  monthly_balance_id: "balance-1",
  account_id: "account-1",
  category_id: null,
  recurring_rule_id: null,
  description: "Entrada teste",
  entry_type: "income",
  expected_amount: 1000,
  actual_amount: null,
  due_date: "2026-09-10",
  paid_date: null,
  source: "manual",
  status: "planned",
  external_id: null,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
