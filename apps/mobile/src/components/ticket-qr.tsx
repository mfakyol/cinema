import { concessionUrl, type QrKind, ticketUrl } from "@sinema/shared";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SITE_URL } from "@/lib/api";
import { radius } from "@/lib/theme";

/** The link a QR code holds: /t/ for tickets, /c/ for snacks, drinks and glasses. */
export const qrLink = (kind: QrKind, qrToken: string) =>
  kind === "ticket" ? ticketUrl(SITE_URL, qrToken) : concessionUrl(SITE_URL, qrToken);

/** A ticket or item QR code, black on white in both themes so scanners read it. */
export function TicketQr({
  qrToken,
  size,
  label,
  kind = "ticket",
}: {
  qrToken: string;
  size: number;
  label: string;
  kind?: QrKind;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ backgroundColor: "#ffffff", padding: size * 0.06, borderRadius: radius.md, alignSelf: "center" }}
    >
      <QRCode value={qrLink(kind, qrToken)} size={size} color="#000000" backgroundColor="#ffffff" />
    </View>
  );
}
