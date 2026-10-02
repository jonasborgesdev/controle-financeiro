import { expect, test } from "@playwright/test";
import { chooseMonth, createE2EUser, deleteE2EUser, hasE2EEnv, login } from "./helpers";

test.describe.configure({ mode: "serial" });

// Requer a migration 202610020001_transfers.sql aplicada no Supabase remoto
// (transfer_group_id + source='transfer').
test.describe("transferências entre contas", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;
  let originId = "";
  let destinationId = "";
  let monthValue = "";
  const suffix = `${Date.now()}`;
  const transferDescription = `Transferência E2E ${suffix}`;

  test.beforeAll(async () => {
    context = await createE2EUser();
    const today = new Date();
    monthValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const { data: balance, error: balanceError } = await context.admin
      .from("monthly_balances")
      .upsert({ user_id: context.user.id, year: today.getFullYear(), month: today.getMonth() + 1, label: today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) }, { onConflict: "user_id,year,month" })
      .select("id")
      .single();
    if (balanceError || !balance) throw new Error(`Falha ao criar competência E2E: ${balanceError?.message ?? "sem retorno"}`);

    const { data: accounts, error: accountsError } = await context.admin
      .from("accounts")
      .insert([
        { user_id: context.user.id, name: `Origem E2E ${suffix}`, type: "personal", bank: "Banco Teste", description: null, initial_balance: 1000, is_active: true, color: null, icon: null },
        { user_id: context.user.id, name: `Destino E2E ${suffix}`, type: "personal", bank: "Banco Teste", description: null, initial_balance: 0, is_active: true, color: null, icon: null },
      ])
      .select("id,name");
    if (accountsError || !accounts) throw new Error(`Falha ao criar contas E2E: ${accountsError?.message ?? "sem retorno"}`);
    originId = accounts.find((account) => account.name.startsWith("Origem"))!.id;
    destinationId = accounts.find((account) => account.name.startsWith("Destino"))!.id;
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("cria transferência, exibe o par e reflete em lançamentos sem inflar relatórios", async ({ page }) => {
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Transferências" }).first().click();
    await expect(page).toHaveURL(/\/transferencias/);
    await chooseMonth(page, "transfers-month", monthValue);

    await page.getByRole("button", { name: "Nova transferência" }).click();
    await expect(page.getByRole("dialog", { name: "Nova transferência" })).toBeVisible();

    await page.getByLabel("Conta origem").selectOption(originId);
    await page.getByLabel("Conta destino").selectOption(destinationId);
    await page.getByLabel("Valor").fill("250");
    await page.getByLabel("Descrição").fill(transferDescription);
    await page.getByRole("button", { name: "Criar transferência", exact: true }).click();

    const pairCard = page.locator("[data-testid='transfer-pair-card']", { hasText: transferDescription });
    await expect(pairCard).toBeVisible();
    await expect(pairCard.getByText("Transferência", { exact: true }).first()).toBeVisible();
    await expect(pairCard.getByText("R$ 250,00")).toBeVisible();

    // Os 2 lados aparecem em Lançamentos com badge, sem virar receita/despesa.
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).first().click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", monthValue);
    const rows = page.locator("[data-testid='entry-list-item']", { hasText: transferDescription });
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("Transferência", { exact: true }).first()).toBeVisible();

    // Relatórios mostram seção de movimentações internas fora dos totais reais.
    await page.getByRole("link", { name: "Relatórios" }).first().click();
    await expect(page).toHaveURL(/\/relatorios/);
    await expect(page.getByText("Movimentações internas no mês")).toBeVisible();
  });

  test("alterna status do par e exclui o par junto", async ({ page }) => {
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: "Transferências" }).first().click();
    await chooseMonth(page, "transfers-month", monthValue);

    const pairCard = page.locator("[data-testid='transfer-pair-card']", { hasText: transferDescription });
    await expect(pairCard).toBeVisible();

    await pairCard.getByRole("checkbox").click();
    await expect(pairCard.getByText("Previsto", { exact: true }).first()).toBeVisible();
    await pairCard.getByRole("checkbox").click();
    await expect(pairCard.getByText("Realizado", { exact: true }).first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await pairCard.getByRole("button", { name: `Excluir transferência ${transferDescription}` }).click();
    await expect(page.locator("[data-testid='transfer-pair-card']", { hasText: transferDescription })).toHaveCount(0);
  });
});
