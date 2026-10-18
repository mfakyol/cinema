import type { ConcessionVoucher } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Share, useWindowDimensions, View } from "react-native";
import { useFormatter, useLocale, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { qrLink, TicketQr } from "@/components/ticket-qr";
import { BottomBar, Button, Card, Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";

/** One snack, drink or pair of glasses: its QR code for the stand, and a share button. */
export default function ConcessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as "en" | "tr";
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  // The list is already loaded; read the item from it instead of another request.
  const vouchers = useQuery({
    queryKey: ["concessions", session?.user.id],
    queryFn: () => api.fetch<{ vouchers: ConcessionVoucher[] }>("/me/concessions"),
    enabled: Boolean(session),
  });

  if (vouchers.isError) {
    return (
      <Screen>
        <LoadError onRetry={() => void vouchers.refetch()} />
      </Screen>
    );
  }
  const voucher = vouchers.data?.vouchers.find((item) => item.id === id);
  if (!voucher) return <Loading />;

  const name = voucher.product.name[locale];
  const valid = voucher.status === "PAID";
  // Shares this item's own link, so a friend can collect just this one.
  const share = () =>
    Share.share({
      message: `${t("concessions.shareItemText", { item: name, movie: voucher.showtime?.movie.title ?? "" })}\n${qrLink("concession", voucher.qrToken)}`,
    });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Card style={{ opacity: valid ? 1 : 0.7 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="small" style={{ color: colors.primary, fontWeight: "600" }}>
                {t("common.appName")}
              </Text>
              <Text variant="title">{name}</Text>
            </View>
            <Text variant="small" style={{ color: valid ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
              {t(`concessions.status.${voucher.status}`)}
            </Text>
          </View>
          <TicketQr
            kind="concession"
            qrToken={voucher.qrToken}
            size={Math.min(width - 96, 260)}
            label={t("concessions.showAtStand")}
          />
          {valid && (
            <Text variant="small" style={{ textAlign: "center" }}>
              {t("concessions.showAtStand")}
            </Text>
          )}
          {voucher.showtime && (
            <Text variant="muted" style={{ textAlign: "center" }}>
              {voucher.showtime.movie.title} ·{" "}
              {format.dateTime(new Date(voucher.showtime.startsAt), {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {voucher.showtime.hall.name}
            </Text>
          )}
        </Card>
      </Screen>
      <BottomBar>
        <Button title={t("concessions.shareItem")} onPress={() => void share()} />
      </BottomBar>
    </View>
  );
}
