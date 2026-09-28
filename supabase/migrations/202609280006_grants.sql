-- Grants required for Supabase PostgREST API access.
-- RLS policies still control which rows each authenticated user can access.

grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

grant select, insert, update, delete on public.accounts to authenticated;
grant all on public.accounts to service_role;

grant select on public.categories to authenticated;
grant all on public.categories to service_role;

grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
