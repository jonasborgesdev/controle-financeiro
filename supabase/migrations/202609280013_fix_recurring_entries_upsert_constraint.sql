-- PostgREST upsert needs a matching unique constraint/index for onConflict.
-- The previous partial unique index blocked duplicate recurring entries, but it
-- could not be targeted by onConflict: recurring_rule_id,monthly_balance_id.

drop index if exists public.financial_entries_recurring_month_key;

create unique index if not exists financial_entries_recurring_month_key
  on public.financial_entries (recurring_rule_id, monthly_balance_id);
