# Controle Financeiro

Sistema web mobile-first de controle financeiro pessoal/empresarial.

## Status Atual

- Semana 6 finalizada: Integração Asaas.
- Semana 7 finalizada: Dashboard Anual e Relatórios.
- Semana 7.1 finalizada: Financiamentos e Exportação Melhorada.
- Semana 8 finalizada: Integração com IA.
- Semana 9 finalizada: Projeções e Polish.
- Semana 10.1 finalizada: Segurança e Performance (hardening RLS, server-only Asaas/IA, limites upload, queries com range, headers em `vercel.json`).
- Lista compacta de lançamentos finalizada: `/transacoes` em formato extrato agrupado por data.
- Semana 10 — Testes e Deploy Final: validações verdes (typecheck, 74 testes, 15 E2E, lint 0 erros, build OK), PR `development` → `main` aberto para deploy final.

## Stack

- Vite
- TanStack Start
- TanStack Router
- React
- Tailwind CSS v4
- shadcn/ui
- Supabase

## Getting Started

Instale as dependências e rode o servidor local:

```bash
npm install
npm run dev
```

Abra a URL informada pelo Vite no terminal. Normalmente:

```text
http://localhost:5173
```

Deploy atual:

```text
https://controle-financeiro-eta-flame.vercel.app/
```

## Acesso

- Sistema interno para Jonas e Isadora.
- Usuários são pré-criados no Supabase.
- Não há criação pública de conta.
- Não há recuperação pública de senha; alterações são feitas direto no Supabase.

## Variáveis de Ambiente

Use `.env.example` como base:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Asaas opcional. Server-only: nunca usar prefixo VITE_.
ASAAS_API_KEY=
ASAAS_ENVIRONMENT=sandbox
```

Para produção do Asaas, use `ASAAS_ENVIRONMENT=production` e configure a chave de produção no servidor/Vercel.

## Integração Asaas

- A integração é opcional e configurada em `/configuracoes`.
- A sincronização manual fica em `/asaas`.
- A API key fica apenas no servidor em `ASAAS_API_KEY`.
- Pagamentos `RECEIVED` e `CONFIRMED` são importados como entradas realizadas após revisão.
- O valor usado no lançamento é o líquido (`netValue`); o valor bruto fica nas observações.
- Webhook/cron não foram implementados nesta etapa.

## Relatórios

- A rota principal fica em `/relatorios`.
- A tela alterna entre visão mensal e anual.
- Relatório mensal mostra entradas, saídas, saldo, planejado vs realizado, economia/meta, distribuição por classificação/conta, maiores saídas, entradas principais e lançamentos pendentes.
- Relatório anual mostra acumulados, evolução mês a mês, tabela mensal, distribuição anual, melhor/pior mês, médias e projeção simples quando há meses futuros planejados.
- Exportação atual usa `window.print()` com CSS print-friendly, sem dependência extra de PDF.
- Comparativo com ano anterior aparece quando há dados do ano anterior.
- Parcelas de financiamentos aparecem em seção própria no relatório mensal quando geradas.

## Financiamentos

- A rota principal fica em `/financiamentos`.
- Financiamentos têm cadastro próprio de contrato, valor original, valor da parcela, total de parcelas, parcelas pagas, dia de vencimento e status.
- Cada parcela gerada vira lançamento em `financial_entries` com `source = 'financing'`.
- A descrição da parcela inclui o número atual e total, exemplo: `Parcela 4/24 financiamento: Carro`.
- Pagamentos permitem ajustar data realizada e valor pago.
- Pagamento antecipado entra no mês da data de pagamento em `Ganhos/Gastos`, mantendo a competência original da parcela em `installment_year` e `installment_month`.
- A migration da etapa é `supabase/migrations/202609290004_create_financings.sql`.

## IA Financeira

- A rota principal fica em `/ia`.
- A IA usa server functions e nunca recebe chaves no frontend.
- O sistema calcula o diagnóstico financeiro antes da IA; a IA apenas comunica e organiza sugestões.
- Dados sensíveis são sanitizados/anonimizados antes de qualquer chamada ao provider.
- Providers suportados: Gemini como padrão e Groq como alternativa/fallback quando configurado.

## Projeções

- A rota principal fica em `/projecoes`.
- A projeção é determinística e calculada em `src/lib/projections.ts`.
- Considera lançamentos previstos/realizados, recorrências, orçamentos, meta de economia, financiamentos e média variável dos últimos 3 meses.
- Não usa IA como fonte da verdade financeira e não cria tabela nova de projeções persistidas.
- Dashboard e Planejamento possuem CTAs discretos para a tela de projeções.

## Polish Visual Semana 9

- `MonthPicker` e `DatePicker` próprios substituem campos nativos de mês/data nas rotas críticas.
- Os painéis dos seletores renderizam via portal para evitar clipping em cards e modais.
- A sidebar desktop é fixa no viewport para manter a navegação disponível em páginas longas.
- No mobile, a navegação permanece via header sticky e bottom navigation fixa.
- O botão de sair da sidebar foi redesenhado como `Encerrar sessão`, com ícone e tom rose discreto.

## Lançamentos (Ganhos/Gastos)

- A rota principal fica em `/transacoes`.
- A listagem usa formato extrato compacto agrupado por data efetiva (`Hoje`, `Ontem`, `30 set`…), em vez de cards grandes.
- Checkbox por linha alterna `Previsto`/`Realizado`; marcar como realizado preenche `actual_amount` e `paid_date` quando vazios; voltar para previsto preserva esses campos internamente.
- Tocar na linha abre a edição; o menu `...` concentra as ações secundárias `Editar` e `Excluir`, com apenas um aberto por vez.
- Ganhos usam acento emerald e gastos usam acento rose; o status aparece em badge discreta.
- Filtros por mês, resumos e modal de criação/edição foram preservados.

## Scripts

- `npm run dev`: ambiente local
- `npm run build`: build de produção
- `npm run preview`: preview do build
- `npm run lint`: lint
- `npm run typecheck`: checagem TypeScript
- `npm run test`: unitários, integração e tela (Vitest)
- `npm run test:e2e`: ponta a ponta autenticado (Playwright)

## Banco de Dados

As migrations ficam em:

```text
supabase/migrations/
```

Não commitar `.env.local`.
