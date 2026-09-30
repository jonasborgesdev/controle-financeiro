-- Financing contracts integrated with the official monthly financial model.

alter table public.financial_entries
  drop constraint if exists financial_entries_source_check;

alter table public.financial_entries
  add constraint financial_entries_source_check
  check (source in ('manual', 'recurring', 'imported', 'asaas', 'financing'));

create table if not exists public.financings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  original_amount decimal(12,2) not null check (original_amount > 0),
  installment_amount decimal(12,2) not null check (installment_amount > 0),
  total_installments int not null check (total_installments > 0),
  paid_installments int not null default 0 check (paid_installments >= 0),
  due_day int not null check (due_day between 1 and 31),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'finished', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_installments <= total_installments)
);

alter table public.financial_entries
  add column if not exists financing_id uuid references public.financings(id) on delete set null,
  add column if not exists installment_year int check (installment_year between 2000 and 2100),
  add column if not exists installment_month int check (installment_month between 1 and 12);

create index if not exists idx_financings_user_status on public.financings(user_id, status);
create index if not exists idx_financings_due_day on public.financings(due_day);
create index if not exists idx_financial_entries_financing on public.financial_entries(financing_id);

create unique index if not exists financial_entries_financing_month_key
  on public.financial_entries (financing_id, installment_year, installment_month)
  where financing_id is not null and installment_year is not null and installment_month is not null;

alter table public.financings enable row level security;

drop policy if exists "Users can view own financings" on public.financings;
drop policy if exists "Users can insert own financings" on public.financings;
drop policy if exists "Users can update own financings" on public.financings;
drop policy if exists "Users can delete own financings" on public.financings;

create policy "Users can view own financings"
  on public.financings for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own financings"
  on public.financings for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own financings"
  on public.financings for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own financings"
  on public.financings for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.financings to authenticated;
grant all on public.financings to service_role;
