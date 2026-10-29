"use client";

import { type CardInput, cardSchema, TEST_CARDS } from "@sinema/shared";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The card as the form holds it: the number may contain spaces while typing. */
export type CardDraft = CardInput;

/** Starts filled with the approved test card, so trying the shop takes no typing. */
export const initialCard = (): CardDraft => ({ ...TEST_CARDS.approved });

/** The card ready to send (digits only), or null while something is missing or wrong. */
export function validCard(card: CardDraft): CardInput | null {
  const result = cardSchema.safeParse({ ...card, number: card.number.replace(/\s/g, "") });
  return result.success ? result.data : null;
}

const groupDigits = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

/** Card fields for the payment step, with one-tap test cards for the fake provider. */
export function CardForm({ card, onChange }: { card: CardDraft; onChange: (card: CardDraft) => void }) {
  const t = useTranslations("checkout");
  const invalid = validCard(card) === null;
  const set = (field: keyof CardDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange({
      ...card,
      [field]:
        field === "number"
          ? groupDigits(value)
          : field === "expiry"
            ? formatExpiry(value)
            : field === "cvc"
              ? value.replace(/\D/g, "").slice(0, 4)
              : value,
    });
  };

  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-medium">
        <CreditCard className="size-4" aria-hidden />
        {t("card")}
      </legend>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {t("testCards")}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...TEST_CARDS.approved })}>
          {t("testApproved")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...TEST_CARDS.declined })}>
          {t("testDeclined")}
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-holder">{t("cardHolder")}</Label>
        <Input id="card-holder" autoComplete="cc-name" value={card.holder} onChange={set("holder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-number">{t("cardNumber")}</Label>
        <Input
          id="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          className="tabular-nums"
          value={groupDigits(card.number)}
          onChange={set("number")}
          aria-invalid={invalid || undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="card-expiry">{t("cardExpiry")}</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={card.expiry}
            onChange={set("expiry")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card-cvc">{t("cardCvc")}</Label>
          <Input id="card-cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={set("cvc")} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{invalid ? t("cardInvalid") : t("cardNotStored")}</p>
    </fieldset>
  );
}
