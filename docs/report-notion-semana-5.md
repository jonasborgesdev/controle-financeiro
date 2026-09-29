# Report Notion — Semana 5: Importação de Extratos

## Resumo

A Semana 5 foi concluída com importação de extratos bancários em CSV, OFX e PDF, com revisão obrigatória antes de salvar. O fluxo grava os lançamentos no modelo mensal oficial do app (`monthly_balances` + `financial_entries`) e mantém histórico resumido em `import_history`.

## O Que Foi Implementado

- Tela `/importacao` com seleção de conta, banco opcional e upload de arquivo.
- Suporte a arquivos `.csv`, `.ofx` e `.pdf`.
- Parser CSV com suporte a delimitadores vírgula/ponto e vírgula, datas ISO/BR, decimal BR/US e cabeçalhos comuns.
- Parser OFX básico com leitura de `STMTTRN`, data, valor, descrição e ID externo.
- Parser PDF local no navegador usando `pdfjs-dist`.
- Reconstrução tabular de PDF por posição X/Y dos textos, reduzindo dependência de modelo específico de banco.
- Parser genérico para PDF tabular antes de parsers específicos por banco.
- Fallback para textos extraídos quebrados em caracteres/linhas pequenas.
- Parser específico Nubank como fallback para extratos por seções de entradas/saídas.
- Revisão editável dos lançamentos antes de salvar.
- Categorização automática básica por descrição.
- Detecção de duplicatas por conta, valor, data próxima e descrição similar.
- Histórico de importações em `import_history`.
- Navegação `Importar` no app e ação rápida no dashboard.
- UX refinada com aviso de conferência obrigatória em PDFs.

## Decisões Tomadas

- O banco selecionado virou apenas uma ajuda opcional; a primeira tentativa para PDF é genérica.
- Arquivos bancários não são armazenados permanentemente por privacidade.
- Importações confirmadas entram como `source = 'imported'` e `status = 'paid'` por padrão.
- PDF tabular é convertido/reconstruído internamente antes de passar pelo parser financeiro.
- A importação salva primeiro um histórico em processamento e só depois marca como concluída, evitando perda de rastreabilidade em erro.

## Validação Real

- Importação real de PDF Santander validada pelo Jonas.
- Dados de teste de importação foram limpos após validação.
- Limpeza executada: 154 lançamentos importados e 2 históricos removidos do usuário real, restando 0 registros importados de teste.

## Testes Automatizados

- Unitários do importer: CSV, OFX, PDF Nubank, PDF tabular genérico, PDF com texto quebrado, duplicatas e categorização.
- Unitário de PDF: reconstrução tabular por posição X/Y e leitura pelo parser genérico.
- Integração Supabase: importação no modelo mensal com `monthly_balances`, `financial_entries` e `import_history`.
- E2E Playwright: criação de conta, upload de CSV, revisão, importação, histórico e gravação no banco.

## Resultado Final

Semana 5 concluída. O app agora permite importar extratos bancários reais com revisão antes de salvar, incluindo PDFs tabulares comuns em bancos brasileiros.

## Próximo Passo

Seguir para Semana 6 conforme priorização: integração Asaas ou replanejamento do roadmap caso a prioridade mude.
