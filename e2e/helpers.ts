import { expect, type Page } from "@playwright/test";
import { createClient, type User } from "@supabase/supabase-js";

const TEST_PASSWORD = "TesteSeguro123!";
const E2E_DOMAIN = "@controle-financeiro.test";

export function hasE2EEnv() {
  return Boolean(
    process.env["VITE_SUPABASE_URL"]
      && process.env["VITE_SUPABASE_ANON_KEY"]
      && (process.env["SUPABASE_TEST_SERVICE_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"]),
  );
}

function assertDisposableEmail(email: string) {
  if (!email.startsWith("e2e-") || !email.endsWith(E2E_DOMAIN)) {
    throw new Error(`Email E2E inseguro: ${email}`);
  }
}

function adminClient() {
  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_TEST_SERVICE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Variáveis Supabase E2E ausentes.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createE2EUser() {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}${E2E_DOMAIN}`;
  assertDisposableEmail(email);
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Usuario E2E" },
  });

  if (error || !data.user) throw new Error(`Falha ao criar usuário E2E: ${error?.message ?? "sem usuário"}`);

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: "Usuario E2E",
    role: "user",
    avatar_url: null,
  });

  return { admin, email, password: TEST_PASSWORD, user: data.user as User };
}

export async function deleteE2EUser(context: { admin: ReturnType<typeof adminClient>; user: User }) {
  if (!context.user.email) throw new Error("Usuário E2E sem email.");
  assertDisposableEmail(context.user.email);
  const { error } = await context.admin.auth.admin.deleteUser(context.user.id);
  if (error) throw new Error(`Falha ao remover usuário E2E: ${error.message}`);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Visão clara do mês, sem abrir planilha.")).toBeVisible();
}

export async function chooseAccountScope(page: Page, accountId: string) {
  const isMobile = await page.evaluate(() => window.innerWidth < 1024);
  const selectorId = isMobile ? "global-account-mobile" : "global-account-desktop";
  const selector = page.locator(`#${selectorId}`);
  await expect(selector).toBeVisible();
  await expect(selector.locator(`option[value="${accountId}"]`)).toHaveCount(1);
  await selector.selectOption(accountId);
}

export async function chooseMonth(page: Page, pickerId: string, monthValue: string) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const picker = page.locator(`[data-month-picker="${pickerId}"]`);
  await picker.locator("[data-month-picker-trigger]").click();
  const panel = page.locator("[data-month-picker-panel]");
  await expect(panel).toBeVisible();

  for (let index = 0; index < 30; index += 1) {
    const currentYear = Number((await panel.locator("text=/^\\d{4}$/").first().textContent()) ?? year);
    if (currentYear === year) break;
    await panel.getByRole("button", { name: currentYear > year ? "Ano anterior" : "Próximo ano" }).click();
  }

  await panel.getByRole("button", { name: monthNames[month - 1], exact: true }).click();
  await expect(panel).toHaveCount(0);
}

export async function chooseDate(page: Page, pickerId: string, dateValue: string) {
  const [yearText, monthText, dayText] = dateValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const picker = page.locator(`[data-date-picker="${pickerId}"]`);
  await picker.locator("[data-date-picker-trigger]").click();
  const panel = page.locator("[data-date-picker-panel]");
  await expect(panel).toBeVisible();

  for (let index = 0; index < 60; index += 1) {
    const currentTitle = (await panel.locator("p.text-lg").first().textContent()) ?? "";
    const currentDate = parsePtBrMonthTitle(currentTitle);
    if (currentDate.year === year && currentDate.month === month) break;
    const currentIndex = currentDate.year * 12 + currentDate.month;
    const targetIndex = year * 12 + month;
    await panel.getByRole("button", { name: currentIndex > targetIndex ? "Mês anterior" : "Próximo mês" }).click();
  }

  await panel.getByRole("button", { name: String(day), exact: true }).click();
  await expect(panel).toHaveCount(0);
}

export async function expectFloatingMonthPanel(page: Page) {
  const panel = page.locator("[data-month-picker-panel]");
  await expect(panel).toBeVisible();
  const result = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    return {
      clipped: rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight,
      topmost: Boolean(topElement && element.contains(topElement)),
      zIndex: Number.parseInt(window.getComputedStyle(element).zIndex || "0", 10),
    };
  });
  expect(result.clipped).toBe(false);
  expect(result.topmost).toBe(true);
  expect(result.zIndex).toBeGreaterThanOrEqual(1000);
}

