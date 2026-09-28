-- Simplify financial entries to only planned vs paid.

update public.financial_entries
set status = 'planned'
where status in ('pending', 'canceled');

alter table public.financial_entries
  drop constraint if exists financial_entries_status_check;

alter table public.financial_entries
  add constraint financial_entries_status_check
  check (status in ('planned', 'paid'));
