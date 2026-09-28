-- categories table
create table public.categories (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  icon text,
  color text,
  type text not null default 'expense' check (type in ('income', 'expense', 'transfer')),
  parent_id uuid references public.categories(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS for categories
alter table public.categories enable row level security;

create policy "Authenticated users can view categories"
  on public.categories for select
  using (auth.role() = 'authenticated');

create policy "Admin can manage categories"
  on public.categories for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
