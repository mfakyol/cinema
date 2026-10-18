import type { Order } from "@sinema/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, LogOut, MonitorUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useKioskPublisher } from "@/lib/kiosk-sync";
import { sessionStore, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DoneStep } from "./done-step";
import { SaleFlow, type SaleStep } from "./sale-flow";
import { ShowtimePicker } from "./showtime-picker";
import { SignIn } from "./sign-in";
import { StepTransition } from "./step-transition";

type Screen = "showtime" | SaleStep | "done";
const ORDER: Screen[] = ["showtime", "seats", "extras", "payment", "done"];

/** The staff side of the box office: sign in, then one sale after another. */
export function StaffApp() {
  const t = useTranslations();
  const { session } = useSession();

  useEffect(() => {
    document.title = `${t("kiosk.title")} · ${t("common.appName")}`;
  }, [t]);

  if (!session) {
    return (
      <div className="flex min-h-dvh p-4">
        <SignIn />
      </div>
    );
  }
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
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showtimeId, setShowtimeId] = useState<string | null>(null);
  const [sold, setSold] = useState<Order | null>(null);
  const cart = useCart(showtimeId ?? "");

  const displayOn = useKioskPublisher({
    step: screen,
    showtimeId: screen === "showtime" ? null : showtimeId,
    items: [...cart.quantities],
    orderToken: sold?.accessToken ?? null,
  });

  const go = (next: Screen) => {
    setDirection(ORDER.indexOf(next) < ORDER.indexOf(screen) ? "back" : "forward");
    setScreen(next);
  };

  const signOut = async () => {
    await sessionStore.set(null);
    queryClient.clear();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Clapperboard className="size-5 text-primary" aria-hidden />
        <h1 className="whitespace-nowrap font-semibold">
          {t("common.appName")} · {t("kiosk.title")}
        </h1>
        <span className="mr-auto hidden whitespace-nowrap text-sm tabular-nums text-muted-foreground lg:inline">
          {format.dateTime(now, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground lg:ml-0">
          <span aria-hidden className={cn("size-2 rounded-full", displayOn ? "bg-green-500" : "bg-muted-foreground/40")} />
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
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut aria-hidden />
          {t("common.signOut")}
        </Button>
      </header>

      {screen === "showtime" || !showtimeId ? (
        <StepTransition stepKey="showtime" direction={direction} className="overflow-y-auto p-6">
          <ShowtimePicker
            onPick={(id) => {
              setSold(null);
              setShowtimeId(id);
              go("seats");
            }}
          />
        </StepTransition>
      ) : screen === "done" && sold ? (
        <StepTransition stepKey="done" direction={direction} className="overflow-y-auto p-6">
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
        </StepTransition>
      ) : (
        <SaleFlow
          key={showtimeId}
          showtimeId={showtimeId}
          step={screen as SaleStep}
          direction={direction}
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
  );
}
