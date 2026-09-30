# Controle Financeiro

Sistema web mobile-first de controle financeiro pessoal/empresarial.

## Status Atual

- Semana 7 finalizada: Dashboard Anual e Relatórios.
- PR da Semana 7: `#11` — `feat: implementar relatorios financeiros`.
- Próxima etapa planejada: Semana 7.1 — Financiamentos e Exportação Melhorada.
- Etapa seguinte: Semana 8 — Integração com IA.

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
- Comparativo com ano anterior e módulo de financiamentos ficaram planejados para a Semana 7.1.

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
