import type { Category, FinancialEntry } from "@/types/database";

export type ImportBank = "automatic" | "nubank" | "santander";
export type ImportFileType = "csv" | "ofx" | "pdf";

export type ParsedTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  externalId: string | null;
};

export type ReviewTransaction = ParsedTransaction & {
  selected: boolean;
  accountId: string;
  categoryId: string;
  status: "planned" | "paid";
  duplicate: boolean;
  duplicateReason: string | null;
};

export function parseStatement(content: string, fileType: ImportFileType, bank: ImportBank) {
  if (fileType === "pdf") return parsePdfStatement(content, bank);
  return fileType === "ofx" ? parseOfx(content) : parseCsv(content, bank);
}

export function parsePdfStatement(content: string, bank: ImportBank) {
  const genericTransactions = parseGenericPdfText(content);
  if (genericTransactions.length > 0) return genericTransactions;

  const bankTransactions = bank === "santander" || isSantanderPdfText(content)
    ? parseSantanderPdfText(content)
    : parseNubankPdfText(content);
  if (bankTransactions.length > 0) return bankTransactions;

  return bank === "nubank" ? parseSantanderPdfText(content) : parseNubankPdfText(content);
}

export function parseGenericPdfText(content: string) {
  const normalizedContent = normalizeExtractedPdfText(content);
  const sectionTransactions = parseGenericPdfLines(normalizedContent, true);
  return sectionTransactions.length > 0 ? sectionTransactions : parseGenericPdfLines(normalizedContent, false);
}

