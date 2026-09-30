-- AI analysis history and optional user toggle.

alter table public.integration_settings
  drop constraint if exists integration_settings_provider_check;

alter table public.integration_settings
  add constraint integration_settings_provider_check
  check (provider in ('asaas', 'ai'));

create table if not exists public.ai_analysis (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  analysis_type text not null check (analysis_type in ('monthly', 'annual', 'savings', 'planning')),
  period_start date not null,
  period_end date not null,
  input_summary jsonb not null,
  ai_response text not null,
  model_used text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_analysis_user_created on public.ai_analysis(user_id, created_at desc);
create index if not exists idx_ai_analysis_lookup on public.ai_analysis(user_id, analysis_type, period_start, period_end, created_at desc);

alter table public.ai_analysis enable row level security;

drop policy if exists "Users can view own ai analysis" on public.ai_analysis;
drop policy if exists "Users can insert own ai analysis" on public.ai_analysis;
drop policy if exists "Users can update own ai analysis" on public.ai_analysis;
drop policy if exists "Users can delete own ai analysis" on public.ai_analysis;

create policy "Users can view own ai analysis"
  on public.ai_analysis for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can insert own ai analysis"
  on public.ai_analysis for insert
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update own ai analysis"
  on public.ai_analysis for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Users can delete own ai analysis"
  on public.ai_analysis for delete
  using (auth.uid() = user_id or public.is_admin());

grant select, insert, update, delete on public.ai_analysis to authenticated;
grant all on public.ai_analysis to service_role;
