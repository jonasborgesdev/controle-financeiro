-- Account starting balance. Current balance is calculated from initial_balance + transactions.

alter table public.accounts
  add column if not exists initial_balance decimal(12,2) not null default 0;

comment on column public.accounts.initial_balance is 'Saldo inicial informado manualmente. O saldo atual deve ser calculado somando transações.';
