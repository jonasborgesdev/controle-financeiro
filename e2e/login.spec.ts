import { expect, test } from "@playwright/test";

test("redireciona visitante para login e exibe a tela inicial de acesso", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Controle Financeiro" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("mantem usuario na tela de login quando credenciais sao invalidas", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("e2e-controle-financeiro@example.test");
  await page.getByLabel("Senha").fill("senha-invalida");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/invalid|credenciais|login|email/i)).toBeVisible();
});
