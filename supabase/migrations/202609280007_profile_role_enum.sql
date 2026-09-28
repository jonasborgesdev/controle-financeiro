-- Convert profiles.role from text + check constraint to a PostgreSQL enum.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_role') then
    create type public.profile_role as enum ('admin', 'user');
  end if;
end $$;

-- Policies that reference profiles.role must be dropped before altering the column type.
drop policy if exists "Admin can view all profiles" on public.profiles;
drop policy if exists "Admin can view all accounts" on public.accounts;
drop policy if exists "Admin can manage categories" on public.categories;
drop policy if exists "Admin can view all transactions" on public.transactions;

alter table public.profiles
  alter column role drop default;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  alter column role type public.profile_role
  using role::public.profile_role;

alter table public.profiles
  alter column role set default 'user'::public.profile_role;

grant usage on type public.profile_role to anon, authenticated, service_role;

create policy "Admin can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'::public.profile_role
    )
  );

create policy "Admin can view all accounts"
  on public.accounts for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'::public.profile_role
    )
  );

create policy "Admin can manage categories"
  on public.categories for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'::public.profile_role
    )
  );

create policy "Admin can view all transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'::public.profile_role
    )
  );
