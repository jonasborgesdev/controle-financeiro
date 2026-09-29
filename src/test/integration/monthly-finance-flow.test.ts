import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountBalanceFromEntries, accountProjectedBalanceFromEntries, dueDateForMonth, monthLabel, summarizeEntries } from "@/lib/finance";
import { importSummary, markDuplicates, parseNubankPdfText, suggestCategoryId } from "@/lib/importer";
import type { Account, FinancialEntry, MonthlyBalance, RecurringRule } from "@/types/database";
import { createTestUser, deleteTestUser, hasSupabaseTestEnv, signInTestUser } from "./helpers/supabase";

const runOrSkip = hasSupabaseTestEnv() ? describe : describe.skip;

runOrSkip("fluxo financeiro mensal com Supabase", () => {
  let context: Awaited<ReturnType<typeof createTestUser>> | null = null;

  beforeEach(async () => {
    context = await createTestUser("it");
  });

  afterEach(async () => {
    if (context) await deleteTestUser(context.admin, context.user, "it");
    context = null;
  });

  it("cria conta, categoria, balanço e lançamentos respeitando previsto vs realizado", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: account, error: accountError } = await client
      .from("accounts")
      .insert({
        user_id: user.id,
        name: "Conta IT Fluxo",
        type: "personal",
        bank: "Banco Teste",
        description: null,
        initial_balance: 200,
        is_active: true,
        color: "#0891b2",
        icon: "wallet",
      })
      .select("*")
      .single();
    expect(accountError).toBeNull();

    const { data: category, error: categoryError } = await client
      .from("categories")
      .insert({
        user_id: user.id,
        name: "Categoria IT Fluxo",
        type: "income",
        icon: "briefcase",
        color: "#10b981",
        parent_id: null,
        is_default: false,
        is_active: true,
      })
      .select("*")
      .single();
    expect(categoryError).toBeNull();

    const { data: balance, error: balanceError } = await client
      .from("monthly_balances")
      .upsert({ user_id: user.id, year: 2026, month: 9, label: monthLabel(2026, 9) }, { onConflict: "user_id,year,month" })
      .select("*")
      .single();
    expect(balanceError).toBeNull();

    const rows = [
      {
        user_id: user.id,
        monthly_balance_id: balance!.id,
        account_id: account!.id,
        category_id: category!.id,
        entry_type: "income" as const,
        status: "paid" as const,
        description: "Receita IT paga",
        expected_amount: 1000,
        actual_amount: 900,
        due_date: "2026-09-05",
        paid_date: "2026-09-05",
        source: "manual" as const,
        recurring_rule_id: null,
        notes: null,
      },
      {
        user_id: user.id,
        monthly_balance_id: balance!.id,
        account_id: account!.id,
        category_id: null,
        entry_type: "expense" as const,
        status: "planned" as const,
        description: "Despesa IT prevista",
        expected_amount: 300,
        actual_amount: null,
        due_date: "2026-09-10",
        paid_date: null,
        source: "manual" as const,
        recurring_rule_id: null,
        notes: null,
      },
    ];

    const { error: entriesError } = await client.from("financial_entries").insert(rows);
    expect(entriesError).toBeNull();

    const { data: entries, error: selectError } = await client
      .from("financial_entries")
      .select("*")
      .eq("monthly_balance_id", balance!.id)
      .order("due_date");
    expect(selectError).toBeNull();
    expect(entries).toHaveLength(2);

    expect(summarizeEntries(entries as FinancialEntry[])).toEqual({
      expectedIncome: 1000,
      expectedExpenses: 300,
      expectedBalance: 700,
      actualIncome: 900,
      actualExpenses: 0,
      actualBalance: 900,
      remainingIncome: 100,
      remainingExpenses: 300,
    });
    expect(accountBalanceFromEntries(account as Account, entries as FinancialEntry[])).toBe(1100);
    expect(accountProjectedBalanceFromEntries(account as Account, entries as FinancialEntry[])).toBe(800);
  });

  it("cria conta simplificada com defaults internos", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: account, error } = await client
      .from("accounts")
      .insert({
        user_id: user.id,
        name: "Conta IT Simples",
        type: "personal",
        bank: "Banco Simples",
        description: null,
        initial_balance: 50,
        is_active: true,
        color: null,
        icon: null,
      })
      .select("*")
      .single();

    expect(error).toBeNull();
    expect(account).toMatchObject({
      name: "Conta IT Simples",
      type: "personal",
      bank: "Banco Simples",
      description: null,
      initial_balance: 50,
      is_active: true,
      color: null,
      icon: null,
    });
  });

  it("permite conta com saldo inicial negativo", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: account, error } = await client
      .from("accounts")
      .insert({
        user_id: user.id,
        name: "Conta IT Cheque Especial",
        type: "personal",
        bank: "Banco Negativo",
        description: null,
        initial_balance: -750,
        is_active: true,
        color: null,
        icon: null,
      })
      .select("*")
      .single();

    expect(error).toBeNull();
    expect(account?.initial_balance).toBe(-750);
    expect(accountBalanceFromEntries(account as Account, [])).toBe(-750);
    expect(accountProjectedBalanceFromEntries(account as Account, [])).toBe(-750);
  });

  it("cria classificacao de gasto simplificada com defaults internos", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: category, error } = await client
      .from("categories")
      .insert({
        user_id: user.id,
        name: "Gastos IT Variáveis",
        type: "expense",
        parent_id: null,
        icon: null,
        color: null,
        is_default: false,
        is_active: true,
      })
      .select("*")
      .single();

    expect(error).toBeNull();
    expect(category).toMatchObject({
      name: "Gastos IT Variáveis",
      type: "expense",
      parent_id: null,
      icon: null,
      color: null,
      is_default: false,
      is_active: true,
    });
  });

  it("cria classificacao de ganho simplificada com defaults internos", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: category, error } = await client
      .from("categories")
      .insert({
        user_id: user.id,
        name: "Ganhos IT Fixos",
        type: "income",
        parent_id: null,
        icon: null,
        color: null,
        is_default: false,
        is_active: true,
      })
      .select("*")
      .single();

    expect(error).toBeNull();
    expect(category).toMatchObject({
      name: "Ganhos IT Fixos",
      type: "income",
      parent_id: null,
      icon: null,
      color: null,
      is_default: false,
      is_active: true,
    });
  });

  it("isola lançamentos entre usuários por RLS", async () => {
    const other = await createTestUser("it");
    try {
      const first = await signInTestUser(context!.email, context!.password);
      const second = await signInTestUser(other.email, other.password);

      const { data: secondBalance } = await second.client
        .from("monthly_balances")
        .insert({ user_id: second.user.id, year: 2026, month: 10, label: "outubro de 2026" })
        .select("*")
        .single();

      await second.client.from("financial_entries").insert({
        user_id: second.user.id,
        monthly_balance_id: secondBalance!.id,
        account_id: null,
        category_id: null,
        entry_type: "income",
        status: "paid",
        description: "Entrada secreta outro usuario",
        expected_amount: 100,
        actual_amount: 100,
        due_date: "2026-10-01",
        paid_date: "2026-10-01",
        source: "manual",
        recurring_rule_id: null,
        notes: null,
      });

      const { data, error } = await first.client.from("financial_entries").select("*").eq("description", "Entrada secreta outro usuario");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(other.admin, other.user, "it");
    }
  });

  it("gera lançamentos recorrentes com upsert sem duplicar o mesmo mês", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: rule, error: ruleError } = await client
      .from("recurring_rules")
      .insert({
        user_id: user.id,
        account_id: null,
        category_id: null,
        entry_type: "expense",
        description: "Internet IT Recorrente",
        amount: 120,
        day_of_month: 31,
        start_year: 2026,
        start_month: 1,
        end_year: 2026,
        end_month: 3,
        is_active: true,
        notes: null,
      })
      .select("*")
      .single();
    expect(ruleError).toBeNull();

    const balances: MonthlyBalance[] = [];
    for (const month of [1, 2, 3]) {
      const { data, error } = await client
        .from("monthly_balances")
        .upsert({ user_id: user.id, year: 2026, month, label: monthLabel(2026, month) }, { onConflict: "user_id,year,month" })
        .select("*")
        .single();
      expect(error).toBeNull();
      balances.push(data as MonthlyBalance);
    }

    const entriesForRule = (ruleData: RecurringRule) => balances.map((balance) => ({
      user_id: user.id,
      monthly_balance_id: balance.id,
      account_id: null,
      category_id: null,
      entry_type: ruleData.entry_type,
      status: "planned" as const,
      description: ruleData.description,
      expected_amount: Number(ruleData.amount),
      actual_amount: null,
      due_date: dueDateForMonth(ruleData.day_of_month, balance.year, balance.month),
      paid_date: null,
      source: "recurring" as const,
      recurring_rule_id: ruleData.id,
      notes: null,
    }));

    const { error: firstUpsertError } = await client.from("financial_entries").upsert(entriesForRule(rule as RecurringRule), { onConflict: "recurring_rule_id,monthly_balance_id" });
    expect(firstUpsertError).toBeNull();

    const { error: secondUpsertError } = await client.from("financial_entries").upsert(entriesForRule(rule as RecurringRule), { onConflict: "recurring_rule_id,monthly_balance_id" });
    expect(secondUpsertError).toBeNull();

    const { data, error } = await client.from("financial_entries").select("*").eq("recurring_rule_id", rule!.id).order("due_date");
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data?.map((entry) => entry.due_date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("importa extrato PDF Nubank para balanços mensais, lançamentos, histórico e detecta duplicatas", async () => {
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: account, error: accountError } = await client
      .from("accounts")
      .insert({
        user_id: user.id,
        name: "Conta IT Nubank PDF",
        type: "business",
        bank: "Nubank",
        description: null,
        initial_balance: 11.45,
        is_active: true,
        color: null,
        icon: null,
      })
      .select("*")
      .single();
    expect(accountError).toBeNull();

    const { data: categories, error: categoriesError } = await client
      .from("categories")
      .insert([
        { user_id: user.id, name: "Ganhos PDF Variáveis", type: "income", parent_id: null, icon: null, color: null, is_default: false, is_active: true },
        { user_id: user.id, name: "Gastos PDF Variáveis", type: "expense", parent_id: null, icon: null, color: null, is_default: false, is_active: true },
      ])
      .select("*");
    expect(categoriesError).toBeNull();

    const pdfText = "05 AGO 2026 Total de entradas + 4.635,00 Transferência recebida pelo Pix AGENCIA WEBNAUTA DIG - 16.658.746/0001-27 - BANCO INTER (0077) Agência: 1 Conta: 5579948-5 4.500,00 Resgate RDB 135,00 Total de saídas - 4.646,45 Aplicação RDB 100,00 Transferência enviada pelo Pix RECEITA FEDERAL - 00.394.460/0058-87 - ITAÚ UNIBANCO S.A. (0341) Agência: 332 Conta: 81010-0 86,05 Compra no débito 43.914.435 GABRIELLA G 95,00 Saldo do dia 0,00 24 AGO 2026 Total de entradas + 85,79 Transferência recebida pelo Pix JONAS BORGES DA SILVA 13423333731 - 26.460.470/0001-21 - ASAAS IP S.A. (0461) Agência: 1 Conta: 860914-2 85,79 Saldo do dia 218,96";
    const parsed = parseNubankPdfText(pdfText);
    expect(parsed).toHaveLength(4);

    const reviewItems = parsed.map((transaction) => ({
      ...transaction,
      selected: true,
      accountId: account!.id,
      categoryId: suggestCategoryId(transaction, categories ?? [], user.id),
      status: "paid" as const,
      duplicate: false,
      duplicateReason: null,
    }));
    expect(importSummary(reviewItems)).toMatchObject({ total: 4, income: 2, expense: 2, selected: 4 });

    const balanceByMonth = new Map<string, MonthlyBalance>();
    for (const month of Array.from(new Set(parsed.map((transaction) => transaction.date.slice(0, 7))))) {
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const { data: balance, error: balanceError } = await client
        .from("monthly_balances")
        .upsert({ user_id: user.id, year, month: monthNumber, label: monthLabel(year, monthNumber) }, { onConflict: "user_id,year,month" })
        .select("*")
        .single();
      expect(balanceError).toBeNull();
      balanceByMonth.set(month, balance as MonthlyBalance);
    }

    const rows = parsed.map((transaction) => ({
      user_id: user.id,
      monthly_balance_id: balanceByMonth.get(transaction.date.slice(0, 7))!.id,
      account_id: account!.id,
      category_id: suggestCategoryId(transaction, categories ?? [], user.id) || null,
      entry_type: transaction.type,
      status: "paid" as const,
      description: transaction.description,
      expected_amount: transaction.amount,
      actual_amount: transaction.amount,
      due_date: transaction.date,
      paid_date: transaction.date,
      source: "imported" as const,
      recurring_rule_id: null,
      notes: "Importado do extrato PDF Nubank.",
    }));

    const { error: entriesError } = await client.from("financial_entries").insert(rows);
    expect(entriesError).toBeNull();

    const { error: historyError } = await client.from("import_history").insert({
      user_id: user.id,
      account_id: account!.id,
      filename: "nubank-pj-agosto-setembro.pdf",
      file_type: "pdf",
      bank: "nubank",
      total_transactions: parsed.length,
      imported_transactions: parsed.length,
      duplicated_transactions: 0,
      ignored_transactions: 0,
      status: "completed",
      error_message: null,
    });
    expect(historyError).toBeNull();

    const { data: entries, error: selectEntriesError } = await client
      .from("financial_entries")
      .select("*")
      .eq("account_id", account!.id)
      .eq("source", "imported")
      .order("due_date");
    expect(selectEntriesError).toBeNull();
    expect(entries).toHaveLength(4);
    expect(entries?.every((entry) => entry.status === "paid" && entry.actual_amount !== null)).toBe(true);

    const augustSummary = summarizeEntries((entries ?? []).filter((entry) => entry.due_date.startsWith("2026-08")) as FinancialEntry[]);
    expect(augustSummary.actualIncome).toBe(4585.79);
    expect(augustSummary.actualExpenses).toBe(181.05);
    expect(accountBalanceFromEntries(account as Account, entries as FinancialEntry[])).toBeCloseTo(4416.19, 2);

    const { data: history, error: selectHistoryError } = await client
      .from("import_history")
      .select("*")
      .eq("account_id", account!.id)
      .eq("file_type", "pdf")
      .single();
    expect(selectHistoryError).toBeNull();
    expect(history).toMatchObject({ imported_transactions: 4, duplicated_transactions: 0, ignored_transactions: 0, status: "completed" });

    const duplicates = markDuplicates(parsed, entries as FinancialEntry[], account!.id);
    expect(duplicates).toHaveLength(4);
    expect(duplicates.every((transaction) => transaction.duplicate && !transaction.selected)).toBe(true);
  });
});
