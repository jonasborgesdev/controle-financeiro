# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jonas e Isadora usam o sistema para controlar finanças pessoais e empresariais em rotina mensal, principalmente pelo celular. Jonas é admin e precisa enxergar tudo; Isadora usa dados próprios e contas relacionadas a ela.

## Product Purpose

Sistema de controle financeiro mensal para registrar entradas, saídas, contas, categorias, recorrências e balanço mês a mês. O sucesso é substituir o controle atual do Notion com uma experiência mais rápida, visual e confiável.

## Positioning

O produto combina registro manual simples com previsão mensal: transações realizadas mostram o que já aconteceu, recorrências pendentes mostram o que ainda vai impactar o mês.

## Operating Context

O controle é feito por mês, com contas como Santander Conjunta, Nubank PJ Jonas e Nubank PJ Isadora. O usuário precisa conferir saldo, entradas, saídas, despesas recorrentes, receitas recorrentes, pendências do mês e histórico recente sem navegar demais.

## Capabilities and Constraints

Stack: Vite, TanStack Start/Router, Tailwind CSS v4, shadcn/ui/Base UI e Supabase. Credenciais não podem ser versionadas. RLS deve impedir vazamento entre usuários. Transferências ainda não têm fluxo completo de conta origem/destino.

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
