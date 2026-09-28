# Padrao de Testes — Controle Financeiro

Este projeto segue o mesmo formato usado nos projetos Webnauta/Lovable, como a B2UP Consultoria.

## Scripts

- `npm run test`: roda testes unitarios, funcionais e de tela com Vitest.
- `npm run test:watch`: roda Vitest em modo continuo.
- `npm run test:coverage`: gera cobertura com V8.
- `npm run test:e2e`: roda E2E com Playwright.
- `npm run test:e2e:ui`: abre a UI do Playwright.

## Estrutura

```text
src/test/
  setup.ts
  unit/        # regras puras, calculos, helpers
  integration/ # fluxos com Supabase quando houver ambiente de teste seguro
  screen/      # testes de tela/componentes com Testing Library
e2e/           # testes E2E com Playwright
```

## Regra de seguranca

Por padrao, testes unitarios e de tela nao acessam o Supabase real. Quando criarmos testes de integracao com banco, eles devem usar usuarios descartaveis com prefixo `it-` ou `e2e-` e nunca apagar dados reais do Jonas/Isadora.

## Fluxo TDD

1. Escrever o teste do comportamento esperado.
2. Rodar `npm run test` e confirmar falha correta.
3. Implementar a menor mudanca que faz o teste passar.
4. Rodar `npm run test`, `npm run typecheck`, `npm run lint` e, quando envolver fluxo de tela, `npm run test:e2e`.