function parseGenericPdfLines(content: string, requireMovementSection: boolean) {
  const normalizedContent = normalizeExtractedPdfText(content);
  const year = getStatementYear(normalizedContent);
  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => normalizeDescription(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  let currentDate: string | null = null;
  let descriptionParts: string[] = [];
  let inMovementSection = false;

  for (const line of lines) {
    if (isMovementSectionStart(line)) {
      inMovementSection = true;
      continue;
    }

    if (inMovementSection && isMovementSectionEnd(line)) {
      inMovementSection = false;
      descriptionParts = [];
      continue;
    }

    const datedLine = extractLeadingDate(line, year);
    const canParseLine = inMovementSection
      || (!requireMovementSection && Boolean(datedLine))
      || (!requireMovementSection && currentDate && (descriptionParts.length > 0 || looksLikeTransactionLine(line) || looksLikeTransactionStart(line)));
    if (!canParseLine || shouldIgnoreGenericPdfLine(line)) continue;

    const text = datedLine?.text ?? line;
    const nestedDate = Boolean(datedLine && currentDate && descriptionParts.length > 0 && !looksLikeTransactionStart(datedLine.text));

    if (datedLine && !nestedDate) {
      currentDate = datedLine.date;
      descriptionParts = [];
    }

    if (!currentDate || !text) continue;

    const movement = findGenericMovementAmount(text);
    if (!movement) {
      descriptionParts.push(text);
      continue;
    }

    const description = cleanImportedDescription([...descriptionParts, text.slice(0, movement.index)].join(" "));
    addGenericPdfTransaction(transactions, currentDate, description, movement.value, transactions.length);
    descriptionParts = [];
  }

  return transactions;
}

export function parseNubankPdfText(content: string) {
  const transactions = parseNubankPdfTextByLines(content);
  const flattenedTransactions = parseNubankPdfTextFlattened(content);
  const byKey = new Map<string, ParsedTransaction>();

  for (const transaction of [...transactions, ...flattenedTransactions]) {
    byKey.set(`${transaction.date}-${transaction.type}-${transaction.amount.toFixed(2)}-${normalizeForMatch(transaction.description).slice(0, 80)}`, transaction);
  }

  return Array.from(byKey.values());
}

export function parseSantanderPdfText(content: string) {
  const normalizedContent = normalizeSantanderPdfText(content);
  const year = getSantanderStatementYear(normalizedContent);
  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => normalizeDescription(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  let currentDate: string | null = null;
  let descriptionParts: string[] = [];
  let inCheckingAccount = false;

  for (const line of lines) {
    if (/^Conta Corrente$/i.test(line) || /^Movimenta[cç][aã]o$/i.test(line)) {
      inCheckingAccount = true;
      continue;
    }

    if (/^(Saldos por Per[ií]odo|Cr[eé]ditos Contratados|Investimentos|Poupan[cç]a|Resumo|Produtos e Servi[cç]os|Pacote de Servi[cç]os)\b/i.test(line)) {
      inCheckingAccount = false;
      descriptionParts = [];
      continue;
    }

    if (!inCheckingAccount || shouldIgnoreSantanderPdfLine(line)) continue;

    const datedLine = line.match(/^(\d{2})\/(\d{2})\s+(.+)$/);
    const isNestedCardDate = Boolean(datedLine && descriptionParts.length > 0 && !isSantanderTransactionStarter(datedLine[3] ?? ""));
    const text = datedLine && !isNestedCardDate ? datedLine[3] ?? "" : line;
    if (datedLine) {
      if (!isNestedCardDate) {
        currentDate = toIsoDate(year, Number(datedLine[2] ?? 0), Number(datedLine[1] ?? 0));
        if (descriptionParts.length > 0) descriptionParts = [];
      }
    }

    if (!currentDate || !text) continue;

    const amountMatch = findSantanderMovementAmount(text);
    if (!amountMatch) {
      descriptionParts.push(text);
      continue;
    }

    const description = normalizeDescription([...descriptionParts, text.slice(0, amountMatch.index)].join(" ").replace(/\s*-\s*$/, ""));
    addSantanderPdfTransaction(transactions, currentDate, description, amountMatch.value, transactions.length);
    descriptionParts = [];
  }

  return transactions;
}

function parseNubankPdfTextByLines(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeDescription(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  let currentDate: string | null = null;
  let currentType: "income" | "expense" | null = null;
  let descriptionParts: string[] = [];

  for (const line of lines) {
    const date = parseNubankPdfDate(line);
    if (date) {
      currentDate = date;
      currentType = /^\d{1,2}\s+\w+\s+\d{4}\s+Total de entradas\s*\+/i.test(line)
        ? "income"
        : /^\d{1,2}\s+\w+\s+\d{4}\s+Total de sa[ií]das\s*-/i.test(line)
          ? "expense"
          : null;
      descriptionParts = [];
      continue;
    }

    if (/^Total de entradas\s*\+/i.test(line)) {
      currentType = "income";
      descriptionParts = [];
      continue;
    }

    if (/^Total de sa[ií]das\s*-/i.test(line)) {
      currentType = "expense";
      descriptionParts = [];
      continue;
    }

    if (!currentDate || !currentType || shouldIgnoreNubankPdfLine(line)) continue;

    const inline = line.match(/^(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})$/);
    const amountOnly = line.match(/^(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})$/);

    if (inline) {
      const description = normalizeDescription([...descriptionParts, inline[1] ?? ""].join(" "));
      addNubankPdfTransaction(transactions, currentDate, currentType, description, inline[2] ?? "", transactions.length);
      descriptionParts = [];
      continue;
    }

    if (amountOnly) {
      const description = normalizeDescription(descriptionParts.join(" "));
      addNubankPdfTransaction(transactions, currentDate, currentType, description, amountOnly[1] ?? "", transactions.length);
      descriptionParts = [];
      continue;
    }

    descriptionParts.push(line);
  }

  return transactions;
}

function parseNubankPdfTextFlattened(content: string) {
  const text = normalizeDescription(content.replace(/\r?\n/g, " "));
  const dateMatches = Array.from(text.matchAll(/\b(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/gi));
  const transactions: ParsedTransaction[] = [];

  dateMatches.forEach((match, index) => {
    const start = match.index ?? 0;
    const nextStart = dateMatches[index + 1]?.index ?? text.length;
    const section = text.slice(start, nextStart);
    const date = parseNubankPdfDate(match[0] ?? "");
    if (!date) return;

    const incomeMatch = section.match(/Total de entradas\s*\+\s*(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    const expenseMatch = section.match(/Total de sa[ií]das\s*-\s*(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    const balanceMatch = section.match(/Saldo do dia\s*(?:-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})/i);

    if (incomeMatch?.index !== undefined) {
      const incomeStart = incomeMatch.index + incomeMatch[0].length;
      const incomeEnd = expenseMatch?.index !== undefined ? expenseMatch.index : balanceMatch?.index ?? section.length;
      extractNubankPdfTransactionsFromSection(section.slice(incomeStart, incomeEnd), date, "income", transactions);
    }

    if (expenseMatch?.index !== undefined) {
      const expenseStart = expenseMatch.index + expenseMatch[0].length;
      const expenseEnd = balanceMatch?.index ?? section.length;
      extractNubankPdfTransactionsFromSection(section.slice(expenseStart, expenseEnd), date, "expense", transactions);
    }
  });

  return transactions;
}

export function parseCsv(content: string, bank: ImportBank = "automatic") {
  const rows = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length === 0) return [];

  const delimiter = detectDelimiter(rows.slice(0, 5).join("\n"));
  const parsedRows = rows.map((row) => splitCsvLine(row, delimiter));
  const firstParsedRow = parsedRows[0] ?? [];
  const firstRow = firstParsedRow.map(normalizeHeader);
  const hasHeader = firstRow.some((cell) => ["data", "date", "descricao", "description", "valor", "amount"].includes(cell));
  const headers = hasHeader ? firstRow : inferHeaders(firstParsedRow, bank);
  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;

  return dataRows.flatMap((row, index) => {
    const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""]));
    const date = normalizeDate(raw["data"] || raw["date"] || raw["dt"] || raw["lancamento"] || raw["movimento"]);
    const description = normalizeDescription(raw["descricao"] || raw["description"] || raw["historico"] || raw["memo"] || raw["nome"] || raw["tipo"] || row.find((cell) => /[a-zA-ZÀ-ÿ]/.test(cell)) || "Lançamento importado");
    const amount = normalizeMoney(raw["valor"] || raw["amount"] || raw["value"] || raw["quantia"] || findMoneyCell(row));

    if (!date || !description || amount === null || amount === 0) return [];

    return [{
      id: `csv-${index}-${date}-${Math.abs(amount).toFixed(2)}`,
      date,
      description,
      amount: Math.abs(amount),
      type: amount >= 0 ? "income" as const : "expense" as const,
      externalId: null,
    }];
  });
}

export function parseOfx(content: string) {
  const transactions = content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CREDITCARDMSGSRSV1>|$)/gi) ?? [];

  return transactions.flatMap((block, index) => {
    const postedAt = getOfxTag(block, "DTPOSTED") || getOfxTag(block, "DTUSER");
    const amount = normalizeMoney(getOfxTag(block, "TRNAMT"));
    const description = normalizeDescription(getOfxTag(block, "MEMO") || getOfxTag(block, "NAME") || getOfxTag(block, "PAYEE") || "Lançamento OFX");
    const externalId = getOfxTag(block, "FITID");
    const date = normalizeOfxDate(postedAt);

    if (!date || amount === null || amount === 0) return [];

    return [{
      id: externalId || `ofx-${index}-${date}-${Math.abs(amount).toFixed(2)}`,
      date,
      description,
      amount: Math.abs(amount),
      type: amount >= 0 ? "income" as const : "expense" as const,
      externalId,
    }];
  });
}

