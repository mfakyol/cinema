"use client";

import { Share2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { shareLink } from "@/components/ticket-actions";
import type { ConcessionVoucher } from "@/lib/api";
import { concessionQrValue } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Shares one item's own link, so whoever goes to the stand can collect it. */
function ShareVoucherButton({ voucher }: { voucher: ConcessionVoucher }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const movie = voucher.showtime.movie.title;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        shareLink(
          {
            title: movie,
            text: t("concessions.shareItemText", { item: voucher.product.name[locale], movie }),
            url: concessionQrValue(voucher.qrToken),
          },
          t("order.linkCopied"),
        ).catch(() => toast.error(t("errors.generic")))
      }
    >
      <Share2 aria-hidden />
      {t("concessions.shareItem")}
    </Button>
  );
}

/** One snack, drink or pair of glasses with its QR code, shown at the concession stand. */
export function VoucherCard({ voucher, large = false }: { voucher: ConcessionVoucher; large?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const format = useFormatter();
  const valid = voucher.status === "PAID";
  const qrSize = large ? 240 : 112;

  return (
    <Card className={cn(!valid && "opacity-60")}>
      <CardContent className={cn("flex gap-4 pt-6", large && "flex-col items-center text-center")}>
        {/* Black on white in both themes so scanners can read it. */}
        <div className={cn("shrink-0 rounded-md bg-white p-2", large ? "self-center" : "self-start")}>
          <QRCodeSVG
            value={concessionQrValue(voucher.qrToken)}
            size={qrSize}
            aria-label={t("concessions.showAtStand")}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Badge variant={valid ? "default" : "secondary"}>{t(`concessions.status.${voucher.status}`)}</Badge>
          <p className="font-semibold">{voucher.product.name[locale]}</p>
          <p className="truncate text-sm text-muted-foreground">{voucher.showtime.movie.title}</p>
          <p className="text-sm text-muted-foreground">
            {format.dateTime(new Date(voucher.showtime.startsAt), {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {voucher.showtime.hall.name}
          </p>
          {valid && <p className="text-xs text-muted-foreground">{t("concessions.showAtStand")}</p>}
          {valid && (
            <div className={cn("pt-1", !large && "-ml-3")}>
              <ShareVoucherButton voucher={voucher} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
