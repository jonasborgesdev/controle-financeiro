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

## Cobertura da Semana 5

- `src/test/unit/lib/importer.test.ts`: cobre CSV, OFX, PDF Nubank, PDF tabular genérico, PDF com texto quebrado em caracteres e detecção de duplicatas.
- `src/test/unit/lib/pdf.test.ts`: cobre reconstrução de texto tabular do PDF por posição dos itens antes do parser financeiro.
- `src/test/integration/monthly-finance-flow.test.ts`: cobre importação PDF no modelo mensal com `monthly_balances`, `financial_entries` e `import_history`.
- `e2e/importacao-authenticated.spec.ts`: cobre o fluxo real pela UI com upload, revisão, importação, histórico e gravação no banco.

## Cobertura — Lista compacta de lançamentos

- `src/test/unit/lib/finance.test.ts`: cobre ordenação por data efetiva, agrupamento por data, cabeçalhos compactos (`Hoje`, `Ontem`, `30 set`) e montagem do payload de alternância `planned`/`paid` com preenchimento de `actual_amount` e `paid_date`.
- `e2e/transacoes-authenticated.spec.ts`: cobre alternância de status pelo checkbox, abertura da edição pelo menu `...` e exclusão pelo menu com confirmação.
- `e2e/transacoes-visual.spec.ts`: cobre mobile 390px e desktop 1366px com múltiplos lançamentos em 2 datas, menu aberto, densidade das linhas e ausência de overflow.
- `e2e/monthly-finance-authenticated.spec.ts`: atualizado para a nova linha compacta (seletor por `entry-list-item` em vez de card) e data dinâmica do mês atual.
- `e2e/helpers.ts`: helper `seedCompactEntryList` cria competência, conta, classificações e 3 lançamentos (previsto + realizado no dia + realizado em outra data), reaproveitado pelos specs funcional e visual.

## Regra de seguranca

Por padrao, testes unitarios e de tela nao acessam o Supabase real. Quando criarmos testes de integracao com banco, eles devem usar usuarios descartaveis com prefixo `it-` ou `e2e-` e nunca apagar dados reais do Jonas/Isadora.

## Fluxo TDD

1. Escrever o teste do comportamento esperado.
2. Rodar `npm run test` e confirmar falha correta.
3. Implementar a menor mudanca que faz o teste passar.
4. Rodar `npm run test`, `npm run typecheck`, `npm run lint` e, quando envolver fluxo de tela, `npm run test:e2e`.
