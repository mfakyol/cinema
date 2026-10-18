import { View } from "react-native";
import { useTranslations } from "use-intl";
import { formatRemaining } from "@/lib/use-countdown";
import { radius, spacing, useColors } from "@/lib/theme";
import { Text } from "./ui";

const STEPS = ["seats", "extras", "payment"] as const;
export type PurchaseStep = (typeof STEPS)[number];

/** "1 Seats · 2 Snacks · 3 Payment", with the current step highlighted and the hold time. */
export function PurchaseSteps({ current, remaining }: { current: PurchaseStep; remaining: number | null }) {
  const t = useTranslations();
  const colors = useColors();
  const currentIndex = STEPS.indexOf(current);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.xs }} accessibilityRole="progressbar">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <View key={step} style={{ flex: 1, gap: spacing.xs }}>
              <View
                style={{
                  height: 4,
                  borderRadius: radius.sm,
                  backgroundColor: done || active ? colors.primary : colors.border,
                }}
              />
              <Text
                variant="small"
                style={{ color: active ? colors.foreground : colors.mutedForeground, fontWeight: active ? "700" : "400" }}
                accessibilityState={{ selected: active }}
              >
                {index + 1}. {t(`steps.${step}`)}
              </Text>
            </View>
          );
        })}
      </View>
      {remaining !== null && (
        <Text variant="small" accessibilityLiveRegion="polite">
          ⏱ {t("seats.heldFor", { time: formatRemaining(remaining) })}
        </Text>
      )}
    </View>
  );
}
