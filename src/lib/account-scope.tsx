import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Account } from "@/types/database";

export const ALL_ACCOUNTS_VALUE = "all";
export const ALL_ACCOUNTS_LABEL = "Todas as contas";

const STORAGE_KEY_PREFIX = "cf-selected-account";

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function readStoredAccountId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredAccountId(userId: string, accountId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), accountId);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

type AccountScopeContextValue = {
  accountId: string;
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  selectAccount: (accountId: string) => void;
};

const AccountScopeContext = createContext<AccountScopeContextValue | null>(null);

export function AccountScopeProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => readStoredAccountId(userId) ?? ALL_ACCOUNTS_VALUE);
  const [accounts, setAccountsState] = useState<Account[]>([]);

  const effectiveAccountId = useMemo(() => {
    if (selectedAccountId === ALL_ACCOUNTS_VALUE) return ALL_ACCOUNTS_VALUE;
    const exists = accounts.some((account) => account.id === selectedAccountId && account.is_active);
    return exists ? selectedAccountId : ALL_ACCOUNTS_VALUE;
  }, [selectedAccountId, accounts]);

  const setAccounts = useCallback((nextAccounts: Account[]) => {
    setAccountsState(nextAccounts);
  }, []);

  const selectAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    writeStoredAccountId(userId, accountId);
  }, [userId]);

  const value = useMemo(
    () => ({ accountId: effectiveAccountId, accounts, setAccounts, selectAccount }),
    [effectiveAccountId, accounts, setAccounts, selectAccount],
  );

  return <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>;
}

export function useAccountScope() {
  const context = useContext(AccountScopeContext);
  if (!context) {
    throw new Error("useAccountScope deve ser usado dentro de AccountScopeProvider");
  }
  return context;
}

export function filterEntriesByAccount<T extends { account_id: string | null }>(entries: T[], accountId: string): T[] {
  if (accountId === ALL_ACCOUNTS_VALUE) return entries;
  return entries.filter((entry) => entry.account_id === accountId);
}
