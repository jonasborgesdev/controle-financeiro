import { Wallet } from "lucide-react";
import { ALL_ACCOUNTS_LABEL, ALL_ACCOUNTS_VALUE, useAccountScope } from "@/lib/account-scope";

type AccountSelectorProps = {
  variant: "desktop" | "mobile";
};

export function AccountSelector({ variant }: AccountSelectorProps) {
  const { accountId, accounts, selectAccount } = useAccountScope();

  const selectId = variant === "desktop" ? "global-account-desktop" : "global-account-mobile";
  const select = (
    <select
      id={selectId}
      aria-label="Conta selecionada"
      className={variant === "desktop" ? "finance-select" : "finance-select py-1.5 pl-8 pr-6 text-xs"}
      value={accountId}
      onChange={(event) => selectAccount(event.target.value)}
    >
      <option value={ALL_ACCOUNTS_VALUE}>{ALL_ACCOUNTS_LABEL}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>{account.name}</option>
      ))}
    </select>
  );

  if (variant === "desktop") {
    return (
      <div className="px-2">
        <label htmlFor={selectId} className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Conta</label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <span className="[&>select]:pl-9">{select}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      <Wallet className="pointer-events-none absolute left-2.5 size-3.5 text-slate-400" aria-hidden="true" />
      {select}
    </div>
  );
}
