// Semana 10.4 — Acesso rápido global (QuickAddSheet).
//
// O botão central da bottom nav (mobile) e o FAB desktop abrem um menu que
// navega para /transacoes?novo=gasto|ganho ou /transferencias?novo=1. As rotas
// consomem o parâmetro uma única vez e o removem da URL (replace) para não
// reabrir o formulário no voltar/recarregar.

export type QuickAddKind = "gasto" | "ganho" | "transferencia";

export function parseQuickAddParam(value: unknown): QuickAddKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "gasto" || normalized === "expense" || normalized === "saida") return "gasto";
  if (normalized === "ganho" || normalized === "income" || normalized === "entrada") return "ganho";
  if (normalized === "1" || normalized === "transferencia" || normalized === "transfer") return "transferencia";
  return null;
}

export function quickAddEntryType(kind: QuickAddKind): "expense" | "income" | null {
  if (kind === "gasto") return "expense";
  if (kind === "ganho") return "income";
  return null;
}

export function quickAddRoute(kind: QuickAddKind): { to: "/transacoes" | "/transferencias"; search: { novo: string } } {
  if (kind === "transferencia") return { to: "/transferencias", search: { novo: "1" } };
  return { to: "/transacoes", search: { novo: kind } };
}
