import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { AccountScopeProvider } from "@/lib/account-scope";
import { createClient } from "@/lib/supabase/client";
import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; user?: { id: string } | null }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Controle Financeiro" },
      {
        name: "description",
        content: "Sistema pessoal de controle financeiro para Jonas e Isadora",
      },
      { name: "theme-color", content: "#070A0F" },
      { name: "background-color", content: "#070A0F" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Financeiro" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa-icon.svg" },
    ],
  }),
  beforeLoad: async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return { user: data.session?.user ?? null };
  },
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, user } = Route.useRouteContext();

  const content = useMemo(() => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ), [queryClient]);

  if (!user) return content;

  return (
    <AccountScopeProvider userId={user.id}>
      {content}
    </AccountScopeProvider>
  );
}
