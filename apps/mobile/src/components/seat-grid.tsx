import type { SeatMapSeat } from "@sinema/shared";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslations } from "use-intl";
import { type Colors, spacing, useColors } from "@/lib/theme";
import { Text } from "./ui";

type Look = "free" | "mine" | "taken";

const lookOf = (seat: SeatMapSeat): Look => (seat.lockId ? "mine" : seat.state === "free" ? "free" : "taken");

function seatColors(look: Look, colors: Colors) {
  if (look === "mine") return { backgroundColor: colors.primary, color: colors.primaryForeground };
  if (look === "taken") return { backgroundColor: colors.seatTaken, color: colors.mutedForeground };
  return { backgroundColor: colors.muted, color: colors.foreground };
}

const SEAT = 30;

export function SeatGrid({
  seats,
  busySeatId,
  onToggle,
}: {
  seats: SeatMapSeat[];
  busySeatId: string | null;
  onToggle: (seat: SeatMapSeat) => void;
}) {
  const t = useTranslations("seats");
  const colors = useColors();
  const rows = Map.groupBy(seats, (seat) => seat.row);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <View style={{ height: 4, width: "80%", borderRadius: 2, backgroundColor: colors.primary, opacity: 0.6 }} />
        <Text variant="small" style={{ letterSpacing: 2 }}>
          {t("screen").toLocaleUpperCase()}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View style={{ gap: spacing.xs }}>
          {[...rows].map(([row, rowSeats]) => (
            <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Text variant="small" style={styles.rowLabel}>
                {row}
              </Text>
              {rowSeats.map((seat) => {
                const look = lookOf(seat);
                const { backgroundColor, color } = seatColors(look, colors);
                return (
                  <Pressable
                    key={seat.id}
                    disabled={look === "taken" || busySeatId !== null}
                    onPress={() => onToggle(seat)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: look === "mine", disabled: look === "taken" }}
                    accessibilityLabel={`${t("seatLabel", { row: seat.row, number: seat.number })}, ${t(
                      look === "taken" ? "taken" : look === "mine" ? "mine" : "free",
                    )}${seat.type === "VIP" ? `, ${t("vip")}` : ""}`}
                    hitSlop={2}
                    style={({ pressed }) => [
                      styles.seat,
                      { backgroundColor, opacity: busySeatId === seat.id || pressed ? 0.6 : 1 },
                      seat.type === "VIP" && look !== "taken" && { borderWidth: 2, borderColor: colors.vip },
                    ]}
                  >
                    <Text style={[styles.seatNumber, { color }]}>{look === "taken" ? "×" : seat.number}</Text>
                  </Pressable>
                );
              })}
              <Text variant="small" style={styles.rowLabel}>
                {row}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg }}>
        {(
          [
            ["free", seatColors("free", colors).backgroundColor, t("free")],
            ["mine", colors.primary, t("mine")],
            ["taken", colors.seatTaken, t("taken")],
          ] as const
        ).map(([key, backgroundColor, label]) => (
          <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={[styles.legend, { backgroundColor }]} />
            <Text variant="small">{label}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <View style={[styles.legend, { backgroundColor: colors.muted, borderWidth: 2, borderColor: colors.vip }]} />
          <Text variant="small">{t("vip")}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowLabel: { width: 16, textAlign: "center" },
  seat: {
    width: SEAT,
    height: SEAT,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  seatNumber: { fontSize: 11, fontWeight: "600" },
  legend: { width: 14, height: 14, borderRadius: 4 },
});
