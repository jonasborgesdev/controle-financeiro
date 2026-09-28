-- transactions table
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount decimal(12,2) not null check (amount > 0),
  description text not null,
  notes text,
  date date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'imported', 'asaas', 'recurring')),
  external_id text,
  is_confirmed boolean not null default true,
  is_recurring boolean not null default false,
  recurring_id uuid,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index idx_transactions_user_id on public.transactions(user_id);
create index idx_transactions_account_id on public.transactions(account_id);
create index idx_transactions_category_id on public.transactions(category_id);
create index idx_transactions_date on public.transactions(date);
create index idx_transactions_type on public.transactions(type);
create index idx_transactions_source on public.transactions(source);
create index idx_transactions_external_id on public.transactions(external_id);

-- RLS for transactions
alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

create policy "Admin can view all transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
