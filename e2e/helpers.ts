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

function parsePtBrMonthTitle(title: string) {
  const normalized = title.toLowerCase().trim();
  const [monthName = "", yearText = ""] = normalized.split(" de ");
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return { month: months.indexOf(monthName) + 1, year: Number(yearText) };
}
