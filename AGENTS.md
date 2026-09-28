# Controle Financeiro — Regras do Projeto

## Stack
- Vite + TanStack Start + TanStack Router.
- Tailwind CSS v4 + shadcn/ui.
- Supabase para banco, auth e storage.
- Vercel para deploy.

## Estrutura
- Rotas ficam em `src/routes/`.
- `src/routeTree.gen.ts` é gerado automaticamente pelo TanStack Router; não editar manualmente.
- Configuração do router em `src/router.tsx`.
- Configuração do Start em `src/start.ts`.
- Migrations ficam em `supabase/migrations/`.

## Variáveis de Ambiente
- Variáveis públicas do frontend devem usar prefixo `VITE_`.
- Não commitar `.env.local`.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