export function normalizeDate(value: string | undefined | null) {
  const text = (value ?? "").trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return toIsoDate(Number(iso[1] ?? 0), Number(iso[2] ?? 0), Number(iso[3] ?? 0));
  const br = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (br) {
    const year = br[3] ?? "";
    return toIsoDate(Number(year.length === 2 ? `20${year}` : year), Number(br[2] ?? 0), Number(br[1] ?? 0));
  }
  return null;
}

export function normalizeMoney(value: string | number | undefined | null) {
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;
  const negative = /^-/.test(raw) || /-\s*$/.test(raw) || /\((.*)\)/.test(raw);
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/^\+/, "").replace(/-$/, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const decimalSeparator = comma > dot ? "," : ".";
  const normalized = decimalSeparator === ","
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return Number((negative ? -Math.abs(number) : number).toFixed(2));
}

export function normalizeDescription(value: string | undefined | null) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^"|"$/g, "")
    .trim();
}

export function suggestCategoryId(transaction: Pick<ParsedTransaction, "description" | "type">, categories: Category[], userId: string) {
  const available = categories.filter((category) => category.is_active && category.parent_id === null && category.type === transaction.type && (category.user_id === userId || category.is_default));
  const byName = new Map(available.map((category) => [normalizeForMatch(category.name), category.id]));
  const description = normalizeForMatch(transaction.description);
  const preferredName = transaction.type === "income" ? "ganhos variaveis" : "gastos variaveis";

  const rules: Array<{ pattern: RegExp; names: string[]; type?: "income" | "expense" }> = [
    { pattern: /ifood|restaurante|lanch|padaria|mercado|supermercado|mercad/i, names: ["gastos variaveis"], type: "expense" },
    { pattern: /uber|99|posto|shell|ipiranga|combust/i, names: ["gastos variaveis"], type: "expense" },
    { pattern: /netflix|spotify|assinatura|google|apple|software/i, names: ["gastos fixos", "gastos variaveis"], type: "expense" },
    { pattern: /pix.*receb|receb.*pix|asaas|salario|cliente|pagamento recebido/i, names: ["ganhos variaveis", "ganhos fixos"], type: "income" },
    { pattern: /pix|ted|doc|transfer/i, names: transaction.type === "income" ? ["ganhos variaveis"] : ["gastos variaveis"] },
  ];

  for (const rule of rules) {
    if (rule.type && rule.type !== transaction.type) continue;
    if (!rule.pattern.test(description)) continue;
    const match = rule.names.map((name) => byName.get(name)).find(Boolean);
    if (match) return match;
  }

  return byName.get(preferredName) ?? available[0]?.id ?? "";
}

