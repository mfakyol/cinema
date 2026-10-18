import { errorCode } from "@sinema/client";
import type { Ticket } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { Redirect, Stack, useIsFocused } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { Button, Card, Screen, Text, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { sessionStore, useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";

type Result = { admitted: true; ticket: Ticket } | { admitted: false; code: string };

export default function ScanScreen() {
  const t = useTranslations();
  const { session } = useSession();
  const [result, setResult] = useState<Result | null>(null);
  // A camera fires many events for one code; handle only the first until the result is closed.
  const handling = useRef(false);

  const verify = useMutation({
    mutationFn: (scanned: string) => api.post<{ ticket: Ticket }>("/tickets/verify", { qrToken: scanned }),
    onSuccess: ({ ticket }) => setResult({ admitted: true, ticket }),
    onError: (error) => setResult({ admitted: false, code: errorCode(error) }),
  });

  if (!session || session.user.role === "CUSTOMER") return <Redirect href="/sign-in" />;

  const scan = (scanned: string) => {
    if (handling.current || !scanned.trim()) return;
    handling.current = true;
    verify.mutate(scanned);
  };
  const next = () => {
    setResult(null);
    verify.reset();
    handling.current = false;
  };

  return (
    <>
      <Stack.Screen
        options={{
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
        <Scanner checking={verify.isPending} onScan={scan} />
      )}
    </>
  );
}

function Scanner({ checking, onScan }: { checking: boolean; onScan: (scanned: string) => void }) {
  const t = useTranslations();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  // Only one camera preview can run at a time; drop it when the screen is not shown.
  const focused = useIsFocused();
  const [manual, setManual] = useState("");

  return (
    <Screen>
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
          title={t("staff.check")}
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
  const colors = useColors();
  const background = result.admitted ? colors.success : colors.destructive;

  return (
    <View style={[styles.result, { backgroundColor: background }]} accessibilityLiveRegion="assertive">
      <Text style={styles.resultMark} accessibilityElementsHidden>
        {result.admitted ? "✓" : "✕"}
      </Text>
      <Text style={styles.resultTitle} accessibilityRole="header">
        {result.admitted ? t("staff.admitted") : t("staff.rejected")}
      </Text>
      {result.admitted ? (
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={styles.resultLine}>{result.ticket.showtime.movie.title}</Text>
          <Text style={styles.resultLine}>
            {format.dateTime(new Date(result.ticket.showtime.startsAt), {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {result.ticket.showtime.hall.name}
          </Text>
          <Text style={[styles.resultLine, styles.resultSeat]}>
            {t("seats.seatLabel", { row: result.ticket.seat.row, number: result.ticket.seat.number })}
            {result.ticket.seat.type === "VIP" ? ` · ${t("seats.vip")}` : ""}
          </Text>
        </View>
      ) : (
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
  resultTitle: { color: "#ffffff", fontSize: 32, fontWeight: "800" },
  resultLine: { color: "#ffffff", fontSize: 18, textAlign: "center" },
  resultSeat: { fontSize: 24, fontWeight: "700" },
  nextButton: { alignSelf: "stretch", borderColor: "#ffffff", backgroundColor: "rgba(255,255,255,0.15)" },
});
