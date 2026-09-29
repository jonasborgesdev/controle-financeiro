-- Semana 5: bank statement import history.

create table if not exists public.import_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete set null,
  filename text not null,
  file_type text not null check (file_type in ('csv', 'ofx', 'pdf')),
  bank text not null default 'automatic',
  total_transactions int not null default 0 check (total_transactions >= 0),
  imported_transactions int not null default 0 check (imported_transactions >= 0),
  duplicated_transactions int not null default 0 check (duplicated_transactions >= 0),
  ignored_transactions int not null default 0 check (ignored_transactions >= 0),
  status text not null default 'completed' check (status in ('processing', 'completed', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_history_user_created on public.import_history(user_id, created_at desc);
create index if not exists idx_import_history_account on public.import_history(account_id);

alter table public.import_history enable row level security;

drop policy if exists "Users can view own import history" on public.import_history;
drop policy if exists "Users can insert own import history" on public.import_history;
drop policy if exists "Users can update own import history" on public.import_history;
drop policy if exists "Users can delete own import history" on public.import_history;

create policy "Users can view own import history"
  on public.import_history for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own import history"
  on public.import_history for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own import history"
  on public.import_history for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own import history"
  on public.import_history for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.import_history to authenticated;
grant all on public.import_history to service_role;