export function markDuplicates(transactions: ParsedTransaction[], existingEntries: FinancialEntry[], accountId: string) {
  return transactions.map((transaction) => {
    const duplicate = existingEntries.find((entry) => (
      entry.account_id === accountId
      && entry.entry_type === transaction.type
      && Math.abs(Number(entry.actual_amount ?? entry.expected_amount) - transaction.amount) < 0.01
      && sameOrNearbyDate(entry.paid_date || entry.due_date, transaction.date)
      && similarDescription(entry.description, transaction.description)
    ));

    return {
      ...transaction,
      selected: !duplicate,
      accountId,
      categoryId: "",
      status: "paid" as const,
      duplicate: Boolean(duplicate),
      duplicateReason: duplicate ? `Possível duplicata de "${duplicate.description}" em ${new Date(`${(duplicate.paid_date || duplicate.due_date)}T00:00:00`).toLocaleDateString("pt-BR")}.` : null,
    };
  });
}

export function similarDescription(first: string, second: string) {
  const a = normalizeForMatch(first);
  const b = normalizeForMatch(second);
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aWords = new Set(a.split(" ").filter((word) => word.length >= 3));
  const bWords = b.split(" ").filter((word) => word.length >= 3);
  if (aWords.size === 0 || bWords.length === 0) return false;
  const common = bWords.filter((word) => aWords.has(word)).length;
  return common / Math.max(aWords.size, bWords.length) >= 0.6;
}

export function importSummary(transactions: ReviewTransaction[]) {
  return {
    total: transactions.length,
    income: transactions.filter((transaction) => transaction.type === "income").length,
    expense: transactions.filter((transaction) => transaction.type === "expense").length,
    duplicates: transactions.filter((transaction) => transaction.duplicate).length,
    selected: transactions.filter((transaction) => transaction.selected && !transaction.duplicate).length,
    needsReview: transactions.filter((transaction) => !transaction.categoryId || transaction.duplicate).length,
  };
}

function inferHeaders(row: string[], bank: ImportBank) {
  if (bank === "santander") return ["data", "descricao", "valor", "tipo"].slice(0, row.length);
  return ["data", "descricao", "valor", "tipo", "extra"].slice(0, row.length);
}

