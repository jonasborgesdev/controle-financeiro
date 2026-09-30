import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { monthKey, monthLabel, parseMonthKey, shiftMonth } from "@/lib/finance";

type MonthPickerProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  showArrows?: boolean;
};

export function MonthPicker({ id, label = "Mês", value, onChange, showArrows = true }: MonthPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { year, month } = parseMonthKey(value);
  const [panelYear, setPanelYear] = useState(year);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, width: 320 });

  useEffect(() => setPanelYear(year), [year]);

  useEffect(() => {
    if (!open) return;
    const updatePanelPosition = () => {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 16;
      const panelWidth = Math.min(Math.max(rect.width, 320), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - panelWidth - margin);
      const estimatedHeight = 330;
      const below = rect.bottom + 12;
      const preferredTop = below + estimatedHeight > window.innerHeight && rect.top > estimatedHeight
        ? rect.top - estimatedHeight - 12
        : below;
      const top = Math.min(Math.max(margin, preferredTop), Math.max(margin, window.innerHeight - estimatedHeight - margin));
      setPanelPosition({ top, left, width: panelWidth });
    };
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    updatePanelPosition();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  const selectMonth = (nextMonth: number) => {
    onChange(monthKey(panelYear, nextMonth));
    setOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative z-30 min-w-0" data-month-picker={id ?? label}>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor={id}>{label}</label>
      <div className="grid grid-cols-[auto_1fr_auto] items-center rounded-2xl border border-cyan-300/20 bg-slate-950/70 p-1.5 shadow-inner shadow-black/20 transition focus-within:border-cyan-300/60 focus-within:ring-3 focus-within:ring-cyan-300/20">
        {showArrows ? (
          <button type="button" onClick={() => onChange(shiftMonth(value, -1))} className="grid size-11 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Mês anterior">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : <span aria-hidden="true" className="size-11" />}

        <button id={id} type="button" onClick={() => setOpen((current) => !current)} className="group min-h-11 min-w-0 rounded-xl px-3 text-center transition hover:bg-cyan-300/[0.08] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label={`Escolher mês. Atual: ${monthLabel(year, month)}`} aria-expanded={open} data-month-picker-trigger>
          <span className="flex items-center justify-center gap-2 text-sm font-black capitalize tracking-[-0.02em] text-slate-50">
            <CalendarDays className="size-4 shrink-0 text-cyan-200 transition group-hover:text-cyan-100" aria-hidden="true" />
            <span className="truncate">{monthLabel(year, month)}</span>
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-medium text-slate-500">Clique para escolher</span>
        </button>

        {showArrows ? (
          <button type="button" onClick={() => onChange(shiftMonth(value, 1))} className="grid size-11 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Próximo mês">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        ) : <span aria-hidden="true" className="size-11" />}
      </div>

      {open ? createPortal(
        <div ref={panelRef} className="fixed z-[1200] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.5rem] border border-cyan-300/20 bg-[#080e1d] p-3 text-slate-50 shadow-2xl shadow-black/70" style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width }} data-month-picker-panel>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
            <button type="button" onClick={() => setPanelYear((current) => current - 1)} className="grid size-10 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Ano anterior">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">Escolher mês</p>
              <p className="text-lg font-black tracking-[-0.03em]">{panelYear}</p>
            </div>
            <button type="button" onClick={() => setPanelYear((current) => current + 1)} className="grid size-10 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Próximo ano">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {monthNames.map((monthName, index) => {
              const monthNumber = index + 1;
              const active = panelYear === year && monthNumber === month;
              return (
                <button key={monthName} type="button" onClick={() => selectMonth(monthNumber)} className={active ? "rounded-2xl bg-cyan-300 px-3 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/40" : "rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.10] hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30"}>
                  {monthName}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
