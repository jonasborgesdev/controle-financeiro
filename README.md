# Controle Financeiro

Sistema web mobile-first de controle financeiro pessoal/empresarial.

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
