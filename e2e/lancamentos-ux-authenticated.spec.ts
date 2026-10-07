import { expect, test } from "@playwright/test";
import { chooseAccountScope, chooseDate, chooseMonth, createE2EUser, deleteE2EUser, hasE2EEnv, login, seedCompactEntryList } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("lançamentos UX (Semana 10.4)", () => {
  test.skip(!hasE2EEnv(), "E2E autenticado requer VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e service key de teste.");

  let context: Awaited<ReturnType<typeof createE2EUser>>;
  let seed: Awaited<ReturnType<typeof seedCompactEntryList>>;

  test.beforeAll(async () => {
    context = await createE2EUser();
    seed = await seedCompactEntryList(context, `ux-${Date.now()}`);
  });

  test.afterAll(async () => {
    if (context) await deleteE2EUser(context);
  });

  test("barra de resumo sticky usa os mesmos valores dos cards e acompanha a rolagem", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", seed.monthValue);

    const bar = page.getByTestId("sticky-summary-bar");
    await expect(bar).toBeVisible();

    // Valores idênticos ao card Saldo (mesma fonte summary).
    const saldoCard = page.locator('[data-testid="summary-card"][data-summary-title="Saldo"]');
    await expect(saldoCard).toBeVisible();
    const cardActual = (await saldoCard.locator("p.text-xl").first().innerText()).trim();
    const barActual = (await page.getByTestId("sticky-actual-balance").innerText()).trim();
    expect(barActual).toBe(cardActual);
    const cardText = await saldoCard.innerText();
    const barPlanned = (await page.getByTestId("sticky-expected-balance").innerText()).trim();
    expect(cardText).toContain(`Previsto: ${barPlanned}`);

    // Contadores refletem a lista (2 pagos, 1 previsto no seed).
    await expect(page.getByTestId("sticky-paid-count")).toHaveText("2");
    await expect(page.getByTestId("sticky-planned-count")).toHaveText("1");

    // Rolar até o fim: barra visível, abaixo do header e acima da bottom nav.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bar).toBeVisible();
    const barBox = await bar.boundingBox();
    const headerBox = await page.locator("header").boundingBox();
    const navBox = await page.locator('nav[aria-label="Navegação principal mobile"]').boundingBox();
    expect(barBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(barBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(navBox!.y + 1);

    // Acompanha o mês selecionado.
    const [previousYear, previousMonth] = seed.monthValue.split("-").map(Number);
    const previousDate = new Date(previousYear!, previousMonth! - 2, 1);
    const previousValue = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
    await chooseMonth(page, "entries-month", previousValue);
    await expect(page.getByTestId("sticky-paid-count")).toHaveText("0");
    await expect(page.getByTestId("sticky-planned-count")).toHaveText("0");
  });

  test("marcar como realizado abre confirmação pré-preenchida e grava valor/data editados uma única vez", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes/);
    await chooseMonth(page, "entries-month", seed.monthValue);

    await page.getByLabel(`Marcar ${seed.plannedDescription} como realizado`).click();
    const dialog = page.getByRole("dialog", { name: "Confirmar realização" });
    await expect(dialog).toBeVisible();

    // Pré-preenchido: valor = expected_amount, data = hoje.
    await expect(page.locator("#confirm-amount")).toHaveValue("119.9");
    await expect(page.locator('[data-date-picker="confirm-paid-date"] [data-date-picker-trigger]')).toContainText(/de out\. de 2026|de out de 2026/);

    // Cancelar não altera nada.
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    const row = page.getByText(seed.plannedDescription).locator("xpath=ancestor::*[@data-testid='entry-list-item'][1]");
    await expect(row.getByText("Previsto", { exact: true })).toBeVisible();

    // Erro de validação aparece no próprio modal.
    await page.getByLabel(`Marcar ${seed.plannedDescription} como realizado`).click();
    await expect(dialog).toBeVisible();
    await page.locator("#confirm-amount").fill("0");
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/valor real válido/i);
    await expect(dialog).toBeVisible();

    // Confirmar com valor e data alterados.
    const today = new Date();
    const targetDay = today.getDate() === 1 ? 2 : 1;
    const targetDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
    await page.locator("#confirm-amount").fill("95.5");
    await chooseDate(page, "confirm-paid-date", targetDate);
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByText("Realizado", { exact: true })).toBeVisible();

    // Gravação única e correta no banco.
    const { data: saved, error } = await context.admin
      .from("financial_entries")
      .select("status,actual_amount,paid_date")
      .eq("user_id", context.user.id)
      .eq("description", seed.plannedDescription)
      .single();
    expect(error).toBeNull();
    expect(saved?.status).toBe("paid");
    expect(Number(saved?.actual_amount)).toBe(95.5);
    expect(saved?.paid_date).toBe(targetDate);
  });

  test("menu rápido mobile abre o formulário certo em qualquer tela e consome o parâmetro", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);

    // Conta do contexto atual entra pré-selecionada no formulário.
    const { data: account } = await context.admin
      .from("accounts")
      .select("id")
      .eq("user_id", context.user.id)
      .single();
    await chooseAccountScope(page, account!.id);

    // A partir do Dashboard (outra tela), o + abre o menu.
    await page.getByTestId("quick-add-mobile").click();
    const sheet = page.getByRole("dialog", { name: "Adicionar rápido" });
    await expect(sheet).toBeVisible();
    await page.getByTestId("quick-add-gasto").click();
    await expect(page).toHaveURL(/\/transacoes$/);
    const entryModal = page.getByRole("dialog", { name: "Novo lançamento" });
    await expect(entryModal).toBeVisible();
    await expect(page.locator("#entry-type")).toHaveValue("expense");
    await expect(page.locator("#account")).toHaveValue(account!.id);
    await expect(page).not.toHaveURL(/novo=/);
    await entryModal.getByText("Fechar").click();

    // Ganho abre o formulário com tipo entrada.
    await page.getByTestId("quick-add-mobile").click();
    await page.getByTestId("quick-add-ganho").click();
    await expect(page).toHaveURL(/\/transacoes$/);
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
    await expect(page.locator("#entry-type")).toHaveValue("income");
    await page.getByText("Fechar").click();

    // Transferência abre a tela certa.
    await page.getByTestId("quick-add-mobile").click();
    await page.getByTestId("quick-add-transferencia").click();
    await expect(page).toHaveURL(/\/transferencias$/);
    await expect(page.getByRole("dialog", { name: "Nova transferência" })).toBeVisible();
    await expect(page).not.toHaveURL(/novo=/);
    await page.getByText("Fechar").click();
  });

  test("deep-link ?novo= consome o parâmetro uma vez e permite reabertura normal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);
    await page.getByRole("link", { name: /Ganhos\/Gastos|Lançamentos/ }).click();
    await expect(page).toHaveURL(/\/transacoes$/);

    // O parâmetro abre o formulário e sai da URL (replace) — mecanismo que
    // impede reabertura no voltar/recarregar.
    await page.getByTestId("quick-add-mobile").click();
    await page.getByTestId("quick-add-ganho").click();
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
    await expect(page.locator("#entry-type")).toHaveValue("income");
    await expect(page).toHaveURL(/\/transacoes$/);
    await expect(page).not.toHaveURL(/novo=/);
    await page.getByText("Fechar").click();

    // Segunda abertura funciona normalmente (sem loop, sem estado preso).
    await page.getByTestId("quick-add-mobile").click();
    await page.getByTestId("quick-add-gasto").click();
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
    await expect(page.locator("#entry-type")).toHaveValue("expense");
    await expect(page).not.toHaveURL(/novo=/);
    await page.getByText("Fechar").click();
  });

  test("voltar/avançar após abrir via menu rápido não reabre o formulário", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, context.email, context.password);

    // Único push de histórico: dashboard → menu rápido → /transacoes.
    await page.getByTestId("quick-add-mobile").click();
    await page.getByTestId("quick-add-gasto").click();
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
    await expect(page).toHaveURL(/\/transacoes$/);
    await expect(page).not.toHaveURL(/novo=/);
    await page.getByText("Fechar").click();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/\/transacoes$/);
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toHaveCount(0);
  });

  test("desktop exibe FAB no canto inferior direito sem sobrepor a sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, context.email, context.password);

    const fab = page.getByTestId("quick-add-desktop");
    await expect(fab).toBeVisible();
    const fabBox = await fab.boundingBox();
    const sidebarBox = await page.locator("aside").first().boundingBox();
    expect(fabBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    // FAB à direita da sidebar e dentro da viewport.
    expect(fabBox!.x).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width);
    expect(fabBox!.x + fabBox!.width).toBeLessThanOrEqual(1366);
    expect(fabBox!.y + fabBox!.height).toBeLessThanOrEqual(768);

    // Mesmo menu do mobile.
    await fab.click();
    await expect(page.getByRole("dialog", { name: "Adicionar rápido" })).toBeVisible();
    await page.getByTestId("quick-add-ganho").click();
    await expect(page).toHaveURL(/\/transacoes$/);
    await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
    await expect(page.locator("#entry-type")).toHaveValue("income");
  });
});
