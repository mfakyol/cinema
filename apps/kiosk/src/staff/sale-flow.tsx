import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { ShowtimeHeader } from "@/components/showtime-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { basket, productsQuery } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import { useErrorMessage, usePrice } from "@/lib/format";
import { formatRemaining } from "@/lib/use-countdown";
import { useSeatHold } from "@/lib/use-seat-hold";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExtrasStep } from "./extras-step";
import { PaymentStep, type PaymentDraft } from "./payment-step";
import { SeatsStep } from "./seats-step";
import type { Order } from "@sinema/shared";

export type SaleStep = "seats" | "extras" | "payment";
const STEPS: SaleStep[] = ["seats", "extras", "payment"];

/** Seats, snacks and payment for one showtime, one full screen each, with the basket below. */
export function SaleFlow({
  showtimeId,
  step,
  onStep,
  onChangeShowtime,
  onSold,
}: {
  showtimeId: string;
  step: SaleStep;
  onStep: (step: SaleStep) => void;
  onChangeShowtime: () => void;
  onSold: (order: Order) => void;
}) {
  const t = useTranslations();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const hold = useSeatHold(showtimeId);
  const { seatMap, mine, remaining, live, refresh } = hold;
  const cart = useCart(showtimeId);
  const products = useQuery(productsQuery(showtimeId));
  // Kept here so going back to snacks and returning does not lose what was typed.
  const [draft, setDraft] = useState<PaymentDraft>({ email: "", payment: "CARD" });

  const clear = useMutation({
    mutationFn: () => Promise.all(mine.map((seat) => api.fetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" }))),
    onSuccess: () => {
      cart.clear();
      setDraft({ email: "", payment: "CARD" });
      onStep("seats");
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  if (!seatMap.data) return <Skeleton className="m-6 flex-1" />;
  const { showtime } = seatMap.data;
  const { lines, total } = basket(products.data?.products, cart.quantities, showtime.price, mine.length);
  const index = STEPS.indexOf(step);
  const holdLost = mine.length === 0 && step !== "seats";
  const back = () => (index === 0 ? onChangeShowtime() : onStep(STEPS[index - 1]!));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b px-6 py-3">
        <div className="min-w-0 flex-1">
          <ShowtimeHeader showtime={showtime} live={live} />
        </div>
        <Button variant="outline" onClick={onChangeShowtime}>
          {t("kiosk.changeShowtime")}
        </Button>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {holdLost ? (
          <Alert variant="destructive" className="mx-auto max-w-xl">
            <AlertDescription className="flex items-center justify-between gap-4">
              {t("checkout.holdLost")}
              <Button variant="outline" size="sm" onClick={() => onStep("seats")}>
                {t("checkout.backToSeats")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : step === "seats" ? (
          <SeatsStep showtimeId={showtimeId} hold={hold} />
        ) : step === "extras" ? (
          <ExtrasStep showtimeId={showtimeId} seatCount={mine.length} />
        ) : (
          <PaymentStep
            showtimeId={showtimeId}
            showtime={showtime}
            seats={mine}
            lines={lines}
            total={total}
            draft={draft}
            onDraft={setDraft}
            onSold={(order) => {
              cart.clear();
              onSold(order);
            }}
            onSettled={refresh}
          />
        )}
      </main>

      <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={back}>
            <ArrowLeft aria-hidden />
            {t("common.back")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="text-muted-foreground"
            disabled={(mine.length === 0 && cart.quantities.size === 0) || clear.isPending}
            onClick={() => clear.mutate()}
          >
            <Trash2 aria-hidden />
            <span className="hidden sm:inline">{t("kiosk.clear")}</span>
          </Button>
        </div>

        <ol className="hidden items-center gap-2 md:flex">
          {STEPS.map((name, i) => (
            <li key={name} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-8 bg-border" />}
              <span
                aria-current={name === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1 text-sm",
                  name === step
                    ? "bg-primary text-primary-foreground"
                    : i < index
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                <span className="font-semibold">{i + 1}</span>
                {t(`steps.${name}`)}
              </span>
            </li>
          ))}
        </ol>

        <div className="col-start-3 flex items-center justify-end gap-4">
          <div className="text-right">
            <p className="hidden whitespace-nowrap text-sm text-muted-foreground sm:block">
              {t("seats.ticketCount", { count: mine.length })} · {t("kiosk.items", { count: lines.length })}
              {remaining !== null && <> · {t("seats.heldFor", { time: formatRemaining(remaining) })}</>}
            </p>
            <p className="whitespace-nowrap text-2xl font-bold tabular-nums">{price(total)}</p>
          </div>
          {/* Kept on the payment step too (hidden), so the total stays where it was. */}
          <Button
            size="lg"
            className={cn("h-12 min-w-40 text-base", step === "payment" && "invisible")}
            aria-hidden={step === "payment"}
            tabIndex={step === "payment" ? -1 : undefined}
            disabled={mine.length === 0 || step === "payment"}
            onClick={() => onStep(STEPS[index + 1]!)}
          >
            {step === "extras" && cart.quantities.size === 0 ? t("steps.skip") : t("steps.continue")}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </footer>
    </div>
  );
}
