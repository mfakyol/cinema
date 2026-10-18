"use client";

import { MAX_ITEM_QUANTITY } from "@sinema/shared";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** − count + for one product; the minus and count appear once there is at least one. */
export function QuantityStepper({ name, quantity, onChange }: { name: string; quantity: number; onChange: (n: number) => void }) {
  const t = useTranslations("extras");
  return (
    <div className="flex items-center gap-2">
      {quantity > 0 && (
        <>
          <Button variant="outline" size="icon" aria-label={t("remove", { name })} onClick={() => onChange(quantity - 1)}>
            <Minus aria-hidden />
          </Button>
          <span className="w-5 text-center font-semibold" aria-label={t("inCart", { count: quantity })}>
            {quantity}
          </span>
        </>
      )}
      <Button
        size="icon"
        aria-label={t("add", { name })}
        disabled={quantity >= MAX_ITEM_QUANTITY}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
