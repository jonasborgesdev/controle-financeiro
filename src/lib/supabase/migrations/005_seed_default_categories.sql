-- Default categories
insert into public.categories (name, icon, color, type, is_default) values
  -- Expense categories
  ('Alimentação', 'utensils', '#ef4444', 'expense', true),
  ('Transporte', 'car', '#f97316', 'expense', true),
  ('Moradia', 'home', '#eab308', 'expense', true),
  ('Assinaturas', 'repeat', '#84cc16', 'expense', true),
  ('Educação', 'book-open', '#22c55e', 'expense', true),
  ('Saude', 'heart', '#14b8a6', 'expense', true),
  ('Lazer', 'gamepad-2', '#06b6d4', 'expense', true),
  ('Vestuário', 'shirt', '#3b82f6', 'expense', true),
  ('Financiamentos', 'credit-card', '#8b5cf6', 'expense', true),
  ('Impostos', 'file-text', '#a855f7', 'expense', true),
  ('Salários', 'users', '#ec4899', 'expense', true),
  ('Transferências', 'arrow-left-right', '#64748b', 'expense', true),
  ('Outros', 'more-horizontal', '#78716c', 'expense', true),
  -- Income categories
  ('Salário', 'briefcase', '#22c55e', 'income', true),
  ('Freelance', 'laptop', '#10b981', 'income', true),
  ('Investimentos', 'trending-up', '#059669', 'income', true),
  ('Outras Receitas', 'plus-circle', '#34d399', 'income', true);
