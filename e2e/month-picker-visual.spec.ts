import { expect, test } from "@playwright/test";
import { createE2EUser, deleteE2EUser, expectFloatingDatePanel, expectFloatingMonthPanel, hasE2EEnv, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("seletor visual de mês", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("flutua acima dos cards no desktop sem cortar", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Ganhos/Gastos" }).click();
    await page.locator('[data-month-picker="entries-month"] [data-month-picker-trigger]').click();

    await expectFloatingMonthPanel(page);
    await expect(page.locator("[data-month-picker-panel]").getByRole("button", { name: "Set", exact: true })).toBeVisible();
  });

  test("flutua acima do modal em campos inicio e fim opcional", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Recorrências" }).click();
    await page.getByRole("button", { name: "Nova despesa fixa" }).click();
    await expect(page.getByRole("dialog", { name: "Nova recorrência" })).toBeVisible();

    await page.locator('[data-month-picker="start-month"] [data-month-picker-trigger]').click();
    await expectFloatingMonthPanel(page);
    await page.locator("[data-month-picker-panel]").getByRole("button", { name: "Out", exact: true }).click();

    await page.locator('[data-month-picker="end-month"] [data-month-picker-trigger]').click();
    await expectFloatingMonthPanel(page);
    await expect(page.locator("[data-month-picker-panel]").getByRole("button", { name: "Dez", exact: true })).toBeVisible();
  });

  test("calendario de data flutua acima do modal sem cortar", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Ganhos/Gastos" }).click();
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();

    await page.locator('[data-date-picker="due"] [data-date-picker-trigger]').click();
    await expectFloatingDatePanel(page);
    await expect(page.locator("[data-date-picker-panel]").getByRole("button", { name: "15", exact: true })).toBeVisible();
  });

  test("mantem painel dentro da viewport no mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);
    await page.locator('[data-month-picker="selected-month"] [data-month-picker-trigger]').click();

    await expectFloatingMonthPanel(page);
    await expect(page.locator("[data-month-picker-panel]").getByRole("button", { name: "Jan", exact: true })).toBeVisible();
  });
});