function detectDelimiter(sample: string) {
  const semicolon = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  return semicolon > comma ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return normalizeForMatch(value).replace(/ /g, "_").replace("descrição", "descricao");
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeExtractedPdfText(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const singleCharacterLines = lines.filter((line) => line.length === 1).length;
  if (lines.length > 50 && singleCharacterLines / lines.length > 0.65) {
    return normalizeCompactedPdfText(lines.join(""));
  }
  return content;
}

function normalizeCompactedPdfText(content: string) {
  return content
    .replace(/(Movimenta[cç][aã]o|ContaCorrente|DataDescri[cç][aã]o|SALDOEM|SALDOATUAL|SALDOANTERIOR)/gi, "\n$1\n")
    .replace(/(\d{2}\/\d{2})/g, "\n$1\n")
    .replace(/(PIXRECEBIDO|PIXENVIADO|DEBITOVISAELECTRONBRASIL|COMPRACARTAODEBMC|PAGAMENTODEBOLETO|TARIFAMENSALIDADE|TED|DOC|SAQUE)/gi, "\n$1 ")
    .replace(/PIXRECEBIDO/gi, "PIX RECEBIDO")
    .replace(/PIXENVIADO/gi, "PIX ENVIADO")
    .replace(/DEBITOVISAELECTRONBRASIL/gi, "DEBITO VISA ELECTRON BRASIL")
    .replace(/COMPRACARTAODEBMC/gi, "COMPRA CARTAO DEB MC")
    .replace(/PAGAMENTODEBOLETO/gi, "PAGAMENTO DE BOLETO")
    .replace(/TARIFAMENSALIDADE/gi, "TARIFA MENSALIDADE")
    .replace(/(\d{6})(\d{1,3},\d{2}-?)/g, "$1 $2")
    .replace(/(-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?)/g, " $1 ")
    .replace(/(SALDOEM|SALDOATUAL|SALDOANTERIOR)/gi, (match) => match.replace(/SALDO/gi, "SALDO "));
}

function getStatementYear(content: string) {
  const monthNameMatch = content.match(/(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i);
  if (monthNameMatch?.[1]) return Number(monthNameMatch[1]);
  const fullDateMatch = content.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/);
  return fullDateMatch?.[1] ? Number(fullDateMatch[1]) : new Date().getFullYear();
}

function isMovementSectionStart(line: string) {
  return /^(Movimenta[cç][aã]o|Lan[cç]amentos|Transa[cç][oõ]es|Data\s+Descri[cç][aã]o|Data\s+Hist[oó]rico|Hist[oó]rico\s+Valor)\b/i.test(line);
}

function isMovementSectionEnd(line: string) {
  return /^(Saldos? por Per[ií]odo|Cr[eé]ditos Contratados|Investimentos|Poupan[cç]a|Resumo|Produtos e Servi[cç]os|Pacote de Servi[cç]os|Limite|CET\b|Aproveite agora|Total de Dep[oó]sitos|Total de Retiradas)\b/i.test(line);
}

function shouldIgnoreGenericPdfLine(line: string) {
  return /^(Data\s+Descri[cç][aã]o|Data\s+Hist[oó]rico|Descri[cç][aã]o\s+Movimento|N[ºo]\s*Documento|Documento\b|Movimento \(R\$\)|Valor \(R\$\)|Saldo \(R\$\)|SALDO (EM|ANTERIOR|ATUAL)|Nome\b|Ag[eê]ncia\b|Conta\b|Conta Corrente\b|\(=\)|\(\+\)|\(-\)|Pagina:|P[aá]gina:|Extrato_|EXTRATO CONSOLIDADO|Prezado\b|Sua seguran[cç]a|Central de Atendimento|Ouvidoria|SAC|Chat|Libras)\b/i.test(line);
}

function extractLeadingDate(line: string, fallbackYear: number) {
  const dayMonth = line.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(.+))?$/);
  if (dayMonth) {
    const yearText = dayMonth[3];
    const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : fallbackYear;
    const date = toIsoDate(year, Number(dayMonth[2] ?? 0), Number(dayMonth[1] ?? 0));
    return date ? { date, text: dayMonth[4] ?? "" } : null;
  }

  const iso = line.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(.+)$/);
  if (iso) {
    const date = toIsoDate(Number(iso[1] ?? 0), Number(iso[2] ?? 0), Number(iso[3] ?? 0));
    return date ? { date, text: iso[4] ?? "" } : null;
  }

  return null;
}

function looksLikeTransactionStart(text: string) {
  return /^(PIX|DEBITO|D[EÉ]BITO|COMPRA|PAGAMENTO|TARIFA|TED|DOC|SAQUE|TRANSFER[EÊ]NCIA|TRANSFERENCIA|RECEBIMENTO|CR[EÉ]DITO|CREDITO|DEP[OÓ]SITO|DEPOSITO)\b/i.test(text);
}

