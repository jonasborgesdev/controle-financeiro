# Controle Financeiro

Sistema web mobile-first de controle financeiro pessoal/empresarial.

## Status Atual

- Semana 6 finalizada: Integração Asaas.
- Semana 7 finalizada: Dashboard Anual e Relatórios.
- Semana 7.1 finalizada: Financiamentos e Exportação Melhorada.
- PR atual: `#12` — `feat: implementar relatórios e financiamentos`.
- Próxima etapa planejada: Semana 8 — Integração com IA.

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

## Scripts

- `npm run dev`: ambiente local
- `npm run build`: build de produção
- `npm run preview`: preview do build
- `npm run lint`: lint
- `npm run typecheck`: checagem TypeScript

## Banco de Dados

As migrations ficam em:

```text
supabase/migrations/
```

Não commitar `.env.local`.
