import { checkoutSchema, type Order, type SeatMap, type SeatMapSeat } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { Banknote, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { BasketLine } from "@/lib/basket";
import { useErrorMessage, usePrice } from "@/lib/format";
import { locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export interface PaymentDraft {
  email: string;
  payment: "CARD" | "CASH";
}

const METHODS = [
  ["CARD", CreditCard],
  ["CASH", Banknote],
] as const;

/** The order summary, how the customer pays, and an optional email for the tickets. */
export function PaymentStep({
  showtimeId,
  showtime,
  seats,
  lines,
  total,
  draft,
  onDraft,
  onSold,
  onSettled,
}: {
  showtimeId: string;
  showtime: SeatMap["showtime"];
  seats: SeatMapSeat[];
  lines: BasketLine[];
  total: number;
  draft: PaymentDraft;
  onDraft: (draft: PaymentDraft) => void;
  onSold: (order: Order) => void;
  onSettled: () => void;
}) {
  const t = useTranslations();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const emailValid = draft.email === "" || checkoutSchema.shape.email.safeParse(draft.email).success;

  const charge = useMutation({
    mutationFn: (simulate: "success" | "decline") =>
      api.post<{ order: Order }>("/checkout/kiosk", {
        showtimeId,
        idempotencyKey: crypto.randomUUID(),
        email: draft.email || undefined,
        locale,
        items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        payment: draft.payment,
        simulate,
      }),
    onSuccess: ({ order }) => onSold(order),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled,
  });

  const row = (left: string, right: string, key: string) => (
    <div key={key} className="flex justify-between gap-4">
      <span>{left}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[1fr_400px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("kiosk.summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-lg">
          {seats.map((seat) =>
            row(t("seats.seatLabel", { row: seat.row, number: seat.number }), price(showtime.price), seat.id),
          )}
          {showtime.discount && (
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })} ·{" "}
              <s className="font-normal text-muted-foreground">{price(showtime.basePrice)}</s>
            </p>
          )}
          {lines.length > 0 && <Separator className="my-3" />}
          {lines.map(({ product, quantity }) =>
            row(`${quantity} × ${product.name[locale]}`, price(product.price * quantity), product.id),
          )}
          <Separator className="my-3" />
          <div className="flex justify-between text-3xl font-bold">
            <span>{t("seats.total")}</span>
            <span className="tabular-nums">{price(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("kiosk.payment")}</legend>
            <div className="grid grid-cols-2 gap-3">
              {METHODS.map(([method, Icon]) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={draft.payment === method}
                  onClick={() => onDraft({ ...draft, payment: method })}
                  className={cn(
                    "flex h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background text-lg font-semibold transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring",
                    draft.payment === method && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  <Icon className="size-7" aria-hidden />
                  {t(method === "CARD" ? "kiosk.card" : "kiosk.cash")}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="kiosk-email">{t("kiosk.email")}</Label>
            <Input
              id="kiosk-email"
              type="email"
              autoComplete="off"
              className="h-11"
              value={draft.email}
              onChange={(event) => onDraft({ ...draft, email: event.target.value })}
              aria-describedby="kiosk-email-hint"
              aria-invalid={!emailValid || undefined}
            />
            <p id="kiosk-email-hint" className="text-xs text-muted-foreground">
              {t("kiosk.emailHint")}
            </p>
          </div>

          <div className="space-y-1">
            <Button
              size="lg"
              className="h-14 w-full text-lg"
              disabled={seats.length === 0 || !emailValid || charge.isPending}
              onClick={() => charge.mutate("success")}
            >
              {t("kiosk.charge", { amount: price(total) })}
            </Button>
            {draft.payment === "CARD" && (
              <Button
                variant="link"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={seats.length === 0 || !emailValid || charge.isPending}
                onClick={() => charge.mutate("decline")}
              >
                {t("seats.payDeclined")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
