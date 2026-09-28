import { Link } from "@tanstack/react-router";
import LogoutButton from "@/components/auth/logout-button";

const navItems = [
  { to: "/", label: "Início" },
  { to: "/transacoes", label: "Ganhos/Gastos" },
  { to: "/recorrencias", label: "Recorrências" },
  { to: "/contas", label: "Contas" },
  { to: "/categorias", label: "Categorias" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ccfbf1_0,#f8fafc_32rem,#eef2ff_100%)] text-slate-950">
      <header className="sticky top-0 z-10 border-b border-white/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Fluxo mensal</p>
            <h1 className="text-xl font-bold tracking-[-0.03em] text-slate-950">Controle Financeiro</h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <nav className="flex gap-1 rounded-2xl bg-slate-950 p-1 shadow-xl shadow-slate-950/10">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white [&.active]:bg-white [&.active]:text-slate-950"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
