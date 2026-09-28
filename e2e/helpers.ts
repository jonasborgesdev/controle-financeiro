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
  await expect(page.getByText("Previsto e realizado no mesmo lugar.")).toBeVisible();
}