function looksLikeTransactionLine(line: string) {
  return Boolean(extractLeadingDate(line, getStatementYear(line)) || looksLikeTransactionStart(line)) && /\d+[,.]\d{2}-?/.test(line);
}

function findGenericMovementAmount(text: string) {
  const amountMatches = Array.from(text.matchAll(/(?:^|\s)(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\s*\d+,\d{2}-?|-?\s*\d+\.\d{2})(?=\s|$)/g));
  if (amountMatches.length === 0) return null;
  const match = amountMatches[0];
  if (!match) return null;
  let value = match[1]?.replace(/\s+/g, "") ?? "";
  const fullMatch = match[0] ?? "";
  const prefix = text.slice(0, match.index ?? 0);
  if (value.startsWith("-") && !value.endsWith("-") && (/[-–—]\s*$/.test(prefix) || /^\s*-\s*/.test(fullMatch) || /\b(RECEBIDO|CREDITO|CR[EÉ]DITO|DEP[OÓ]SITO|DEPOSITO)\b/i.test(prefix))) value = value.slice(1);
  const index = (match.index ?? 0) + (fullMatch.startsWith(" ") ? 1 : 0);
  return value ? { value, index } : null;
}

function cleanImportedDescription(value: string) {
  return normalizeDescription(value.replace(/\s*[-–—]\s*$/, ""));
}

function addGenericPdfTransaction(transactions: ParsedTransaction[], date: string, description: string, amountText: string, index: number) {
  if (!description || shouldIgnoreGenericPdfLine(description)) return;
  const amount = normalizeMoney(amountText);
  if (amount === null || amount === 0) return;
  const absoluteAmount = Math.abs(amount);
  transactions.push({
    id: `generic-pdf-${index}-${date}-${absoluteAmount.toFixed(2)}`,
    date,
    description,
    amount: absoluteAmount,
    type: amount >= 0 ? "income" : "expense",
    externalId: null,
  });
}

function isSantanderPdfText(content: string) {
  const normalized = normalizeForMatch(normalizeExtractedPdfText(content));
  return normalized.includes("santander") || (normalized.includes("conta corrente") && normalized.includes("movimentacao"));
}

function normalizeSantanderPdfText(content: string) {
  return normalizeExtractedPdfText(content);
}

function getSantanderStatementYear(content: string) {
  return getStatementYear(content);
}

function shouldIgnoreSantanderPdfLine(line: string) {
  return /^(Data\s+Descri[cç][aã]o|N[ºo]\s*Documento|Movimento \(R\$\)|Saldo \(R\$\)|SALDO (EM|ANTERIOR|ATUAL)|Nome\b|Ag[eê]ncia\b|Conta Corrente\b|\(=\)|\(\+\)|\(-\)|Pagina:|Extrato_|BALP_|EXTRATO CONSOLIDADO|Prezado\b|Sua seguran[cç]a|Central de Atendimento|Ouvidoria|SAC|Chat|Libras)\b/i.test(line);
}

function findSantanderMovementAmount(text: string) {
  const amountMatches = Array.from(text.matchAll(/(?:^|\s)(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\s*\d+,\d{2}-?)(?=\s|$)/g));
  if (amountMatches.length === 0) return null;
  const match = amountMatches[0];
  if (!match) return null;
  let value = match[1]?.replace(/\s+/g, "") ?? "";
  if (value.startsWith("-") && !value.endsWith("-")) value = value.slice(1);
  const fullMatch = match[0] ?? "";
  const index = (match.index ?? 0) + (fullMatch.startsWith(" ") ? 1 : 0);
  return value ? { value, index } : null;
}

function isSantanderTransactionStarter(text: string) {
  return /^(PIX|DEBITO|D[EÉ]BITO|COMPRA|PAGAMENTO|TARIFA|TED|DOC|SAQUE)\b/i.test(text);
}

function addSantanderPdfTransaction(transactions: ParsedTransaction[], date: string, description: string, amountText: string, index: number) {
  if (!description || shouldIgnoreSantanderPdfLine(description)) return;
  const amount = normalizeMoney(amountText);
  if (amount === null || amount === 0) return;
  const absoluteAmount = Math.abs(amount);
  transactions.push({
    id: `santander-pdf-${index}-${date}-${absoluteAmount.toFixed(2)}`,
    date,
    description,
    amount: absoluteAmount,
    type: amount >= 0 ? "income" : "expense",
    externalId: null,
  });
}

