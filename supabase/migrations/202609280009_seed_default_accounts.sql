-- Seed default accounts for existing internal users.
-- Jonas (admin) receives all default accounts. Isadora receives the shared personal account and her PJ account.

create unique index if not exists accounts_user_name_key
  on public.accounts (user_id, lower(name));

insert into public.accounts (user_id, name, type, bank, description, color, icon)
select profile.id, account.name, account.type, account.bank, account.description, account.color, account.icon
from public.profiles profile
cross join (values
  ('Santander Conjunta', 'personal', 'Santander', 'Conta pessoal conjunta', '#ef4444', 'landmark'),
  ('Nubank PJ Jonas', 'business', 'Nubank', 'Conta PJ Jonas', '#8b5cf6', 'briefcase-business'),
  ('Nubank PJ Isadora', 'business', 'Nubank', 'Conta PJ Isadora', '#a855f7', 'briefcase')
) as account(name, type, bank, description, color, icon)
where profile.role = 'admin'::public.profile_role
on conflict do nothing;

insert into public.accounts (user_id, name, type, bank, description, color, icon)
select profile.id, account.name, account.type, account.bank, account.description, account.color, account.icon
from public.profiles profile
cross join (values
  ('Santander Conjunta', 'personal', 'Santander', 'Conta pessoal conjunta', '#ef4444', 'landmark'),
  ('Nubank PJ Isadora', 'business', 'Nubank', 'Conta PJ Isadora', '#a855f7', 'briefcase')
) as account(name, type, bank, description, color, icon)
where profile.role = 'user'::public.profile_role
  and (
    profile.full_name ilike '%isadora%'
    or profile.email ilike '%isadora%'
  )
on conflict do nothing;
