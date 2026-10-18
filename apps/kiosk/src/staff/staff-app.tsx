import type { Order } from "@sinema/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, KeyRound, Lock, LogOut, MonitorUp } from "lucide-react";
import { useCallback, useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useIdleLock, writeLocked } from "@/lib/idle-lock";
import { useKioskPublisher } from "@/lib/kiosk-sync";
import { hasLockPin, storeLockPin } from "@/lib/pin";
import { sessionStore, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DoneStep } from "./done-step";
import { LockScreen } from "./lock-screen";
import { SaleFlow, type SaleStep } from "./sale-flow";
import { SetPinScreen } from "./set-pin-screen";
import { ShowtimePicker } from "./showtime-picker";
import { SignIn } from "./sign-in";

type Screen = "showtime" | SaleStep | "done";

/** The staff side of the box office: sign in, then one sale after another. */
export function StaffApp() {
  const { session } = useSession();
  // Bumped when a PIN is first set, so the check below runs again.
  const [, setPinVersion] = useState(0);

  if (!session) {
    return (
      <div className="flex min-h-dvh p-4">
        <SignIn />
      </div>
    );
  }
  // Staff without a lock PIN set one before selling, since the box office locks itself.
  if (!hasLockPin()) return <SetPinScreen onDone={() => setPinVersion((version) => version + 1)} />;
  return <Sale />;
}

/** Pick a showtime, then seats, snacks and payment as full-screen steps. */
function Sale() {
  const t = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [screen, setScreen] = useState<Screen>("showtime");
  const [showtimeId, setShowtimeId] = useState<string | null>(null);
  const [sold, setSold] = useState<Order | null>(null);
  const cart = useCart(showtimeId ?? "");
  const { locked, lock, unlock } = useIdleLock();
  const [settingPin, setSettingPin] = useState(false);

  const displayOn = useKioskPublisher({
    step: screen,
    showtimeId: screen === "showtime" ? null : showtimeId,
    items: [...cart.quantities],
    orderToken: sold?.accessToken ?? null,
    locked,
  });

  const go = setScreen;

  const signOut = useCallback(async () => {
    storeLockPin(null);
    writeLocked(false);
    await sessionStore.set(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <>
      {locked && (
        <LockScreen
          name={session?.user.name ?? ""}
          email={session?.user.email ?? ""}
          onUnlock={(withPassword) => {
            unlock();
            // A password unlock most likely means a forgotten PIN: offer a new one.
            if (withPassword) setSettingPin(true);
          }}
          onSignOut={() => void signOut()}
        />
      )}
      {settingPin && !locked && (
        <SetPinScreen onDone={() => setSettingPin(false)} onCancel={() => setSettingPin(false)} />
      )}
      {/* Inert while locked, so nothing behind the lock screen can be reached with the keyboard. */}
      <div className="flex h-dvh flex-col overflow-hidden" inert={locked || settingPin}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Clapperboard className="size-5 text-primary" aria-hidden />
          <h1 className="whitespace-nowrap font-semibold">
            {t("common.appName")} · {t("kiosk.title")}
          </h1>
          <span className="mr-auto hidden whitespace-nowrap text-sm tabular-nums text-muted-foreground lg:inline">
            {format.dateTime(now, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground lg:ml-0">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", displayOn ? "bg-green-500" : "bg-muted-foreground/40")}
            />
            <span className="hidden md:inline">{t(displayOn ? "kiosk.displayOn" : "kiosk.displayOff")}</span>
          </span>
          {!displayOn && (
            <Button
              variant="outline"
              size="sm"
              // A named window, so pressing it again brings back the same customer screen.
              onClick={() => window.open("/display", "sinema-customer-display", "popup,width=1280,height=800")}
            >
              <MonitorUp aria-hidden />
              {t("kiosk.openDisplay")}
            </Button>
          )}
          <span className="hidden text-sm md:inline">{session?.user.name}</span>
          <Button variant="outline" size="sm" onClick={lock}>
            <Lock aria-hidden />
            {t("kiosk.lock")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSettingPin(true)}>
            <KeyRound aria-hidden />
            <span className="hidden lg:inline">{t("kiosk.changePin")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut aria-hidden />
            {t("common.signOut")}
          </Button>
        </header>

        {screen === "showtime" || !showtimeId ? (
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <ShowtimePicker
              onPick={(id) => {
                setSold(null);
                setShowtimeId(id);
                go("seats");
              }}
            />
          </main>
        ) : screen === "done" && sold ? (
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <DoneStep
              order={sold}
              onNewSale={() => {
                setSold(null);
                go("seats");
              }}
              onChangeShowtime={() => {
                setSold(null);
                go("showtime");
              }}
            />
          </main>
        ) : (
          <SaleFlow
            key={showtimeId}
            showtimeId={showtimeId}
            step={screen as SaleStep}
            onStep={go}
            onChangeShowtime={() => go("showtime")}
            onSold={(order) => {
              setSold(order);
              void queryClient.invalidateQueries({ queryKey: ["kiosk-week"] });
              go("done");
            }}
          />
        )}
      </div>
    </>
  );
}
