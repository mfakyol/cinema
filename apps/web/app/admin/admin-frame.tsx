"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AuthForm } from "@/components/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setSession, useSession, useSessionKnown } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/showtimes", key: "showtimes" },
  { href: "/admin/movies", key: "movies" },
  { href: "/admin/orders", key: "orders" },
  { href: "/admin/halls", key: "halls" },
  { href: "/admin/layouts", key: "layouts" },
] as const;

/** Header and navigation for the admin pages, shown only to a signed-in admin. */
export function AdminFrame({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const session = useSession();
  const known = useSessionKnown();
  const queryClient = useQueryClient();

  const signOut = () => {
    setSession(null);
    queryClient.clear();
  };

  if (!known) return null;
  if (session?.user?.role !== "ADMIN") {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 space-y-4 px-4 py-16">
        {session?.user && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {t("admin.notAdmin")}
              <Button variant="outline" size="sm" onClick={signOut}>
                {t("common.signOut")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!session?.user && <AuthForm mode="login" next={pathname} demoEmail="admin@sinema.test" />}
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <Clapperboard className="size-5 text-primary" aria-hidden />
            {t("common.appName")} · {t("admin.title")}
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:mr-auto md:w-auto">
            {NAV.map(({ href, key }) => (
              <Button key={href} variant="ghost" size="sm" asChild className={cn(pathname.startsWith(href) && "bg-muted")}>
                <Link href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
                  {t(`admin.${key}`)}
                </Link>
              </Button>
            ))}
          </nav>
          <Button variant="ghost" size="sm" asChild className="ml-auto md:ml-0">
            <Link href="/">{t("admin.backToSite")}</Link>
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.name}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut aria-hidden />
            {t("common.signOut")}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
