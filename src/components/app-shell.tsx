import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Banknote, BarChart3, CalendarClock, CircleDollarSign, CreditCard, Home, Layers3, Plus, ReceiptText, Settings, Sparkles, Upload, X } from "lucide-react";
import LogoutButton from "@/components/auth/logout-button";

const navItems = [
  { to: "/", label: "Início", icon: Home },
  { to: "/transacoes", label: "Lançamentos", icon: ReceiptText },
  { to: "/planejamento", label: "Planejamento", icon: BarChart3 },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/financiamentos", label: "Financiamentos", icon: Banknote },
  { to: "/importacao", label: "Importar", icon: Upload },
  { to: "/recorrencias", label: "Recorrências", icon: CalendarClock },
  { to: "/contas", label: "Contas", icon: CreditCard },
  { to: "/categorias", label: "Categorias", icon: Layers3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const moreItems = navItems.slice(3);

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const currentItem = navItems.find((item) => item.to === pathname) ?? navItems[0];
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-hidden text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(16,185,129,0.18),transparent_24rem),radial-gradient(circle_at_86%_8%,rgba(34,211,238,0.14),transparent_26rem),linear-gradient(180deg,#070A0F_0%,#0A1018_48%,#070A0F_100%)]" />
      <div className="mx-auto grid min-h-screen w-full max-w-[92rem] lg:grid-cols-[17rem_1fr]">
        <aside className="safe-pt hidden min-h-screen p-4 lg:block">
          <div className="finance-glass sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-[1.75rem] p-4">
            <div className="flex items-center gap-3 px-2 py-2">
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-400 text-[#02140f] shadow-lg shadow-emerald-950/30">
                <CircleDollarSign className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Private OS</p>
                <h1 className="text-lg font-bold tracking-[-0.03em] text-white">Financeiro</h1>
              </div>
            </div>

            <nav className="mt-8 grid gap-1" aria-label="Navegação principal">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-label={item.to === "/transacoes" ? "Ganhos/Gastos" : undefined}
                    className="group flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.07] hover:text-white [&.active]:bg-white/[0.10] [&.active]:text-white"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-white/[0.06] text-cyan-100 transition group-hover:text-cyan-200 group-[.active]:bg-emerald-400 group-[.active]:text-[#02140f]">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto space-y-4 rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 text-[#f5c76b]" aria-hidden="true" />
                <p className="text-sm leading-5 text-slate-300">Integrações opcionais entram só depois de revisão e sem expor chaves no app.</p>
              </div>
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="safe-pt sticky top-0 z-30 border-b border-white/10 bg-[#070a0f]/78 px-4 pb-3 backdrop-blur-2xl lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Controle Financeiro</p>
                <h1 className="text-xl font-bold tracking-[-0.04em] text-white">{currentItem.label}</h1>
              </div>
              <LogoutButton />
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden" aria-label="Navegação principal mobile">
        <div className="finance-glass mx-auto grid max-w-md grid-cols-5 items-center rounded-[1.7rem] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <MobileNavLink to="/" label="Início" icon={Home} />
          <MobileNavLink to="/transacoes" label="Lançamentos" icon={ReceiptText} />
          <Link to="/transacoes" className="mx-auto -mt-8 grid size-16 place-items-center rounded-full bg-emerald-400 text-[#02140f] shadow-2xl shadow-emerald-950/40 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/35" aria-label="Adicionar lançamento">
            <Plus className="size-7" aria-hidden="true" />
          </Link>
          <MobileNavLink to="/planejamento" label="Planejar" icon={BarChart3} />
          <button type="button" onClick={() => setMoreOpen(true)} className="group grid min-h-14 place-items-center gap-1 rounded-2xl px-1 text-[0.68rem] font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/35" aria-haspopup="dialog" aria-expanded={moreOpen} aria-label="Abrir mais opções">
            <Layers3 className="size-5" aria-hidden="true" />
            <span>Mais</span>
          </button>
        </div>
        <div className="sr-only">
          {moreItems.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções de navegação">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar menu" onClick={() => setMoreOpen(false)} />
          <div className="finance-glass-strong safe-pb absolute inset-x-3 bottom-3 rounded-[2rem] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Menu completo</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.04em] text-white">Todas as áreas do app</h2>
                <p className="mt-1 text-sm text-slate-400">Mesmas opções disponíveis no desktop.</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-200" aria-label="Fechar menu">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white transition hover:bg-white/[0.10] [&.active]:border-emerald-300/30 [&.active]:bg-white/[0.10]">
                    <span className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-cyan-100 group-[.active]:bg-emerald-400 group-[.active]:text-[#02140f]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-500">Abrir</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavLink({ to, label, icon: Icon }: { to: "/" | "/transacoes" | "/planejamento"; label: string; icon: typeof Home }) {
  return (
    <Link to={to} className="group grid min-h-14 place-items-center gap-1 rounded-2xl px-1 text-[0.68rem] font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white [&.active]:text-white">
      <Icon className="size-5 group-[.active]:text-emerald-300" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
