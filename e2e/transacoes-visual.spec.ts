import { expect, test } from "@playwright/test";
import { chooseMonth, createE2EUser, deleteE2EUser, hasE2EEnv, login, seedCompactEntryList } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("visual da lista compacta de transações", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;
  let seed: Awaited<ReturnType<typeof seedCompactEntryList>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
    seed = await seedCompactEntryList(context, `visual-${Date.now()}`);
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("mobile exibe grupos, linhas compactas e menu sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", seed.monthValue);

    const list = page.getByTestId("compact-entry-list");
    await expect(list).toBeVisible();
    await expect(page.getByTestId("entry-date-group")).toHaveCount(2);
    await expect(page.getByText(/^Hoje,/)).toBeVisible();
    await expect(page.getByText(seed.incomeDescription)).toBeVisible();

    const row = page.getByText(seed.plannedDescription).locator("xpath=ancestor::*[@data-testid='entry-list-item'][1]");
    await expect(row.getByRole("checkbox")).toBeVisible();
    await expect(row.getByText("Previsto", { exact: true })).toBeVisible();
    await expect(row.getByText(/-R\$\s*119,90/).first()).toBeVisible();

    const rowBox = await row.boundingBox();
    expect(rowBox?.height ?? 999).toBeLessThan(112);
    expect(rowBox?.width ?? 0).toBeLessThanOrEqual(390);

    await row.getByLabel(`Ações do lançamento ${seed.plannedDescription}`).click();
    const menu = row.getByRole("button", { name: "Editar" }).locator("xpath=ancestor::div[contains(@class, 'absolute')][1]");
    await expect(menu).toBeVisible();
    const menuBox = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(menuBox.right).toBeLessThanOrEqual(390);
    expect(menuBox.left).toBeGreaterThanOrEqual(0);
  });

  test("desktop mantém densidade e valor alinhado à direita", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", seed.monthValue);

    const rows = page.getByTestId("entry-list-item");
    await expect(rows).toHaveCount(3);
    const firstRowBox = await rows.first().boundingBox();
    expect(firstRowBox?.height ?? 999).toBeLessThan(92);
    await expect(page.getByText(/\+R\$\s*1\.500,00/).last()).toBeVisible();
    await expect(page.getByText(/-R\$\s*186,30/).last()).toBeVisible();
  });
});
