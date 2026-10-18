"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatRemaining } from "@/lib/use-countdown";

const STEPS = ["seats", "extras", "payment"] as const;
export type PurchaseStep = (typeof STEPS)[number];

/** "1 Seats · 2 Snacks · 3 Payment", with the current step highlighted and the hold time. */
export function PurchaseSteps({ current, remaining }: { current: PurchaseStep; remaining: number | null }) {
  const t = useTranslations();
  const currentIndex = STEPS.indexOf(current);
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((step, index) => (
          <li key={step} aria-current={index === currentIndex ? "step" : undefined} className="space-y-1">
            <div className={cn("h-1 rounded-full", index <= currentIndex ? "bg-primary" : "bg-border")} />
            <span
              className={cn(
                "text-xs",
                index === currentIndex ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {index + 1}. {t(`steps.${step}`)}
            </span>
          </li>
        ))}
      </ol>
      {remaining !== null && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
          <Clock className="size-4" aria-hidden />
          {t("seats.heldFor", { time: formatRemaining(remaining) })}
        </p>
      )}
    </div>
  );
}
