-- Seed broad income classifications for the simplified category flow.

insert into public.categories (name, icon, color, type, parent_id, is_default, is_active)
values
  ('Ganhos fixos', null, null, 'income', null, true, true),
  ('Ganhos variáveis', null, null, 'income', null, true, true)
on conflict do nothing;