export async function expectFloatingDatePanel(page: Page) {
  const panel = page.locator("[data-date-picker-panel]");
  await expect(panel).toBeVisible();
  const result = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    return {
      clipped: rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight,
      topmost: Boolean(topElement && element.contains(topElement)),
      zIndex: Number.parseInt(window.getComputedStyle(element).zIndex || "0", 10),
    };
  });
  expect(result.clipped).toBe(false);
  expect(result.topmost).toBe(true);
  expect(result.zIndex).toBeGreaterThanOrEqual(1000);
}

export async function seedCompactEntryList(context: Awaited<ReturnType<typeof createE2EUser>>, suffix = `${Date.now()}`) {
  const today = new Date();
  const otherDate = new Date(today);
  otherDate.setDate(today.getDate() === 1 ? today.getDate() + 1 : today.getDate() - 1);
  const monthValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayValue = formatDate(today);
  const otherDateValue = formatDate(otherDate);

  const { data: balance, error: balanceError } = await context.admin
    .from("monthly_balances")
    .upsert({ user_id: context.user.id, year: today.getFullYear(), month: today.getMonth() + 1, label: today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) }, { onConflict: "user_id,year,month" })
    .select("id")
    .single();
  if (balanceError || !balance) throw new Error(`Falha ao criar competência E2E: ${balanceError?.message ?? "sem retorno"}`);

  const { data: account, error: accountError } = await context.admin
    .from("accounts")
    .insert({ user_id: context.user.id, name: `Nubank E2E ${suffix}`, type: "personal", bank: "Nubank", description: null, initial_balance: 0, is_active: true, color: null, icon: null })
    .select("id,name")
    .single();
  if (accountError || !account) throw new Error(`Falha ao criar conta E2E: ${accountError?.message ?? "sem retorno"}`);

  const { data: categories, error: categoryError } = await context.admin
    .from("categories")
    .insert([
      { user_id: context.user.id, name: `Gastos variáveis E2E ${suffix}`, type: "expense", parent_id: null, icon: null, color: "#fb7185", is_default: false, is_active: true },
      { user_id: context.user.id, name: `Ganhos variáveis E2E ${suffix}`, type: "income", parent_id: null, icon: null, color: "#34d399", is_default: false, is_active: true },
    ])
    .select("id,name,type");
  if (categoryError || !categories) throw new Error(`Falha ao criar classificações E2E: ${categoryError?.message ?? "sem retorno"}`);

  const expenseCategory = categories.find((category) => category.type === "expense");
  const incomeCategory = categories.find((category) => category.type === "income");
  const plannedDescription = `Internet E2E ${suffix}`;
  const incomeDescription = `Cliente João E2E ${suffix}`;
  const expenseDescription = `Mercado E2E ${suffix}`;

  const { error: entriesError } = await context.admin.from("financial_entries").insert([
    {
      user_id: context.user.id,
      monthly_balance_id: balance.id,
      account_id: account.id,
      category_id: expenseCategory?.id ?? null,
      entry_type: "expense",
      status: "planned",
      description: plannedDescription,
      expected_amount: 119.9,
      actual_amount: null,
      due_date: todayValue,
      paid_date: null,
      source: "manual",
      recurring_rule_id: null,
      external_id: null,
      notes: null,
    },
    {
      user_id: context.user.id,
      monthly_balance_id: balance.id,
      account_id: account.id,
      category_id: expenseCategory?.id ?? null,
      entry_type: "expense",
      status: "paid",
      description: expenseDescription,
      expected_amount: 186.3,
      actual_amount: 186.3,
      due_date: todayValue,
      paid_date: todayValue,
      source: "manual",
      recurring_rule_id: null,
      external_id: null,
      notes: null,
    },
    {
      user_id: context.user.id,
      monthly_balance_id: balance.id,
      account_id: account.id,
      category_id: incomeCategory?.id ?? null,
      entry_type: "income",
      status: "paid",
      description: incomeDescription,
      expected_amount: 1500,
      actual_amount: 1500,
      due_date: otherDateValue,
      paid_date: otherDateValue,
      source: "manual",
      recurring_rule_id: null,
      external_id: null,
      notes: null,
    },
  ]);
  if (entriesError) throw new Error(`Falha ao criar lançamentos E2E: ${entriesError.message}`);

  return { monthValue, plannedDescription, incomeDescription, expenseDescription };
}

function parsePtBrMonthTitle(title: string) {
  const normalized = title.toLowerCase().trim();
  const [monthName = "", yearText = ""] = normalized.split(" de ");
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return { month: months.indexOf(monthName) + 1, year: Number(yearText) };
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
