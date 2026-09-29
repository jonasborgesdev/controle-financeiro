import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const supabase = createClient();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    await navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,rgba(16,185,129,0.20),transparent_24rem),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.16),transparent_26rem),linear-gradient(180deg,#070A0F_0%,#0A1018_52%,#070A0F_100%)]" />
      <Card className="finance-glass-strong w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-400 text-[#02140f] shadow-lg shadow-emerald-950/30">
            <span className="text-2xl font-black">R$</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Private Finance OS</p>
            <CardTitle className="mt-2 text-3xl font-black tracking-[-0.05em]">Controle Financeiro</CardTitle>
          </div>
          <CardDescription>Entre para acessar seu painel financeiro privado.</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-400/[0.10] p-3 text-sm text-rose-100">{error}</div> : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
            <p className="text-center text-xs leading-5 text-slate-500">Acesso interno para usuários pré-criados. Sem cadastro público.</p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
