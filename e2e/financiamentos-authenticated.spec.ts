import { expect, test } from "@playwright/test";
import { createE2EUser, deleteE2EUser, hasE2EEnv, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("financiamentos autenticado", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("cadastra financiamento, gera parcela, evita duplicidade e marca como paga", async ({ page }) => {
    const now = Date.now();
    const accountName = `Conta Financiamento E2E ${now}`;
    const categoryName = `Financiamento E2E ${now}`;
    const financingName = `Carro E2E ${now}`;
    const installmentDescription = `Parcela 4/24 financiamento: ${financingName}`;

    await login(page, context.email, context.password);

    await page.getByRole("link", { name: "Contas" }).click();
    await page.getByRole("button", { name: "Nova conta" }).click();
    await page.getByLabel("Nome").fill(accountName);
    await page.getByLabel("Banco").fill("Banco E2E");
    await page.getByLabel("Saldo inicial").fill("0");
    await page.getByRole("button", { name: "Salvar conta" }).click();
    await expect(page.getByText(accountName)).toBeVisible();

    await page.getByRole("link", { name: "Categorias" }).click();
    await page.getByRole("button", { name: "Nova classificação de gasto" }).click();
    await page.getByRole("dialog", { name: "Nova classificação de gasto" }).getByLabel("Nome").fill(categoryName);
    await page.getByRole("dialog", { name: "Nova classificação de gasto" }).getByRole("button", { name: "Salvar classificação" }).click();
    await expect(page.getByText(categoryName)).toBeVisible();

    await page.getByRole("link", { name: "Financiamentos" }).click();
    await expect(page).toHaveURL(/\/financiamentos/);
    await page.getByRole("button", { name: "Cadastrar financiamento" }).click();

    const dialog = page.getByRole("dialog", { name: "Cadastrar financiamento" });
    await dialog.getByLabel("Nome").fill(financingName);
    await dialog.getByLabel("Conta").selectOption({ label: accountName });
    await dialog.getByLabel("Classificação").selectOption({ label: categoryName });
    await dialog.getByLabel("Valor original").fill("24000");
    await dialog.getByLabel("Valor da parcela").fill("1000");
    await dialog.getByLabel("Total parcelas").fill("24");
    await dialog.getByLabel("Pagas").fill("3");
    await dialog.getByLabel("Dia vencimento").fill("10");
    await dialog.getByLabel("Data de início").fill("2026-01-10");
    await dialog.getByRole("button", { name: "Salvar financiamento" }).click();

    const financingCard = page.getByText(financingName).locator("xpath=ancestor::div[@data-slot='card'][1]");
    await expect(financingCard).toBeVisible();
    await expect(financingCard.getByText("3/24 pagas")).toBeVisible();
    await expect(financingCard.getByText("21 restante(s) · 13%")).toBeVisible();
    await expect(financingCard.getByText("R$ 21.000,00")).toBeVisible();

    await page.locator('input[type="month"]').fill("2026-10");
    await expect(page.locator('input[type="month"]')).toHaveValue("2026-10");
    await page.getByRole("button", { name: "Gerar parcela deste mês" }).click();
    await expect(financingCard.getByText("Gerada como prevista.")).toBeVisible();
    await expect(financingCard.getByRole("button", { name: "Gerar parcela deste mês" })).toBeDisabled();

    await financingCard.getByRole("button", { name: "Marcar como paga" }).click();
    const paymentDialog = page.getByRole("dialog", { name: "Confirmar pagamento" });
    await expect(paymentDialog.getByLabel("Data de pagamento")).toBeVisible();
    await expect(paymentDialog.getByLabel("Valor pago")).toHaveValue("1000");
    await paymentDialog.getByLabel("Data de pagamento").fill("2026-09-30");
    await paymentDialog.getByLabel("Valor pago").fill("990");
    await paymentDialog.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(financingCard.getByText("4/24 pagas")).toBeVisible();
    await expect(financingCard.getByText("Gerada como realizada.")).toBeVisible();

    await expect.poll(async () => {
      const { count } = await context.admin
        .from("financial_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", context.user.id)
        .eq("source", "financing")
        .eq("description", installmentDescription);
      return count ?? 0;
    }).toBe(1);

    const { data: entries, error } = await context.admin
      .from("financial_entries")
      .select("status,actual_amount,due_date,paid_date,financing_id,installment_year,installment_month")
      .eq("user_id", context.user.id)
      .eq("source", "financing")
      .eq("description", installmentDescription);

    expect(error).toBeNull();
    expect(entries?.[0]).toMatchObject({ status: "paid", actual_amount: 990, due_date: "2026-10-10", paid_date: "2026-09-30", installment_year: 2026, installment_month: 10 });
    expect(entries?.[0]?.financing_id).toBeTruthy();

    await page.getByRole("link", { name: "Ganhos/Gastos" }).click();
    await page.locator('input[type="month"]').fill("2026-09");
    await expect(page.getByText(installmentDescription)).toBeVisible();

    await page.locator('input[type="month"]').fill("2026-10");
    await expect(page.getByText(installmentDescription)).toHaveCount(0);
  });
});
