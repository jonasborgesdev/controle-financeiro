# Design System — Private Finance OS

<!-- impeccable:design-schema 1 -->

## Conceito

O app usa a direção `Private Finance OS`: dark-first, premium, mobile-first e com glassmorphism controlado. A interface deve parecer um app financeiro instalado no celular e, no desktop, um painel profissional de análise mensal.

## Paleta

- Base: `#070A0F`, `#0D111A`, `#111827`.
- Texto principal: `#F8FAFC`; texto secundário: `#94A3B8`.
- Dinheiro/entrada/crescimento: emerald `#10B981`.
- Planejamento/tecnologia: cyan/teal `#22D3EE`.
- Metas/reserva/premium: champagne/gold `#F5C76B`.
- Saídas/risco/erro: rose `#FB7185`.
- Roxo não é identidade principal.

## Materiais

- `finance-glass`: navegação, header, hero e superfícies flutuantes.
- `finance-panel`: cards analíticos com fundo escuro, borda sutil e sombra profunda.
- Vidro deve sempre manter contraste suficiente; listas densas usam fundo escuro sólido/translúcido leve.

## Layout

- Mobile: header contextual compacto, bottom navigation fixa, botão central de adicionar e safe areas iOS.
- Mobile: o item `Mais` abre bottom sheet com todas as rotas secundárias para manter a navegação principal limpa.
- Desktop: sidebar fixa glass, conteúdo central máximo, grids analíticos e densidade maior sem parecer mobile esticado.

## Componentes

- Inputs e selects têm altura mínima de 44px, foco cyan visível e fundo escuro.
- Selects nativos usam `finance-select` com aparência normalizada para Safari/iOS; se ainda houver inconsistência em aparelho real, evoluir para um componente `Select` próprio.
- Botão primário emerald; ações de planejamento usam cyan; alertas/metas usam gold; destrutivo usa rose.
- Cards financeiros importantes exibem valores com peso alto, tracking negativo leve e metadados discretos.
- Listas mobile devem separar título, valor, metadados, status e ações em blocos tocáveis, evitando cards densos demais.

## Estados

- Loading usa skeletons/pulso no formato do bloco.
- Empty states orientam a próxima ação com texto humano.
- Error states mostram o problema em rose e devem ser recuperáveis.
- Success feedback deve ser discreto; quando houver toast futuro, manter tom curto e humano.
