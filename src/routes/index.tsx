import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/login" });
    }

    return { user: data.session.user };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Controle Financeiro</h1>
          <LogoutButton />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bem-vindo!</CardTitle>
            <CardDescription>Você está logado como {user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Seu painel de controle financeiro será exibido aqui.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
