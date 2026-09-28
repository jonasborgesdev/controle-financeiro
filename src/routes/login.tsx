import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/features/auth/login-page";
import { createClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
