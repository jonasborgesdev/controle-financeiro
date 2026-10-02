-- Semana 10.2 — Transferências entre contas (par linkado).
--
-- Modelo: transferência = 2 lançamentos pareados em financial_entries
-- (saída na origem + entrada no destino) ligados por transfer_group_id,
-- com source = 'transfer'. Sem tabela nova, sem refatorar o modelo mensal.
-- Totais reais de receita/despesa excluem source = 'transfer' no app.

-- 1. Coluna do par linkado (NULL = não é transferência).
alter table public.financial_entries
  add column if not exists transfer_group_id uuid;

-- 2. Índice parcial para buscar o par e evitar varredura total.
create index if not exists idx_financial_entries_transfer_group
  on public.financial_entries (transfer_group_id)
  where transfer_group_id is not null;

-- 3. Ampliar o check de source para incluir 'transfer'
-- (lista completa atual: manual, recurring, imported, asaas, financing).
alter table public.financial_entries
  drop constraint if exists financial_entries_source_check;

alter table public.financial_entries
  add constraint financial_entries_source_check
  check (source in ('manual', 'recurring', 'imported', 'asaas', 'financing', 'transfer'));

-- 4. RLS: nenhuma policy nova. A coluna herda user_id do lançamento;
-- ambos os admins (Jonas e Isadora) já enxergam tudo via policies
-- existentes com WITH CHECK (auth.uid() = user_id or public.is_admin()).
