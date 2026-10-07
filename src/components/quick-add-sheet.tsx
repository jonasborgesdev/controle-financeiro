import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, TrendingDown, TrendingUp, X } from "lucide-react";
import { quickAddRoute, type QuickAddKind } from "@/lib/quick-add";

type QuickAddOption = {
  kind: QuickAddKind;
  label: string;
  description: string;
  icon: typeof TrendingUp;
  testId: string;
};

const quickAddOptions: QuickAddOption[] = [
  { kind: "gasto", label: "Novo gasto", description: "Registrar uma saída", icon: TrendingDown, testId: "quick-add-gasto" },
  { kind: "ganho", label: "Novo ganho", description: "Registrar uma entrada", icon: TrendingUp, testId: "quick-add-ganho" },
  { kind: "transferencia", label: "Nova transferência", description: "Mover valor entre contas", icon: ArrowLeftRight, testId: "quick-add-transferencia" },
];

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (kind: QuickAddKind) => {
    const route = quickAddRoute(kind);
    onClose();
    void navigate({ to: route.to, search: route.search });
  };

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-end sm:justify-end sm:p-6" role="dialog" aria-modal="true" aria-label="Adicionar rápido">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar menu de adicionar" onClick={onClose} />
      <div className="finance-glass-strong safe-pb relative w-full max-w-md rounded-t-[2rem] p-4 sm:mb-2 sm:mr-2 sm:w-80 sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Acesso rápido</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.04em] text-white">O que você quer lançar?</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/35" aria-label="Fechar">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {quickAddOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                data-testid={option.testId}
                onClick={() => handleSelect(option.kind)}
                className="group flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-left transition hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/35"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/20 transition group-hover:bg-emerald-400 group-hover:text-[#02140f]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{option.label}</span>
                  <span className="block text-xs text-slate-400">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
