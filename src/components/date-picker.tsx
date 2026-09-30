import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export function DatePicker({ id, label, value, onChange, required, disabled }: DatePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);
  const [panelMonth, setPanelMonth] = useState(() => new Date(selected.year, selected.month - 1, 1));
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, width: 320 });

  useEffect(() => {
    setPanelMonth(new Date(selected.year, selected.month - 1, 1));
  }, [selected.year, selected.month]);

  useEffect(() => {
    if (!open) return;
    const updatePanelPosition = () => {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 16;
      const panelWidth = Math.min(Math.max(rect.width, 320), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - panelWidth - margin);
      const estimatedHeight = 390;
      const below = rect.bottom + 12;
      const preferredTop = below + estimatedHeight > window.innerHeight && rect.top > estimatedHeight ? rect.top - estimatedHeight - 12 : below;
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

  const selectDate = (day: number) => {
    const next = formatDateValue(panelMonth.getFullYear(), panelMonth.getMonth() + 1, day);
    onChange(next);
    setOpen(false);
  };

  const days = getCalendarDays(panelMonth);
  const triggerLabel = value ? formatDateLabel(value) : "Selecionar data";

  return (
    <div ref={pickerRef} className="relative z-30 min-w-0" data-date-picker={id ?? label}>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor={`${id}-trigger`}>{label}</label>
      <button id={`${id}-trigger`} type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className="group min-h-14 w-full rounded-2xl border border-cyan-300/20 bg-slate-950/70 px-4 py-2 text-left shadow-inner shadow-black/20 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.06] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-slate-500" aria-label={`${label}. Atual: ${triggerLabel}`} aria-expanded={open} data-date-picker-trigger>
        <span className="flex items-center gap-2 text-sm font-black text-slate-50">
          <CalendarDays className="size-4 shrink-0 text-cyan-200" aria-hidden="true" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <span className="mt-0.5 block text-[0.68rem] font-medium text-slate-500">Clique para escolher</span>
      </button>
      <input id={`${id}-native`} type="date" value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {open ? createPortal(
        <div ref={panelRef} className="fixed z-[1200] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.5rem] border border-cyan-300/20 bg-[#080e1d] p-3 text-slate-50 shadow-2xl shadow-black/70" style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width }} data-date-picker-panel>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
            <button type="button" onClick={() => setPanelMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="grid size-10 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Mês anterior">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">Escolher data</p>
              <p className="text-lg font-black capitalize tracking-[-0.03em]">{monthTitle(panelMonth)}</p>
            </div>
            <button type="button" onClick={() => setPanelMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="grid size-10 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30" aria-label="Próximo mês">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.08em] text-cyan-200/80">
            {weekDays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} aria-hidden="true" className="h-10" />;
              const active = day === selected.day && panelMonth.getMonth() + 1 === selected.month && panelMonth.getFullYear() === selected.year;
              return (
                <button key={day} type="button" onClick={() => selectDate(day)} className={active ? "grid h-10 place-items-center rounded-xl bg-cyan-300 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/40" : "grid h-10 place-items-center rounded-xl border border-white/10 bg-slate-900 text-sm font-bold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.10] hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-300/30"}>
                  {day}
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

const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseDateValue(value: string) {
  const today = new Date();
  const [year, month, day] = value.split("-").map(Number);
  return { year: year || today.getFullYear(), month: month || today.getMonth() + 1, day: day || today.getDate() };
}

function formatDateValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
  const { year, month, day } = parseDateValue(value);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function getCalendarDays(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const totalDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return [...Array.from({ length: firstDay }, () => null), ...Array.from({ length: totalDays }, (_, index) => index + 1)];
}
