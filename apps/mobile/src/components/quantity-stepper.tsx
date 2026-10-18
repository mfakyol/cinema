import { MAX_ITEM_QUANTITY } from "@sinema/shared";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslations } from "use-intl";
import { radius, spacing, useColors } from "@/lib/theme";
import { Text } from "./ui";

/** − 2 + control for one product; the buttons say which product they change. */
export function QuantityStepper({
  name,
  quantity,
  onChange,
}: {
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const t = useTranslations("extras");
  const colors = useColors();
  const button = (label: string, symbol: string, next: number, disabled: boolean, filled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: filled ? colors.primary : colors.border,
          backgroundColor: filled ? colors.primary : colors.card,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.symbol, { color: filled ? colors.primaryForeground : colors.foreground }]}>{symbol}</Text>
    </Pressable>
  );

  return (
    <View style={styles.row}>
      {quantity > 0 && (
        <>
          {button(t("remove", { name }), "−", quantity - 1, false, false)}
          <Text style={styles.count} accessibilityLabel={t("inCart", { count: quantity })}>
            {quantity}
          </Text>
        </>
      )}
      {button(t("add", { name }), "+", quantity + 1, quantity >= MAX_ITEM_QUANTITY, true)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  button: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  symbol: { fontSize: 20, fontWeight: "700", lineHeight: 22 },
  count: { minWidth: 20, textAlign: "center", fontWeight: "700", fontSize: 16 },
});