function findMoneyCell(row: string[]) {
  return row.find((cell) => normalizeMoney(cell) !== null) ?? "";
}

function toIsoDate(year: number, month: number, day: number) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeOfxDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : normalizeDate(value);
}

function parseNubankPdfDate(line: string) {
  const match = line.match(/^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/i);
  if (!match) return null;
  const monthByName: Record<string, number> = {
    JAN: 1,
    FEV: 2,
    MAR: 3,
    ABR: 4,
    MAI: 5,
    JUN: 6,
    JUL: 7,
    AGO: 8,
    SET: 9,
    OUT: 10,
    NOV: 11,
    DEZ: 12,
  };
  return toIsoDate(Number(match[3] ?? 0), monthByName[(match[2] ?? "").toUpperCase()] ?? 0, Number(match[1] ?? 0));
}

function shouldIgnoreNubankPdfLine(line: string) {
  return /^(Saldo do dia|Saldo inicial|Saldo final|Rendimento líquido|Total de entradas|Total de sa[ií]das|Movimenta[cç][oõ]es|Tem alguma d[uú]vida|Caso a solu[cç][aã]o|Extrato gerado|O saldo l[ií]quido|N[ãa]o nos responsabilizamos|Asseguramos|Nu Financeira|Nu Pagamentos|CNPJ|Ag[eê]ncia|Conta:?)\b/i.test(line)
    || /^\d+ de \d+$/i.test(line)
    || /^VALORES EM R\$/i.test(line)
    || /^(Aplicação RDB|Aplica[cç][aã]o RDB|Resgate RDB)\b/i.test(line);
}

function addNubankPdfTransaction(transactions: ParsedTransaction[], date: string, type: "income" | "expense", description: string, amountText: string, index: number) {
  if (!description || shouldIgnoreNubankPdfLine(description)) return;
  const amount = normalizeMoney(amountText);
  if (amount === null || amount === 0) return;
  const absoluteAmount = Math.abs(amount);

  transactions.push({
    id: `nubank-pdf-${index}-${date}-${absoluteAmount.toFixed(2)}`,
    date,
    description,
    amount: absoluteAmount,
    type,
    externalId: null,
  });
}

function extractNubankPdfTransactionsFromSection(section: string, date: string, type: "income" | "expense", transactions: ParsedTransaction[]) {
  const normalizedSection = normalizeDescription(section.replace(/(?:Aplicação|Aplica[cç][aã]o|Resgate)\s+RDB\s+(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi, " "));
  const starter = /(?:Transfer[eê]ncia\s+(?:recebida|Recebida|enviada)(?:\s+pelo\s+Pix)?|Compra\s+no\s+d[eé]bito)/gi;
  const starts = Array.from(normalizedSection.matchAll(starter));

  starts.forEach((match, index) => {
    const start = match.index ?? 0;
    const nextStart = starts[index + 1]?.index ?? normalizedSection.length;
    const chunk = normalizedSection.slice(start, nextStart).trim();
    if (!chunk || shouldIgnoreNubankPdfLine(chunk)) return;

    const amountMatches = Array.from(chunk.matchAll(/(?:^|\s)(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?=\s|$)/g));
    const amountMatch = amountMatches.at(-1);
    const amountText = amountMatch?.[1];
    if (!amountText || amountMatch?.index === undefined) return;

    const description = normalizeDescription(chunk.slice(0, amountMatch.index).replace(/\s[-+]?$/, ""));
    addNubankPdfTransaction(transactions, date, type, description, amountText, transactions.length);
  });
}

function getOfxTag(block: string, tag: string) {
  const xmlMatch = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (xmlMatch) return normalizeDescription(xmlMatch[1]);
  const sgmlMatch = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return sgmlMatch ? normalizeDescription(sgmlMatch[1]) : null;
}

function sameOrNearbyDate(first: string, second: string) {
  const firstTime = new Date(`${first}T00:00:00`).getTime();
  const secondTime = new Date(`${second}T00:00:00`).getTime();
  return Math.abs(firstTime - secondTime) <= 24 * 60 * 60 * 1000;
}
