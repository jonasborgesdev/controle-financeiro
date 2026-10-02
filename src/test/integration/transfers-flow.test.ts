import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { monthLabel } from "@/lib/finance";
import { buildTransferPair, validateTransferInput } from "@/lib/transfers";
import { createTestUser, deleteTestUser, hasSupabaseTestEnv, signInTestUser } from "./helpers/supabase";

const runOrSkip = hasSupabaseTestEnv() ? describe : describe.skip;

// Requer a migration 202610020001_transfers.sql aplicada no Supabase remoto
// (transfer_group_id + source='transfer').
runOrSkip("fluxo de transferência entre contas com Supabase", () => {
  let context: Awaited<ReturnType<typeof createTestUser>> | null = null;

  beforeEach(async () => {
    context = await createTestUser("it");
  });

  afterEach(async () => {
    if (context) await deleteTestUser(context.admin, context.user, "it");
    context = null;
  });

  it("cria o par linkado, respeita RLS e exclui o par junto", async () => {
    const { admin } = context!;
    const { client, user } = await signInTestUser(context!.email, context!.password);

    const { data: accounts, error: accountsError } = await admin
      .from("accounts")
      .insert([
        { user_id: user.id, name: "Conta Origem IT", type: "personal", bank: "Banco Teste", description: null, initial_balance: 1000, is_active: true, color: null, icon: null },
        { user_id: user.id, name: "Conta Destino IT", type: "personal", bank: "Banco Teste", description: null, initial_balance: 0, is_active: true, color: null, icon: null },
      ])
      .select("id,name");
    expect(accountsError).toBeNull();
    expect(accounts).toHaveLength(2);
    const origin = accounts!.find((account) => account.name === "Conta Origem IT")!;
    const destination = accounts!.find((account) => account.name === "Conta Destino IT")!;

    const { data: balance, error: balanceError } = await admin
      .from("monthly_balances")
      .upsert({ user_id: user.id, year: 2026, month: 10, label: monthLabel(2026, 10) }, { onConflict: "user_id,year,month" })
      .select("id")
      .single();
    expect(balanceError).toBeNull();

    const validated = validateTransferInput({
      fromAccountId: origin.id,
      toAccountId: destination.id,
      amountRaw: 250,
      date: "2026-10-02",
      descriptionRaw: "Transferência Origem → Destino IT",
      status: "paid",
    });
    const [expenseLeg, incomeLeg] = buildTransferPair({
      userId: user.id,
      monthlyBalanceId: balance!.id,
      categoryId: null,
      validated,
    });

    const { data: pair, error: insertError } = await client.from("financial_entries").insert([expenseLeg, incomeLeg]).select("id,entry_type,account_id,source,transfer_group_id,expected_amount");
    expect(insertError).toBeNull();
    expect(pair).toHaveLength(2);
    const groupId = pair![0]!.transfer_group_id;
    expect(groupId).toBeTruthy();
    expect(pair!.every((leg) => leg.transfer_group_id === groupId)).toBe(true);
    expect(pair!.every((leg) => leg.source === "transfer")).toBe(true);
    expect(pair!.find((leg) => leg.entry_type === "expense")?.account_id).toBe(origin.id);
    expect(pair!.find((leg) => leg.entry_type === "income")?.account_id).toBe(destination.id);

    // RLS: o dono lê o próprio par via sessão do usuário.
    const { data: visible, error: visibleError } = await client.from("financial_entries").select("id").eq("transfer_group_id", groupId);
    expect(visibleError).toBeNull();
    expect(visible).toHaveLength(2);

    // Exclusão do par.
    const { error: deleteError } = await client.from("financial_entries").delete().eq("transfer_group_id", groupId);
    expect(deleteError).toBeNull();
    const { data: remaining } = await client.from("financial_entries").select("id").eq("transfer_group_id", groupId);
    expect(remaining).toHaveLength(0);
  });
});
