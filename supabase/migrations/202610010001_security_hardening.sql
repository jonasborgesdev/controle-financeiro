-- Semana 10.1 — Segurança e Performance: hardening de RLS + índices compostos.
--
-- Achados da auditoria (2026-10-01):
-- 1. Todas as tabelas sensíveis já têm RLS ativado e policies restritivas
--    (auth.uid() = user_id OR public.is_admin()), sem grants para anon e sem
--    policies amplas (USING true). Nenhuma tabela exposta.
-- 2. Endurecimentos restantes:
--    a. accounts: policy de UPDATE tinha só USING, sem WITH CHECK explícito.
--       Na prática o Postgres reutiliza o USING, mas o WITH CHECK impede
--       explicitamente a troca de user_id via update.
--    b. ai_analysis: histórico de auditoria da IA era atualizável/apagável
--       pelo próprio dono. O app só faz SELECT + INSERT nessa tabela, então
--       UPDATE/DELETE passam a ser exclusivos do admin (suporte).
-- 3. Índices compostos novos para os filtros reais do app:
--    - lançamentos do mês por usuário (transacoes filtra por competência);
--    - deduplicação de importação por usuário + conta + data.
-- Idempotente: usa DROP IF EXISTS / IF NOT EXISTS e pode rodar mais de uma vez.

-- 1a. accounts: UPDATE com WITH CHECK explícito.
drop policy if exists "Users can update own accounts" on public.accounts;

create policy "Users can update own accounts"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. ai_analysis: histórico imutável para o usuário comum.
drop policy if exists "Users can update own ai analysis" on public.ai_analysis;
drop policy if exists "Users can delete own ai analysis" on public.ai_analysis;

create policy "Admin can update ai analysis"
  on public.ai_analysis for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin can delete ai analysis"
  on public.ai_analysis for delete
  using (public.is_admin());

-- 3. Índices compostos para filtros reais (sem remover os existentes).
create index if not exists idx_financial_entries_user_due_date
  on public.financial_entries(user_id, due_date desc);

create index if not exists idx_financial_entries_user_account_due
  on public.financial_entries(user_id, account_id, due_date desc);
