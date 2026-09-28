-- Semana 4: monthly planning, category budgets and savings goals.
-- Recurring fixed entries already live in recurring_rules + financial_entries.

create table if not exists public.budgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  category_id uuid references public.categories(id) on delete cascade not null,
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  planned_amount decimal(12,2) not null check (planned_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, year, month)
);

create table if not exists public.savings_goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  target_amount decimal(12,2) not null check (target_amount >= 0),
  current_amount decimal(12,2) not null default 0 check (current_amount >= 0),
  monthly_target decimal(12,2) not null default 0 check (monthly_target >= 0),
  deadline date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_budgets_user_month on public.budgets(user_id, year, month);
create index if not exists idx_budgets_category on public.budgets(category_id);
create index if not exists idx_savings_goals_user_active on public.savings_goals(user_id, is_active);

alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;

drop policy if exists "Users can view own budgets" on public.budgets;
drop policy if exists "Users can insert own budgets" on public.budgets;
drop policy if exists "Users can update own budgets" on public.budgets;
drop policy if exists "Users can delete own budgets" on public.budgets;
drop policy if exists "Users can view own savings goals" on public.savings_goals;
drop policy if exists "Users can insert own savings goals" on public.savings_goals;
drop policy if exists "Users can update own savings goals" on public.savings_goals;
drop policy if exists "Users can delete own savings goals" on public.savings_goals;

create policy "Users can view own budgets"
  on public.budgets for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own budgets"
  on public.budgets for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own budgets"
  on public.budgets for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own budgets"
  on public.budgets for delete
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can view own savings goals"
  on public.savings_goals for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own savings goals"
  on public.savings_goals for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own savings goals"
  on public.savings_goals for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own savings goals"
  on public.savings_goals for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant all on public.budgets to service_role;
grant all on public.savings_goals to service_role;
