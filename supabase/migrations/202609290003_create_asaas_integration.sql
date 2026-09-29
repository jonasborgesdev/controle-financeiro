-- Optional Asaas integration settings and sync audit trail.

alter table public.financial_entries
  add column if not exists external_id text;

create unique index if not exists financial_entries_asaas_external_id_key
  on public.financial_entries (user_id, source, external_id)
  where source = 'asaas' and external_id is not null;

create table if not exists public.integration_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('asaas')),
  enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  default_account_id uuid references public.accounts(id) on delete set null,
  default_category_id uuid references public.categories(id) on delete set null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_sync_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('asaas')),
  environment text not null check (environment in ('sandbox', 'production')),
  period_start date not null,
  period_end date not null,
  total_found int not null default 0,
  imported_count int not null default 0,
  duplicated_count int not null default 0,
  ignored_count int not null default 0,
  status text not null default 'completed' check (status in ('processing', 'completed', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_entries_external_id on public.financial_entries(external_id);
create index if not exists idx_integration_settings_user_provider on public.integration_settings(user_id, provider);
create index if not exists idx_integration_sync_history_user_created on public.integration_sync_history(user_id, created_at desc);

alter table public.integration_settings enable row level security;
alter table public.integration_sync_history enable row level security;

drop policy if exists "Users can view own integration settings" on public.integration_settings;
drop policy if exists "Users can insert own integration settings" on public.integration_settings;
drop policy if exists "Users can update own integration settings" on public.integration_settings;
drop policy if exists "Users can delete own integration settings" on public.integration_settings;
drop policy if exists "Users can view own integration sync history" on public.integration_sync_history;
drop policy if exists "Users can insert own integration sync history" on public.integration_sync_history;
drop policy if exists "Users can update own integration sync history" on public.integration_sync_history;
drop policy if exists "Users can delete own integration sync history" on public.integration_sync_history;

create policy "Users can view own integration settings"
  on public.integration_settings for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own integration settings"
  on public.integration_settings for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own integration settings"
  on public.integration_settings for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own integration settings"
  on public.integration_settings for delete
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can view own integration sync history"
  on public.integration_sync_history for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own integration sync history"
  on public.integration_sync_history for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own integration sync history"
  on public.integration_sync_history for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own integration sync history"
  on public.integration_sync_history for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.integration_settings to authenticated;
grant select, insert, update, delete on public.integration_sync_history to authenticated;
grant all on public.integration_settings to service_role;
grant all on public.integration_sync_history to service_role;
