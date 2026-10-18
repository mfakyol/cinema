"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Ticket } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { setSession, useSession } from "@/lib/session";

export function SiteHeader() {
  const t = useTranslations("common");
  const session = useSession();
  const queryClient = useQueryClient();

  const signOut = () => {
    setSession(null);
    queryClient.clear();
  };

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold">
          <Clapperboard className="size-5 text-primary" aria-hidden />
          {t("appName")}
        </Link>
        {session && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tickets">
              <Ticket aria-hidden />
              {t("myTickets")}
            </Link>
          </Button>
        )}
        {session?.user ? (
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.name}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("signOut")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("signIn")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">{t("register")}</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
