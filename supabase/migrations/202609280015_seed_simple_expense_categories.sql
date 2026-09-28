-- Seed broad expense classifications for the simplified category flow.

insert into public.categories (name, icon, color, type, parent_id, is_default, is_active)
values
  ('Gastos fixos', null, null, 'expense', null, true, true),
  ('Gastos variáveis', null, null, 'expense', null, true, true)
on conflict do nothing;
