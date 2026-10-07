import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { createE2EUser, deleteE2EUser, hasE2EEnv, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("importacao autenticada", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("processa CSV, revisa e salva lancamentos importados", async ({ page }) => {
    const accountName = `Conta Importacao E2E ${Date.now()}`;
    const fixturePath = resolve("docs/amostras-importacao/nubank-exemplo.csv");

    await login(page, context.email, context.password);

    await page.getByRole("link", { name: "Contas" }).click();
    await page.getByRole("button", { name: "Nova conta" }).click();
    await page.getByLabel("Nome").fill(accountName);
    await page.getByLabel("Banco").fill("Nubank");
    await page.getByLabel("Saldo inicial").fill("0");
    await page.getByRole("button", { name: "Salvar conta" }).click();
    await expect(page.getByRole("heading", { name: accountName })).toBeVisible();

    await page.getByRole("link", { name: "Importar" }).click();
    await expect(page).toHaveURL(/\/importacao/);
    await page.locator("#import-account").selectOption({ label: accountName });
    await page.getByLabel("Banco").selectOption("nubank");
    await page.getByLabel("Arquivo CSV/OFX/PDF").setInputFiles(fixturePath);
    await page.getByRole("button", { name: "Processar" }).click();

    await expect(page.getByText("5 lançamento(s) encontrados. Revise antes de salvar.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "2. Revisar antes de salvar" })).toBeVisible();
    await expect(page.locator('input[value="iFood - Jantar"]')).toBeVisible();
    await expect(page.locator('input[value="PIX recebido cliente"]')).toBeVisible();

    await page.getByRole("button", { name: "Importar 5" }).click();

    await expect(page.getByText("5 lançamento(s) importados. Duplicatas e itens ignorados não foram salvos.")).toBeVisible();
    await expect(page.getByText("nubank-exemplo.csv")).toBeVisible();
    await expect(page.getByText("5 importados")).toBeVisible();

    await expect.poll(async () => {
      const { count } = await context.admin
        .from("financial_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", context.user.id)
        .eq("source", "imported");
      return count ?? 0;
    }).toBe(5);
  });
});
