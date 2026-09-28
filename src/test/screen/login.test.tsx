import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/features/auth/login-page";

const signInWithPassword = vi.fn();
const navigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    useNavigate: () => navigate,
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    navigate.mockReset();
  });

  it("renderiza os campos principais da tela de login", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Controle Financeiro" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("envia email e senha para o Supabase e navega para o inicio", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText("Email"), "jonas@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha-segura");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({ email: "jonas@example.com", password: "senha-segura" });
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("mostra erro de login sem navegar", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Credenciais invalidas" } });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText("Email"), "jonas@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha-errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Credenciais invalidas")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
