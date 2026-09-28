-- Notion-like monthly financial control model.
-- Monthly balances are the center. Entries carry expected and actual amounts.
-- Recurring rules generate monthly entries automatically from the app flow.

create table if not exists public.monthly_balances (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, month)
);

create table if not exists public.financial_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  monthly_balance_id uuid references public.monthly_balances(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  status text not null default 'planned' check (status in ('planned', 'paid')),
  description text not null,
  expected_amount decimal(12,2) not null check (expected_amount >= 0),
  actual_amount decimal(12,2) check (actual_amount >= 0),
  due_date date not null,
  paid_date date,
  source text not null default 'manual' check (source in ('manual', 'recurring', 'imported', 'asaas')),
  recurring_rule_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_rules (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  description text not null,
  amount decimal(12,2) not null check (amount > 0),
  day_of_month int not null check (day_of_month between 1 and 31),
  start_year int not null check (start_year between 2000 and 2100),
  start_month int not null check (start_month between 1 and 12),
  end_year int check (end_year between 2000 and 2100),
  end_month int check (end_month between 1 and 12),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'financial_entries_recurring_rule_id_fkey'
      and table_name = 'financial_entries'
  ) then
    alter table public.financial_entries
      add constraint financial_entries_recurring_rule_id_fkey
      foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;
  end if;
end $$;

create index if not exists idx_monthly_balances_user_month on public.monthly_balances(user_id, year, month);
create index if not exists idx_financial_entries_user_id on public.financial_entries(user_id);
create index if not exists idx_financial_entries_balance on public.financial_entries(monthly_balance_id);
create index if not exists idx_financial_entries_type on public.financial_entries(entry_type);
create index if not exists idx_financial_entries_status on public.financial_entries(status);
create index if not exists idx_financial_entries_due_date on public.financial_entries(due_date);
create index if not exists idx_financial_entries_recurring on public.financial_entries(recurring_rule_id);
create index if not exists idx_recurring_rules_user_id on public.recurring_rules(user_id);
create index if not exists idx_recurring_rules_active on public.recurring_rules(is_active);

create unique index if not exists financial_entries_recurring_month_key
  on public.financial_entries (recurring_rule_id, monthly_balance_id);

alter table public.monthly_balances enable row level security;
alter table public.financial_entries enable row level security;
alter table public.recurring_rules enable row level security;

drop policy if exists "Users can view own monthly balances" on public.monthly_balances;
drop policy if exists "Users can insert own monthly balances" on public.monthly_balances;
drop policy if exists "Users can update own monthly balances" on public.monthly_balances;
drop policy if exists "Users can delete own monthly balances" on public.monthly_balances;
drop policy if exists "Users can view own financial entries" on public.financial_entries;
drop policy if exists "Users can insert own financial entries" on public.financial_entries;
drop policy if exists "Users can update own financial entries" on public.financial_entries;
drop policy if exists "Users can delete own financial entries" on public.financial_entries;
drop policy if exists "Users can view own recurring rules" on public.recurring_rules;
drop policy if exists "Users can insert own recurring rules" on public.recurring_rules;
drop policy if exists "Users can update own recurring rules" on public.recurring_rules;
drop policy if exists "Users can delete own recurring rules" on public.recurring_rules;

create policy "Users can view own monthly balances"
  on public.monthly_balances for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own monthly balances"
  on public.monthly_balances for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own monthly balances"
  on public.monthly_balances for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own monthly balances"
  on public.monthly_balances for delete
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can view own financial entries"
  on public.financial_entries for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own financial entries"
  on public.financial_entries for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own financial entries"
  on public.financial_entries for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own financial entries"
  on public.financial_entries for delete
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can view own recurring rules"
  on public.recurring_rules for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own recurring rules"
  on public.recurring_rules for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own recurring rules"
  on public.recurring_rules for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own recurring rules"
  on public.recurring_rules for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.monthly_balances to authenticated;
grant select, insert, update, delete on public.financial_entries to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant all on public.monthly_balances to service_role;
grant all on public.financial_entries to service_role;
grant all on public.recurring_rules to service_role;
