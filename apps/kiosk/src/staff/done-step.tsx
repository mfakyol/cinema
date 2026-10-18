import type { Order } from "@sinema/shared";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrice } from "@/lib/format";

/** The sale went through; the customer screen now shows the QR code for the tickets. */
export function DoneStep({
  order,
  onNewSale,
  onChangeShowtime,
}: {
  order: Order;
  onNewSale: () => void;
  onChangeShowtime: () => void;
}) {
  const t = useTranslations();
  const price = usePrice();
  return (
    <Card className="mx-auto mt-[10vh] max-w-md text-center">
      <CardHeader className="items-center">
        <CircleCheck className="mx-auto size-14 text-green-600 dark:text-green-400" aria-hidden />
        <CardTitle className="text-2xl">{t("kiosk.sold")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-lg">
          {t("kiosk.soldDetail", {
            tickets: t("seats.ticketCount", { count: order.tickets.length }),
            amount: price(order.amount),
            method: t(order.paymentMethod === "CASH" ? "kiosk.cash" : "kiosk.card"),
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t("kiosk.displayLinked")}</p>
        <div className="grid gap-2">
          <Button size="lg" className="h-12" onClick={onNewSale} autoFocus>
            {t("kiosk.newSale")}
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={onChangeShowtime}>
            {t("kiosk.changeShowtime")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
