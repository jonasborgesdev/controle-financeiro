import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const TEST_PASSWORD = "TesteSeguro123!";
const INTEGRATION_DOMAIN = "@controle-financeiro.test";

export function hasSupabaseTestEnv() {
  return Boolean(
    process.env["VITE_SUPABASE_URL"]
      && process.env["VITE_SUPABASE_ANON_KEY"]
      && (process.env["SUPABASE_TEST_SERVICE_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"]),
  );
}

export function disposableEmail(prefix: "it" | "e2e" = "it") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}${INTEGRATION_DOMAIN}`;
}

export function assertDisposableEmail(email: string, prefix: "it" | "e2e" = "it") {
  if (!email.startsWith(`${prefix}-`) || !email.endsWith(INTEGRATION_DOMAIN)) {
    throw new Error(`Email de teste inseguro: ${email}`);
  }
}

export function createAdminClient() {
  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_TEST_SERVICE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) throw new Error("Variáveis Supabase de teste ausentes.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonClient() {
  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["VITE_SUPABASE_ANON_KEY"];

  if (!url || !key) throw new Error("Variáveis públicas Supabase ausentes.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, storageKey: `it-${Math.random().toString(36).slice(2)}` },
  });
}

export async function createTestUser(prefix: "it" | "e2e" = "it") {
  const email = disposableEmail(prefix);
  assertDisposableEmail(email, prefix);
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Usuario ${prefix.toUpperCase()}` },
  });

  if (error || !data.user) throw new Error(`Falha ao criar usuário ${prefix}: ${error?.message ?? "sem retorno"}`);

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: `Usuario ${prefix.toUpperCase()}`,
    role: "user",
    avatar_url: null,
  });

  return { email, password: TEST_PASSWORD, user: data.user, admin };
}

export async function signInTestUser(email: string, password = TEST_PASSWORD) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Falha ao autenticar usuário de teste: ${error?.message ?? "sem usuário"}`);
  return { client, user: data.user };
}

export async function deleteTestUser(admin: SupabaseClient, user: User, prefix: "it" | "e2e" = "it") {
  if (!user.email) throw new Error("Usuário sem email não pode ser removido com segurança.");
  assertDisposableEmail(user.email, prefix);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Falha ao remover usuário de teste: ${error.message}`);
}
