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

## Git e PR
- A branch de desenvolvimento padrão deste projeto é `development`.
- Commits de implementação devem ser feitos na `development`, não em `main`.
- Não criar branch feature separada salvo pedido explícito do Jonas.
- `main` só deve receber mudanças via PR aberto a partir da `development`.
- Antes de commitar, conferir branch atual com `git status --short --branch`.
- Antes de abrir PR, rodar as validações disponíveis: lint, typecheck, testes e build.

## Variáveis de Ambiente
- Variáveis públicas do frontend devem usar prefixo `VITE_`.
- Não commitar `.env.local`.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
