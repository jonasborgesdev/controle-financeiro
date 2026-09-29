import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { isFinanceClassification } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types/database";

type CategoryForm = {
  name: string;
};

const emptyForm: CategoryForm = {
  name: "",
};

export const Route = createFileRoute("/categorias")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/login" });
    }

    return { user: data.session.user };
  },
  component: CategoriesPage,
});

function CategoriesPage() {
  const { user } = Route.useRouteContext();
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [classificationType, setClassificationType] = useState<"income" | "expense">("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from("categories").select("*").eq("is_active", true).order("name");
    if (error) setError(error.message);
    setCategories(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const openNewCategory = (type: "income" | "expense") => {
    resetForm();
    setClassificationType(type);
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      icon: null,
      color: null,
      type: classificationType,
      parent_id: null,
      is_default: false,
      is_active: true,
    };

    const result = editingId
      ? await supabase.from("categories").update(payload).eq("id", editingId)
      : await supabase.from("categories").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      setModalOpen(false);
      await loadCategories();
    }

    setSaving(false);
  };

  const editCategory = (category: Category) => {
    if (category.is_default) return;
    setEditingId(category.id);
    setForm({
      name: category.name,
    });
    setClassificationType(category.type === "income" ? "income" : "expense");
    setModalOpen(true);
  };

  const deactivateCategory = async (category: Category) => {
    if (category.is_default) return;
    if (!window.confirm("Tem certeza que deseja desativar esta categoria?")) return;

    const { error } = await supabase.from("categories").update({ is_active: false }).eq("id", category.id);
    if (error) setError(error.message);
    await loadCategories();
  };

  const expenseCategories = categories.filter((category) => (
    category.type === "expense"
    && isFinanceClassification(category, user.id)
  ));
  const incomeCategories = categories.filter((category) => (
    category.type === "income"
    && isFinanceClassification(category, user.id)
  ));

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="finance-glass-strong rounded-[2rem] p-5 text-white sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-200">Classificação financeira</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-5xl">Fixo ou variável, sem complicar.</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">Use classificações amplas, como Ganhos fixos, Ganhos variáveis, Gastos fixos e Gastos variáveis.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => openNewCategory("income")}>Nova classificação de ganho</Button>
              <Button type="button" variant="outline" onClick={() => openNewCategory("expense")}>Nova classificação de gasto</Button>
            </div>
          </div>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ganhos</CardTitle>
            <CardDescription>{incomeCategories.length} classificação(ões) ativa(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-slate-400">Carregando...</p> : null}
            <div className="grid gap-3">
              {incomeCategories.map((category) => <CategoryCard key={category.id} category={category} label="Ganho" onEdit={editCategory} onDeactivate={deactivateCategory} />)}
              {!loading && incomeCategories.length === 0 ? <p className="text-sm text-slate-400">Nenhuma classificação de ganho cadastrada.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos</CardTitle>
            <CardDescription>{expenseCategories.length} classificação(ões) ativa(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-slate-400">Carregando...</p> : null}
            <div className="grid gap-3">
              {expenseCategories.map((category) => <CategoryCard key={category.id} category={category} label="Gasto" onEdit={editCategory} onDeactivate={deactivateCategory} />)}
              {!loading && expenseCategories.length === 0 ? <p className="text-sm text-slate-400">Nenhuma classificação de gasto cadastrada.</p> : null}
            </div>
          </CardContent>
        </Card>
        </div>

        <Modal title={editingId ? "Editar classificação" : `Nova classificação de ${classificationType === "income" ? "ganho" : "gasto"}`} description={`Crie classificações amplas para ${classificationType === "income" ? "ganhos" : "gastos"}, como ${classificationType === "income" ? "Ganhos fixos" : "Gastos fixos"}.`} open={modalOpen} onClose={() => setModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? <div className="rounded-lg border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" placeholder={classificationType === "income" ? "Ex.: Ganhos fixos" : "Ex.: Gastos fixos"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar classificação"}</Button>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}

function CategoryCard({ category, label, onEdit, onDeactivate }: { category: Category; label: "Ganho" | "Gasto"; onEdit: (category: Category) => void; onDeactivate: (category: Category) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-50">{category.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{label}</p>
          {category.is_default ? <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">Padrão</span> : null}
        </div>
        {!category.is_default ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Button type="button" variant="outline" onClick={() => onEdit(category)}>Editar</Button>
            <Button type="button" variant="destructive" onClick={() => onDeactivate(category)}>Desativar</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
