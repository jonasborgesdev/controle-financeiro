# Report Notion — Semana 9: Projeções e Polish

## Resumo

A Semana 9 foi concluída com a implementação da área `/projecoes` e com um polish visual final nas rotas principais do Controle Financeiro.

A decisão central da entrega foi manter a projeção financeira como cálculo determinístico do sistema, sem usar IA como fonte da verdade. A IA pode apoiar comunicação e análise em áreas específicas, mas valores projetados, status de risco e premissas financeiras são calculados pelo app.

## O Que Foi Implementado

- Rota `/projecoes` para projeção financeira de 3 e 6 meses.
- Agregador determinístico `buildFinancialProjection` em `src/lib/projections.ts`.
- Cards principais de projeção, gráfico CSS, alertas e lista/tabela mês a mês.
- Premissas visíveis para o usuário entender de onde vem a projeção.
- Integração da rota na sidebar desktop e no menu `Mais` mobile.
- CTA discreto no Dashboard para acessar projeções.
- Link de apoio no Planejamento para consultar impacto futuro.
- Testes unitários para a lógica de projeção.

## Regras da Projeção

- A projeção considera lançamentos previstos e realizados.
- Recorrências ativas entram quando ainda não existe lançamento gerado para o mês.
- Orçamentos entram como complemento quando o orçamento por classificação é maior que os lançamentos planejados existentes.
- Meta mensal de economia entra como referência de saúde financeira.
- Financiamentos impactam a projeção por lançamentos já gerados ou por parcela estimada do contrato ativo.
- Média variável usa janela dos últimos 3 meses.
- Para evitar otimismo artificial, despesas projetadas usam o maior valor entre cenário planejado e tendência histórica.
- Status da projeção é calculado pelo sistema como saudável, atenção ou crítico.

## Polish Visual

- Criação do `MonthPicker` customizado para seleção de mês.
- Criação do `DatePicker` customizado para seleção de data.
- Substituição dos campos nativos de mês/data nas rotas críticas.
- Painéis dos seletores renderizam via portal no `document.body` para evitar clipping.
- Painéis com camada alta (`z-index`) e proteção contra estouro da viewport.
- Padronização das primeiras seções com `PageHero`.
- Ajuste visual do Dashboard para seleção de mês/conta e leitura de saldo.
- Ajuste em Relatórios para evitar truncamento indevido em listas.
- Remoção do aviso permanente de integrações da sidebar.
- Redesenho do botão de sair como ação `Encerrar sessão`, com ícone e tom rose discreto.
- Sidebar desktop fixa no viewport para manter a navegação acessível durante o scroll em páginas longas.

## Decisões Tomadas

- Projeções não usam IA como fonte da verdade financeira.
- Não foi criada migration nova para projeções persistidas.
- A projeção deve refletir os dados atuais recalculados a cada leitura.
- Gráficos continuam em HTML/CSS, sem adicionar biblioteca pesada.
- Campos nativos de `date` e `month` foram substituídos por componentes próprios para garantir consistência visual em desktop, mobile e modais.
- A sidebar desktop deve ficar sempre visível durante o scroll; no mobile, mantém-se header sticky e bottom navigation fixa.
- Avisos permanentes devem sair da sidebar e ficar nas telas específicas quando necessário.

## Validações Executadas

- `npm run typecheck` aprovado.
- `npm run lint` aprovado com warnings conhecidos.
- `npm run build` aprovado com warnings conhecidos de dependências.
- `npm run test:e2e` aprovado com 12 testes.
- `npx playwright test e2e/month-picker-visual.spec.ts --headed` aprovado com 4 testes.
- Detector visual Impeccable executado sem achados.
- Chrome MCP executado para validação visual manual/automatizada dos seletores.

## Validação Via Chrome MCP

Cenários validados:

- Dashboard desktop com `MonthPicker`.
- Modal de Lançamentos com `DatePicker`.
- Modal de Recorrências com `MonthPicker`.
- Dashboard mobile com `MonthPicker`.

Critérios confirmados:

- Overlay visível.
- Sem clipping na viewport.
- Overlay no topo da pilha visual.
- `z-index` adequado para aparecer acima de cards e modais.

## Warnings Conhecidos

- `npm run lint` mantém warnings conhecidos de hooks/Fast Refresh em arquivos já existentes.
- `npm run build` mantém warnings conhecidos de diretivas `use client` em dependências TanStack/Base UI/Lucide.
- O aviso do MCP sobre `--localstorage-file` sem path válido apareceu durante execução, sem bloquear a validação.

## Resultado Final

A Semana 9 foi concluída com projeções funcionais e com o app visualmente mais consistente para uso diário. O sistema agora permite entender o futuro financeiro de 3 a 6 meses, mantém navegação sempre acessível no desktop e evita inconsistências dos seletores nativos de data/mês em telas críticas.

## Próxima Etapa

Semana 10 — Testes e Deploy Final.

Foco recomendado:

- Testar fluxo completo com dados reais.
- Validar RLS e isolamento entre usuários.
- Testar iOS Safari e Android Chrome.
- Revisar performance de queries principais.
- Corrigir bugs críticos encontrados no uso real.
- Preparar deploy final e comunicação de sistema pronto.
