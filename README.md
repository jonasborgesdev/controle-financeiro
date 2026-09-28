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

Abra `http://localhost:3000` no navegador.

## Variáveis de Ambiente

Use `.env.example` como base:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

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
