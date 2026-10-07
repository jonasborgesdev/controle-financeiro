import { expect, test } from "@playwright/test";
import { chooseAccountScope, createE2EUser, deleteE2EUser, hasE2EEnv, login, seedCompactEntryList } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("seletor global de conta", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;
  let seeded: Awaited<ReturnType<typeof seedCompactEntryList>>;
  let accountId = "";

  test.beforeAll(async () => {
    context = await createE2EUser();
    seeded = await seedCompactEntryList(context);

    const { data: accounts } = await context.admin
      .from("accounts")
      .select("id")
      .eq("user_id", context.user.id)
      .eq("is_active", true)
      .limit(1)
      .single();
    if (!accounts) throw new Error("Nenhuma conta encontrada para o teste.");
    accountId = accounts.id;
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("alternar conta filtra Lançamentos", async ({ page }) => {
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).first().click();
    await expect(page).toHaveURL(/\/transacoes/);

    const entryRow = page.locator("[data-testid='entry-list-item']", { hasText: seeded.expenseDescription });
    await expect(entryRow).toBeVisible();

    // Seleciona a conta do lançamento — o item continua visível
    await chooseAccountScope(page, accountId);
    await expect(entryRow).toBeVisible();

    // Volta para "Todas as contas" — o item continua visível
    await chooseAccountScope(page, "all");
    await expect(entryRow).toBeVisible();
  });

  test("pré-seleciona conta global ao criar novo lançamento", async ({ page }) => {
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).first().click();
    await expect(page).toHaveURL(/\/transacoes/);

    await chooseAccountScope(page, accountId);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await expect(page.locator("#account")).toHaveValue(accountId);
  });

  test("seletor global persiste entre rotas", async ({ page }) => {
    await login(page, context.email, context.password);
    await chooseAccountScope(page, accountId);

    await page.getByRole("link", { name: "Transferências" }).first().click();
    await expect(page).toHaveURL(/\/transferencias/);
    await expect(page.locator("#global-account-desktop, #global-account-mobile").first()).toHaveValue(accountId);

    await page.getByRole("link", { name: "Relatórios" }).first().click();
    await expect(page).toHaveURL(/\/relatorios/);
    await expect(page.locator("#global-account-desktop, #global-account-mobile").first()).toHaveValue(accountId);
  });
});
