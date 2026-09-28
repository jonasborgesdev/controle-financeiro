-- Convert profiles.role from text + check constraint to a PostgreSQL enum.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_role') then
    create type public.profile_role as enum ('admin', 'user');
  end if;
end $$;

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
