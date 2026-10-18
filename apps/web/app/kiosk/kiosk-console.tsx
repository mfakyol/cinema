"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, LogOut, MonitorUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthForm } from "@/components/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useKioskPublisher } from "@/lib/kiosk-sync";
import { setSession, useSession } from "@/lib/session";
import { SaleDesk } from "./sale-desk";
import { ShowtimeList } from "./showtime-list";

/** Box office for staff: pick a showtime, hold seats, add snacks, take payment. */
export function KioskConsole() {
  const t = useTranslations();
  const session = useSession();
  const queryClient = useQueryClient();

  const signOut = () => {
    setSession(null);
    queryClient.clear();
  };

  const role = session?.user?.role;
  if (role !== "STAFF" && role !== "ADMIN") {
    return (
      <div className="m-auto w-full max-w-sm space-y-4 p-4">
        {session && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {t("kiosk.notStaff")}
              <Button variant="outline" size="sm" onClick={signOut}>
                {t("common.signOut")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!session && <AuthForm mode="login" next="/kiosk" staff />}
      </div>
    );
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Clapperboard className="size-5 text-primary" aria-hidden />
        <h1 className="mr-auto font-semibold">
          {t("common.appName")} · {t("kiosk.title")}
        </h1>
        <Button
          variant="outline"
          size="sm"
          // A named window, so pressing it again brings back the same customer screen.
          onClick={() => window.open("/kiosk/display", "sinema-customer-display", "popup,width=1280,height=800")}
        >
          <MonitorUp aria-hidden />
          {t("kiosk.openDisplay")}
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">{session?.user?.name}</span>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut aria-hidden />
          {t("common.signOut")}
        </Button>
      </header>
      <Sale />
    </>
  );
}

/** One sale at a time; finishing or clearing it starts the next on the same showtime. */
function Sale() {
  const t = useTranslations("kiosk");
  const [showtimeId, setShowtimeId] = useState<string | null>(null);
  const [sold, setSold] = useState<Order | null>(null);
  const cart = useCart(showtimeId ?? "");

  useKioskPublisher({
    showtimeId,
    items: [...cart.quantities],
    orderToken: sold?.accessToken ?? null,
  });

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-b p-4 lg:border-r lg:border-b-0">
        <ShowtimeList
          selectedId={showtimeId}
          onSelect={(id) => {
            setSold(null);
            setShowtimeId(id);
          }}
        />
      </aside>
      <section className="min-h-0 overflow-y-auto p-4">
        {showtimeId ? (
          <SaleDesk
            key={showtimeId}
            showtimeId={showtimeId}
            sold={sold}
            onSold={setSold}
            onNewSale={() => setSold(null)}
          />
        ) : (
          <p className="grid h-full place-items-center text-muted-foreground">{t("pickShowtime")}</p>
        )}
      </section>
    </div>
  );
}
