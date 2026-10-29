import { type CardInput, cardSchema, TEST_CARDS } from "@sinema/shared";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { spacing } from "@/lib/theme";
import { Button, Card, Text, TextField } from "./ui";

/** Starts filled with the approved test card, so trying the app takes no typing. */
export const initialCard = (): CardInput => ({ ...TEST_CARDS.approved });

/** The card ready to send (digits only), or null while something is missing or wrong. */
export function validCard(card: CardInput): CardInput | null {
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
export function CardForm({ card, onChange }: { card: CardInput; onChange: (card: CardInput) => void }) {
  const t = useTranslations("checkout");
  const invalid = validCard(card) === null;

  return (
    <Card>
      <Text variant="heading">{t("card")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
        <Text variant="small">{t("testCards")}</Text>
        <Button title={t("testApproved")} variant="outline" onPress={() => onChange({ ...TEST_CARDS.approved })} />
        <Button title={t("testDeclined")} variant="outline" onPress={() => onChange({ ...TEST_CARDS.declined })} />
      </View>
      <TextField
        label={t("cardHolder")}
        autoComplete="cc-name"
        value={card.holder}
        onChangeText={(holder) => onChange({ ...card, holder })}
      />
      <TextField
        label={t("cardNumber")}
        keyboardType="number-pad"
        autoComplete="cc-number"
        value={groupDigits(card.number)}
        invalid={invalid}
        onChangeText={(number) => onChange({ ...card, number: groupDigits(number) })}
      />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t("cardExpiry")}
            keyboardType="number-pad"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={card.expiry}
            onChangeText={(expiry) => onChange({ ...card, expiry: formatExpiry(expiry) })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t("cardCvc")}
            keyboardType="number-pad"
            autoComplete="cc-csc"
            value={card.cvc}
            onChangeText={(cvc) => onChange({ ...card, cvc: cvc.replace(/\D/g, "").slice(0, 4) })}
          />
        </View>
      </View>
      <Text variant="small">{invalid ? t("cardInvalid") : t("cardNotStored")}</Text>
    </Card>
  );
}
