-- Monthly recurring incomes and expenses used for projected monthly balance.

create table if not exists public.recurring_transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount decimal(12,2) not null check (amount > 0),
  description text not null,
  day_of_month int not null check (day_of_month between 1 and 31),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_transactions_user_id on public.recurring_transactions(user_id);
create index if not exists idx_recurring_transactions_account_id on public.recurring_transactions(account_id);
create index if not exists idx_recurring_transactions_category_id on public.recurring_transactions(category_id);
create index if not exists idx_recurring_transactions_active on public.recurring_transactions(is_active);

alter table public.recurring_transactions enable row level security;

create policy "Users can view own recurring transactions"
  on public.recurring_transactions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own recurring transactions"
  on public.recurring_transactions for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own recurring transactions"
  on public.recurring_transactions for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own recurring transactions"
  on public.recurring_transactions for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.recurring_transactions to authenticated;
grant all on public.recurring_transactions to service_role;
