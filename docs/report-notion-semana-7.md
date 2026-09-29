# Report Notion — Semana 7: Dashboard Anual e Relatórios

## Objetivo

Criar relatórios mensais e anuais com visão consolidada, comparativo planejado vs realizado, evolução mês a mês, análise por classificação/conta e exportação em PDF/print, mantendo o padrão visual `Private Finance OS`.

## O que foi implementado

- Rota `/relatorios` com alternância entre relatório mensal e anual.
- Filtros por mês, ano, conta e classificação.
- Relatório mensal com cards de entradas, saídas, saldo, planejado vs realizado e economia/meta.
- Relatório mensal com distribuição por classificação, resultado por conta, top 5 maiores saídas, entradas principais e lançamentos pendentes/previstos.
- Insights simples sem IA para estouro de saídas, entradas abaixo do esperado e meta de economia.
- Relatório anual com total de entradas, saídas, saldo anual e economia acumulada.
- Gráfico anual CSS com entradas, saídas e saldo mês a mês.
- Tabela mês a mês com valores realizados e saldo previsto.
- Distribuição anual por classificação e por conta.
- Melhor mês, pior mês, médias mensais e projeção simples quando há meses futuros planejados.
- Exportação via `window.print()` com CSS print-friendly.
- Navegação integrada na sidebar desktop, menu `Mais` mobile e ação rápida do dashboard.

## Decisões técnicas

- Não foi adicionada biblioteca de gráficos nesta etapa.
- Os gráficos foram implementados em HTML/CSS responsivo para manter o app leve.
- Não foi adicionada biblioteca de PDF nesta etapa.
- A exportação usa impressão nativa do navegador com CSS específico para PDF/print.
- Não houve mudança no modelo financeiro ou nas regras de negócio existentes.
- Não houve migration nova.
- O módulo de financiamentos foi adiado para etapa própria, pois exige CRUD e estrutura de dados específica.

## Arquivos principais alterados

- `src/routes/relatorios.tsx`
- `src/lib/reports.ts`
- `src/test/unit/lib/reports.test.ts`
- `src/components/app-shell.tsx`
- `src/routes/index.tsx`
- `src/styles.css`
- `src/routeTree.gen.ts`
- `docs/decision-log.md`
- `docs/planejamento/plano-desenvolvimento.md`
- `README.md`

## Validações executadas

- `npm run typecheck`: aprovado.
- `npm run test`: aprovado com 43 testes.
- `npm run lint`: aprovado sem erros, apenas warnings conhecidos.
- `npm run build`: aprovado, com warnings conhecidos de diretivas `use client` em dependências.
- `npm run test:e2e`: aprovado com 7 testes.

## Limitações conhecidas

- PDF usa impressão nativa do navegador, não geração programática com layout paginado avançado.
- No mobile, a exportação depende do fluxo nativo de compartilhamento/impressão do navegador/sistema.
- Comparativo com ano anterior ficou adiado até existir histórico anual suficiente.
- Financiamentos permanecem pendentes para implementação dedicada.

## Status

Semana 7 concluída e pronta para seguir para a Semana 8: Integração com IA.
