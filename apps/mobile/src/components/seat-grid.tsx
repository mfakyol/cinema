import { groupBy, type SeatMapSeat } from "@sinema/shared";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
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

const GAP = 4;
const ROW_LABEL = 16;
/** Screen padding, card padding and the two row labels around the seats. */
const CHROME = spacing.lg * 2 + spacing.lg * 2 + (ROW_LABEL + GAP) * 2;

/**
 * The hall's seat map as its layout draws it: each row spans `columns` cells, aisles stay
 * empty, and seats shrink so the widest hall still fits a phone.
 */
export function SeatGrid({
  seats,
  columns,
  busySeatId,
  onToggle,
}: {
  seats: SeatMapSeat[];
  columns: number;
  busySeatId: string | null;
  onToggle: (seat: SeatMapSeat) => void;
}) {
  const t = useTranslations("seats");
  const colors = useColors();
  const { width } = useWindowDimensions();
  const size = Math.max(18, Math.min(32, Math.floor((Math.min(width, 700) - CHROME) / columns) - GAP));
  const rows = groupBy(seats, (seat) => seat.row);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <View style={{ height: 4, width: "80%", borderRadius: 2, backgroundColor: colors.primary, opacity: 0.6 }} />
        <Text variant="small" style={{ letterSpacing: 2 }}>
          {t("screen").toLocaleUpperCase()}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View style={{ gap: GAP }}>
          {[...rows].map(([row, rowSeats]) => {
            const byColumn = new Map(rowSeats.map((seat) => [seat.column, seat]));
            return (
              <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: GAP }}>
                <Text variant="small" style={styles.rowLabel}>
                  {row}
                </Text>
                {Array.from({ length: columns }, (_, column) => {
                  const seat = byColumn.get(column);
                  // An aisle or the space beside a short row.
                  if (!seat) return <View key={column} style={{ width: size, height: size }} />;
                  const look = lookOf(seat);
                  const { backgroundColor, color } = seatColors(look, colors);
                  const wheelchair = seat.type === "WHEELCHAIR";
                  return (
                    <Pressable
                      key={column}
                      disabled={look === "taken" || busySeatId !== null}
                      onPress={() => onToggle(seat)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: look === "mine", disabled: look === "taken" }}
                      accessibilityLabel={`${t("seatLabel", { row: seat.row, number: seat.number })}, ${t(
                        look === "taken" ? "taken" : look === "mine" ? "mine" : "free",
                      )}${wheelchair ? `, ${t("wheelchair")}` : ""}`}
                      hitSlop={2}
                      style={({ pressed }) => [
                        styles.seat,
                        { width: size, height: size, backgroundColor, opacity: busySeatId === seat.id || pressed ? 0.6 : 1 },
                        wheelchair && look !== "taken" && { borderWidth: 2, borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[styles.seatNumber, { color, fontSize: size < 24 ? 9 : 11 }]}>
                        {look === "taken" ? "×" : wheelchair ? "♿" : seat.number}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text variant="small" style={styles.rowLabel}>
                  {row}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg }}>
        {(
          [
            ["free", { backgroundColor: seatColors("free", colors).backgroundColor }, t("free")],
            ["mine", { backgroundColor: colors.primary }, t("mine")],
            ["taken", { backgroundColor: colors.seatTaken }, t("taken")],
            ["wheelchair", { backgroundColor: colors.muted, borderWidth: 2, borderColor: colors.primary }, t("wheelchair")],
          ] as const
        ).map(([key, swatch, label]) => (
          <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={[styles.legend, swatch]} />
            <Text variant="small">{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowLabel: { width: ROW_LABEL, textAlign: "center" },
  seat: {
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  seatNumber: { fontWeight: "600" },
  legend: { width: 14, height: 14, borderRadius: 4 },
});
