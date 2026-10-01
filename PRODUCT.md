# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jonas e Isadora usam o sistema para controlar finanças pessoais e empresariais em rotina mensal, principalmente pelo celular. Jonas é admin e precisa enxergar tudo; Isadora usa dados próprios e contas relacionadas a ela.

## Product Purpose

Sistema de controle financeiro mensal e anual para registrar entradas, saídas, contas, categorias, recorrências, financiamentos, balanços e relatórios. O sucesso é substituir o controle atual do Notion com uma experiência mais rápida, visual e confiável.

## Positioning

O produto combina registro manual simples com previsão mensal, financiamentos controlados por contrato e relatórios consolidados: lançamentos realizados mostram o que já aconteceu, recorrências/parcelas pendentes mostram o que ainda vai impactar o mês e relatórios mostram a evolução mensal/anual sem abrir planilha.

## Operating Context

O controle é feito por mês, com contas como Santander Conjunta, Nubank PJ Jonas e Nubank PJ Isadora. O usuário precisa conferir saldo, entradas, saídas, despesas recorrentes, receitas recorrentes, financiamentos, pendências do mês, relatórios mensais/anuais e histórico recente sem navegar demais.

## Capabilities and Constraints

Stack: Vite, TanStack Start/Router, Tailwind CSS v4, shadcn/ui/Base UI e Supabase. Credenciais não podem ser versionadas. RLS deve impedir vazamento entre usuários. Transferências ainda não têm fluxo completo de conta origem/destino. Relatórios usam agregações no app e gráficos HTML/CSS, sem dependência extra de gráficos/PDF nesta etapa. Financiamentos têm tabela própria de contratos e impactam o financeiro por lançamentos mensais em `financial_entries`.

## Brand Commitments

Direção visual escolhida pelo usuário para esta fase: fintech moderna, mobile-first, com sensação mais premium do que CRUD básico.

## Evidence on Hand

Documentação principal em `docs/planejamento/`. O controle atual existe no Notion, mas seus dados visuais/tabelas não estão importados no repositório.

## Product Principles

1. O mês atual deve ser entendido em segundos.
2. Realizado e previsto devem aparecer juntos, mas sem misturar status.
3. Cadastro rápido deve acontecer em popups para não quebrar o fluxo de leitura.
4. Saldos devem ser calculados a partir de dados auditáveis, não gravados manualmente como estado derivado.
5. Mobile é o principal ambiente de uso.
6. Relatórios devem consolidar dados sem criar uma segunda fonte de verdade.
7. Financiamentos têm módulo próprio, mas impactam o financeiro via lançamentos mensais auditáveis.

## Roadmap Status

- Semana 6: concluída com integração Asaas opcional.
- Semana 7: concluída com dashboard anual, relatórios e exportação via impressão/PDF.
- Semana 7.1: concluída com módulo real de financiamentos, pagamento antecipado por data efetiva e melhorias finais de exportação.
- Semana 8: concluída com integração com IA.
- Semana 9: concluída com projeções e polish visual.
- Lista compacta de lançamentos: concluída com `/transacoes` em formato extrato agrupado por data.
- Próxima etapa: Semana 10 — Testes e Deploy Final.
