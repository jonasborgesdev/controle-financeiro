-- Allow PDF bank statements after the initial Semana 5 migration.
-- This is separate because 202609290001 may already have been applied remotely.

alter table public.import_history
  drop constraint if exists import_history_file_type_check;

alter table public.import_history
  add constraint import_history_file_type_check
  check (file_type in ('csv', 'ofx', 'pdf'));
