import { expect, test } from "@playwright/test";
import { chooseDate, chooseMonth, createE2EUser, deleteE2EUser, hasE2EEnv, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("fluxo financeiro autenticado", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("cria conta e lançamento pago pela interface", async ({ page }) => {
    const accountName = `Conta E2E ${Date.now()}`;
    const entryDescription = `Receita E2E ${Date.now()}`;
    const now = new Date();
    const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    await login(page, context.email, context.password);

    await page.getByRole("link", { name: "Contas" }).click();
    await expect(page).toHaveURL(/\/contas/);
    await page.getByRole("button", { name: "Nova conta" }).click();
    const accountDialog = page.getByRole("dialog", { name: "Nova conta" });
    await expect(accountDialog.getByLabel("Nome")).toBeVisible();
    await expect(accountDialog.getByLabel("Banco")).toBeVisible();
    await expect(accountDialog.getByLabel("Saldo inicial")).toBeVisible();
    await expect(accountDialog.getByLabel("Tipo")).toHaveCount(0);
    await expect(accountDialog.getByLabel("Descrição")).toHaveCount(0);
    await expect(accountDialog.getByLabel("Cor")).toHaveCount(0);
    await expect(accountDialog.getByLabel("Ícone")).toHaveCount(0);
    await page.getByLabel("Nome").fill(accountName);
    await page.getByLabel("Banco").fill("Banco E2E");
    await page.getByLabel("Saldo inicial").fill("123.45");
    await page.getByRole("button", { name: "Salvar conta" }).click();
    await expect(page.getByRole("heading", { name: accountName })).toBeVisible();
    await expect(page.getByText("Saldo previsto", { exact: true })).toBeVisible();
    await expect(page.getByText(/123,45/).first()).toBeVisible();

    await page.getByRole("link", { name: "Ganhos/Gastos" }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Tipo").selectOption("income");
    await page.getByLabel("Status").selectOption("paid");
    await page.getByLabel("Descrição").fill(entryDescription);
    await page.getByLabel("Valor previsto").fill("1000");
    await page.getByLabel("Valor real").fill("950");
    await chooseDate(page, "due", entryDate);
    await chooseDate(page, "paid-date", entryDate);
    await page.locator("#account").selectOption({ label: accountName });
    await page.getByRole("button", { name: "Salvar lançamento" }).click();

    const entryRow = page.getByText(entryDescription).locator("xpath=ancestor::*[@data-testid='entry-list-item'][1]");
    await expect(entryRow).toBeVisible();
    await expect(entryRow.getByText("Realizado", { exact: true })).toBeVisible();
    await expect(entryRow.getByText(/\+R\$\s*950,00/).last()).toBeVisible();
  });

  test("cria conta com saldo inicial negativo pela interface", async ({ page }) => {
    const accountName = `Conta Negativa E2E ${Date.now()}`;

    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Contas" }).click();
    await expect(page).toHaveURL(/\/contas/);
    await page.getByRole("button", { name: "Nova conta" }).click();
    await page.getByLabel("Nome").fill(accountName);
    await page.getByLabel("Banco").fill("Banco Cheque Especial");
    await page.getByLabel("Saldo inicial").fill("-500");
    await page.getByRole("button", { name: "Salvar conta" }).click();

    await expect(page.getByRole("heading", { name: accountName })).toBeVisible();
    await expect(page.getByText(/-R\$\s*500,00/).first()).toBeVisible();
  });

  test("cria recorrência e gera lançamentos mensais sem erro", async ({ page }) => {
    const ruleDescription = `Internet E2E ${Date.now()}`;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const middle = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 1);
    const formatMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Recorrências" }).click();
    await expect(page).toHaveURL(/\/recorrencias/);
    await page.getByRole("button", { name: "Nova despesa fixa" }).click();
    await page.getByLabel("Descrição").fill(ruleDescription);
    await page.getByLabel("Valor previsto").fill("120");
    await page.getByLabel("Dia do mês").fill("31");
    await chooseMonth(page, "start-month", formatMonth(start));
    await chooseMonth(page, "end-month", formatMonth(end));
    await page.getByRole("button", { name: "Salvar e gerar lançamentos" }).click();

    await expect(page.getByText(ruleDescription)).toBeVisible();
    await expect(page.getByText("R$ 120,00")).toBeVisible();

    await expect.poll(async () => {
      const { count } = await context.admin
        .from("financial_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", context.user.id)
        .eq("description", ruleDescription)
        .eq("source", "recurring");
      return count ?? 0;
    }).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Ganhos/Gastos" }).click();
    await chooseMonth(page, "entries-month", formatMonth(middle));
    await expect(page.getByRole("button", { name: new RegExp(monthLabelRegex(formatMonth(middle)), "i") })).toBeVisible();
  });

  test("cria classificações simples de ganho e gasto pela interface", async ({ page }) => {
    const incomeClassificationName = `Ganhos E2E ${Date.now()}`;
    const expenseClassificationName = `Gastos E2E ${Date.now()}`;

    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Categorias" }).click();
    await expect(page).toHaveURL(/\/categorias/);
    await expect(page.getByText("Ganhos", { exact: true })).toBeVisible();
    await expect(page.getByText("Gastos", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Nova classificação de ganho" }).click();
    const incomeDialog = page.getByRole("dialog", { name: "Nova classificação de ganho" });
    await expect(incomeDialog.getByLabel("Nome")).toBeVisible();
    await expect(incomeDialog.getByLabel("Tipo")).toHaveCount(0);
    await expect(incomeDialog.getByLabel("Categoria pai")).toHaveCount(0);
    await expect(incomeDialog.getByLabel("Cor")).toHaveCount(0);
    await expect(incomeDialog.getByLabel("Ícone")).toHaveCount(0);
    await incomeDialog.getByLabel("Nome").fill(incomeClassificationName);
    await incomeDialog.getByRole("button", { name: "Salvar classificação" }).click();

    await expect(page.getByText(incomeClassificationName)).toBeVisible();
    await expect(page.getByText("Ganho", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Nova classificação de gasto" }).click();
    const categoryDialog = page.getByRole("dialog", { name: "Nova classificação de gasto" });
    await expect(categoryDialog.getByLabel("Nome")).toBeVisible();
    await expect(categoryDialog.getByLabel("Tipo")).toHaveCount(0);
    await expect(categoryDialog.getByLabel("Categoria pai")).toHaveCount(0);
    await expect(categoryDialog.getByLabel("Cor")).toHaveCount(0);
    await expect(categoryDialog.getByLabel("Ícone")).toHaveCount(0);
    await categoryDialog.getByLabel("Nome").fill(expenseClassificationName);
    await categoryDialog.getByRole("button", { name: "Salvar classificação" }).click();

    await expect(page.getByText(expenseClassificationName)).toBeVisible();
    await expect(page.getByText("Gasto", { exact: true }).first()).toBeVisible();
  });
});

function monthLabelRegex(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", " de ");
}
