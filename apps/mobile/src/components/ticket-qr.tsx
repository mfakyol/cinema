import { ticketUrl } from "@sinema/shared";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { radius } from "@/lib/theme";
import { SITE_URL } from "@/lib/api";

/** A ticket's QR code: a link to its page, black on white in both themes so scanners read it. */
export function TicketQr({ qrToken, size, label }: { qrToken: string; size: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ backgroundColor: "#ffffff", padding: size * 0.06, borderRadius: radius.md, alignSelf: "center" }}
    >
      <QRCode value={ticketUrl(SITE_URL, qrToken)} size={size} color="#000000" backgroundColor="#ffffff" />
    </View>
  );
}
