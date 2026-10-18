import { errorCode } from "@sinema/client";
import type { ConcessionVoucher, Ticket } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { Redirect, Stack, useIsFocused } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFormatter, useLocale, useTranslations } from "use-intl";
import { Button, Card, Screen, Text, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { type ScanMode, useScanMode } from "@/lib/mode";
import { sessionStore, useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/lib/theme";

type Result =
  | { ok: true; mode: "door"; ticket: Ticket }
  | { ok: true; mode: "stand"; voucher: ConcessionVoucher }
  | { ok: false; mode: ScanMode; code: string };

export default function ScanScreen() {
  const t = useTranslations();
  const { session } = useSession();
  const [mode, setMode] = useScanMode();
  const [result, setResult] = useState<Result | null>(null);
  // A camera fires many events for one code; handle only the first until the result is closed.
  const handling = useRef(false);

  // The door admits tickets, the stand hands over items. Each endpoint turns away the other
  // kind of code without using it up, so a door and a stand never block each other.
  const check = useMutation({
    mutationFn: async ({ scanned, mode }: { scanned: string; mode: ScanMode }): Promise<Result> => {
      if (mode === "door") {
        const { ticket } = await api.post<{ ticket: Ticket }>("/tickets/verify", { qrToken: scanned });
        return { ok: true, mode, ticket };
      }
      const { voucher } = await api.post<{ voucher: ConcessionVoucher }>("/concessions/collect", { qrToken: scanned });
      return { ok: true, mode, voucher };
    },
    onSuccess: setResult,
    onError: (error, { mode }) => setResult({ ok: false, mode, code: errorCode(error) }),
  });

  if (!session || session.user.role === "CUSTOMER") return <Redirect href="/sign-in" />;

  const scan = (scanned: string) => {
    if (handling.current || !scanned.trim()) return;
    handling.current = true;
    check.mutate({ scanned, mode });
  };
  const next = () => {
    setResult(null);
    check.reset();
    handling.current = false;
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === "door" ? t("staff.title") : t("staff.standTitle"),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.signOut")}
              onPress={() => void sessionStore.set(null)}
              hitSlop={8}
            >
              <Text variant="small">{t("common.signOut")}</Text>
            </Pressable>
          ),
        }}
      />
      {result ? (
        <ResultView result={result} onNext={next} />
      ) : (
        <Scanner mode={mode} onModeChange={setMode} checking={check.isPending} onScan={scan} />
      )}
    </>
  );
}

function ModePicker({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
  const t = useTranslations("staff");
  const colors = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.md, padding: 4, gap: 4 }}
    >
      {(["door", "stand"] as const).map((value) => {
        const selected = value === mode;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.card : "transparent",
            }}
          >
            <Text style={{ fontWeight: selected ? "700" : "500", color: selected ? colors.foreground : colors.mutedForeground }}>
              {t(value === "door" ? "modeDoor" : "modeStand")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Scanner({
  mode,
  onModeChange,
  checking,
  onScan,
}: {
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  checking: boolean;
  onScan: (scanned: string) => void;
}) {
  const t = useTranslations();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  // Only one camera preview can run at a time; drop it when the screen is not shown.
  const focused = useIsFocused();
  const [manual, setManual] = useState("");

  return (
    <Screen>
      <ModePicker mode={mode} onChange={onModeChange} />
      {permission?.granted ? (
        <View style={styles.cameraFrame}>
          {focused && (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={checking ? undefined : (event: BarcodeScanningResult) => onScan(event.data)}
            />
          )}
          <View pointerEvents="none" style={[styles.target, { borderColor: colors.primaryForeground }]} />
        </View>
      ) : (
        <Card>
          <Text>{t("staff.cameraPermission")}</Text>
          <Button title={t("staff.allowCamera")} onPress={() => void requestPermission()} />
        </Card>
      )}
      <Text variant="muted" style={{ textAlign: "center" }}>
        {checking ? t("staff.checking") : t("staff.pointCamera")}
      </Text>

      {/* For a cracked or dim phone screen: type the code or paste the link. */}
      <Card>
        <TextField
          label={t("staff.manualEntry")}
          value={manual}
          onChangeText={setManual}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => onScan(manual)}
        />
        <Button
          title={mode === "door" ? t("staff.check") : t("staff.handOver")}
          variant="outline"
          disabled={!manual.trim() || checking}
          onPress={() => {
            onScan(manual);
            setManual("");
          }}
        />
      </Card>
    </Screen>
  );
}

function ResultView({ result, onNext }: { result: Result; onNext: () => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as "en" | "tr";
  const colors = useColors();
  const background = result.ok ? colors.success : colors.destructive;
  const when = (startsAt: string) =>
    format.dateTime(new Date(startsAt), { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <View style={[styles.result, { backgroundColor: background }]} accessibilityLiveRegion="assertive">
      <Text style={styles.resultMark} accessibilityElementsHidden>
        {result.ok ? "✓" : "✕"}
      </Text>
      <Text style={styles.resultTitle} accessibilityRole="header">
        {result.mode === "door"
          ? t(result.ok ? "staff.admitted" : "staff.rejected")
          : t(result.ok ? "staff.collected" : "staff.notHandedOver")}
      </Text>
      {result.ok && result.mode === "door" && (
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={styles.resultLine}>{result.ticket.showtime.movie.title}</Text>
          <Text style={styles.resultLine}>
            {when(result.ticket.showtime.startsAt)} · {result.ticket.showtime.hall.name}
          </Text>
          <Text style={[styles.resultLine, styles.resultMain]}>
            {t("seats.seatLabel", { row: result.ticket.seat.row, number: result.ticket.seat.number })}
            {result.ticket.seat.type === "WHEELCHAIR" ? ` · ${t("seats.wheelchair")}` : ""}
          </Text>
        </View>
      )}
      {result.ok && result.mode === "stand" && (
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={[styles.resultLine, styles.resultMain]}>{result.voucher.product.name[locale]}</Text>
          {result.voucher.showtime && (
            <Text style={styles.resultLine}>
              {result.voucher.showtime.movie.title} · {when(result.voucher.showtime.startsAt)}
            </Text>
          )}
        </View>
      )}
      {!result.ok && (
        <Text style={styles.resultLine}>
          {t.has(`errors.${result.code}`) ? t(`errors.${result.code}`) : t("errors.generic")}
        </Text>
      )}
      <Button title={t("staff.scanNext")} variant="outline" textColor="#ffffff" onPress={onNext} style={styles.nextButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraFrame: { aspectRatio: 1, borderRadius: 16, overflow: "hidden", backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  target: { width: "62%", aspectRatio: 1, borderWidth: 3, borderRadius: 16, opacity: 0.8 },
  result: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  resultMark: { color: "#ffffff", fontSize: 96, fontWeight: "700" },
  resultTitle: { color: "#ffffff", fontSize: 32, fontWeight: "800", textAlign: "center" },
  resultLine: { color: "#ffffff", fontSize: 18, textAlign: "center" },
  resultMain: { fontSize: 24, fontWeight: "700" },
  nextButton: { alignSelf: "stretch", borderColor: "#ffffff", backgroundColor: "rgba(255,255,255,0.15)" },
});
