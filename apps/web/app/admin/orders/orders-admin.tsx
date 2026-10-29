"use client";

import type { AdminOrder } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { useAdminMutation } from "../admin-ui";

const statusVariant = { PAID: "secondary", PENDING: "outline", FAILED: "outline", REFUNDED: "destructive" } as const;

/** One order, with an inline confirmation to refund it. */
function OrderRow({ order }: { order: AdminOrder }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const price = usePrice();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const refund = useAdminMutation(
    () => apiFetch(`/admin/orders/${order.id}/refund`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }),
    t("refunded"),
  );
  const when = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const refundable = order.status === "PAID" && order.usedTickets === 0;

  return (
    <li className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {order.showtime.movie.title} · {order.showtime.hall.name} · {when(order.showtime.startsAt)}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {order.contactEmail ?? "—"} · {t(`channel.${order.channel}`)} ·{" "}
            {t(`payment.${order.paymentMethod}`)} · {when(order.createdAt)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{order.id}</p>
          {order.usedTickets > 0 && <p className="text-xs text-muted-foreground">{t("usedTickets", { count: order.usedTickets })}</p>}
          {order.refundReason && <p className="text-xs text-muted-foreground">{order.refundReason}</p>}
        </div>
        <span className="text-sm tabular-nums">{price(order.amount)}</span>
        <Badge variant={statusVariant[order.status]}>{t(`orderStatus.${order.status}`)}</Badge>
        {refundable && (
          <Button variant="outline" size="sm" disabled={confirming} onClick={() => setConfirming(true)}>
            {t("refund")}
          </Button>
        )}
      </div>
      {confirming && refundable && (
        <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm font-medium">{t("refundTitle")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor={`refund-${order.id}`}>{t("reason")}</Label>
              <Input id={`refund-${order.id}`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </div>
            <Button variant="destructive" disabled={reason.trim().length < 3 || refund.isPending} onClick={() => refund.mutate(undefined)}>
              {t("confirmRefund")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("keep")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function OrdersAdmin() {
  const t = useTranslations("admin");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const orders = useQuery({
    queryKey: ["admin", "orders", q],
    queryFn: () => apiFetch<{ orders: AdminOrder[] }>(`/admin/orders?${new URLSearchParams({ q })}`),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("orders")}</h1>
      <form
        className="flex max-w-lg gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft.trim());
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("searchOrders")} aria-label={t("searchOrders")} />
        <Button type="submit">
          <Search aria-hidden />
          {t("search")}
        </Button>
      </form>
      {orders.isError && <LoadError onRetry={() => void orders.refetch()} />}
      {orders.isPending && <Skeleton className="h-64 w-full" />}
      {orders.data?.orders.length === 0 && <p className="text-muted-foreground">{t("noOrders")}</p>}
      <ul className="space-y-2">
        {orders.data?.orders.map((order) => (
          <OrderRow key={`${order.id}:${order.status}`} order={order} />
        ))}
      </ul>
    </div>
  );
}
