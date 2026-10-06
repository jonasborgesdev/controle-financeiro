import { expect, test } from "@playwright/test";
import { chooseMonth, createE2EUser, deleteE2EUser, hasE2EEnv, login, seedCompactEntryList } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("lista compacta de lançamentos", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("alterna status, edita pelo menu e exclui pelo menu secundário", async ({ page }) => {
    const seed = await seedCompactEntryList(context, `fluxo-${Date.now()}`);

    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", seed.monthValue);

    const row = page.getByText(seed.plannedDescription).locator("xpath=ancestor::*[@data-testid='entry-list-item'][1]");
    await expect(row).toBeVisible();
    await expect(row.getByText("Previsto", { exact: true })).toBeVisible();

    // Semana 10.4: marcar abre o modal de confirmação (não grava direto).
    await page.getByLabel(`Marcar ${seed.plannedDescription} como realizado`).click();
    const confirmDialog = page.getByRole("dialog", { name: "Confirmar realização" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(row.getByText("Realizado", { exact: true })).toBeVisible();

    // Semana 10.4: desmarcar pede confirmação simples.
    await page.getByLabel(`Voltar ${seed.plannedDescription} para previsto`).click();
    const revertDialog = page.getByRole("dialog", { name: "Voltar para previsto" });
    await expect(revertDialog).toBeVisible();
    await revertDialog.getByRole("button", { name: "Voltar para previsto" }).click();
    await expect(row.getByText("Previsto", { exact: true })).toBeVisible();

    await row.getByLabel(`Ações do lançamento ${seed.plannedDescription}`).click();
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("dialog", { name: "Editar lançamento" })).toBeVisible();
    await page.getByText("Fechar").click();

    await row.getByLabel(`Ações do lançamento ${seed.plannedDescription}`).click();
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText(seed.plannedDescription)).toHaveCount(0);
  });
});
