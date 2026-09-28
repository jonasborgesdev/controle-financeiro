-- Harden RLS and allow per-user custom categories without leaking data.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::public.profile_role
  );
$$;

grant execute on function public.is_admin() to authenticated, service_role;

alter table public.categories
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists is_active boolean not null default true;

alter table public.profiles
  alter column role set default 'user'::public.profile_role;

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admin can view all profiles" on public.profiles;
drop policy if exists "Admin can view all accounts" on public.accounts;
drop policy if exists "Admin can manage categories" on public.categories;
drop policy if exists "Admin can view all transactions" on public.transactions;
drop policy if exists "Authenticated users can view categories" on public.categories;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admin can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admin can manage accounts"
  on public.accounts for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users can view available categories"
  on public.categories for select
  using (
    is_active = true
    and (
      is_default = true
      or user_id = auth.uid()
      or public.is_admin()
    )
  );

create policy "Users can insert own categories"
  on public.categories for insert
  with check (
    auth.uid() = user_id
    and is_default = false
  );

create policy "Users can update own categories"
  on public.categories for update
  using (auth.uid() = user_id and is_default = false)
  with check (auth.uid() = user_id and is_default = false);

create policy "Users can delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id and is_default = false);

create policy "Admin can manage default categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin can manage transactions"
  on public.transactions for all
  using (public.is_admin())
  with check (public.is_admin());

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;

do $$
begin
  alter table public.categories drop constraint if exists categories_name_key;
exception
  when undefined_object then null;
end $$;

create unique index if not exists categories_default_name_key
  on public.categories (lower(name))
  where user_id is null;

create unique index if not exists categories_user_name_key
  on public.categories (user_id, lower(name))
  where user_id is not null;

update public.categories
set type = 'transfer'
where name = 'Transferências';

update public.categories
set name = 'Saúde'
where name = 'Saude';

update public.categories
set name = 'Outras Entradas'
where name = 'Outras Receitas';

insert into public.categories (name, icon, color, type, parent_id, is_default)
select item.name, item.icon, item.color, item.type, parent.id, true
from (values
  ('Supermercado', 'shopping-cart', '#ef4444', 'expense', 'Alimentação'),
  ('Restaurante', 'utensils', '#ef4444', 'expense', 'Alimentação'),
  ('iFood', 'smartphone', '#ef4444', 'expense', 'Alimentação'),
  ('Uber', 'smartphone', '#f97316', 'expense', 'Transporte'),
  ('Combustível', 'fuel', '#f97316', 'expense', 'Transporte'),
  ('Estacionamento', 'parking-circle', '#f97316', 'expense', 'Transporte'),
  ('Aluguel', 'home', '#eab308', 'expense', 'Moradia'),
  ('Condomínio', 'building', '#eab308', 'expense', 'Moradia'),
  ('IPTU', 'file-text', '#eab308', 'expense', 'Moradia'),
  ('Luz', 'lightbulb', '#eab308', 'expense', 'Moradia'),
  ('Água', 'droplets', '#eab308', 'expense', 'Moradia'),
  ('Gás', 'flame', '#eab308', 'expense', 'Moradia'),
  ('Netflix', 'tv', '#84cc16', 'expense', 'Assinaturas'),
  ('Spotify', 'music', '#84cc16', 'expense', 'Assinaturas'),
  ('Internet', 'wifi', '#84cc16', 'expense', 'Assinaturas'),
  ('Software', 'monitor', '#84cc16', 'expense', 'Assinaturas'),
  ('Vendas', 'shopping-bag', '#10b981', 'income', null)
) as item(name, icon, color, type, parent_name)
left join public.categories parent on parent.name = item.parent_name and parent.user_id is null
where not exists (
  select 1 from public.categories existing
  where existing.user_id is null and lower(existing.name) = lower(item.name)
);
