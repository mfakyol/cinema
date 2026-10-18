
import { Radio } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";
import { Badge } from "@/components/ui/badge";
import type { SeatMap } from "@sinema/shared";
import { FormatBadge } from "@/components/format-badge";
import { cn } from "@/lib/utils";

/** Movie, time, hall, format and any discount, shown above every sale step. */
export function ShowtimeHeader({ showtime, live }: { showtime: SeatMap["showtime"]; live?: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{showtime.movie.title}</h1>
          <FormatBadge format={showtime.format} />
        </div>
        <p className="text-muted-foreground">
          {format.dateTime(new Date(showtime.startsAt), {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {showtime.hall.name}
        </p>
        {showtime.discount && (
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
            {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })}
          </p>
        )}
      </div>
      {live !== undefined && (
        <Badge variant="outline" className={cn("gap-1.5", !live && "invisible")} aria-hidden={!live}>
          <Radio className="size-3 text-primary" aria-hidden />
          {t("seats.live")}
        </Badge>
      )}
    </div>
  );
}
