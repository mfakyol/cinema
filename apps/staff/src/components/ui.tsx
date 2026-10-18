import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, useColors } from "@/lib/theme";

type TextVariant = "title" | "heading" | "body" | "muted" | "small";

export function Text({ variant = "body", style, ...props }: RNTextProps & { variant?: TextVariant }) {
  const colors = useColors();
  return (
    <RNText
      {...props}
      style={[
        textStyles[variant],
        { color: variant === "muted" || variant === "small" ? colors.mutedForeground : colors.foreground },
        style,
      ]}
    />
  );
}

const textStyles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 16 },
  muted: { fontSize: 15 },
  small: { fontSize: 13 },
});

/** A scrolling page with the standard padding; pass `onRefresh` for pull to refresh. */
export function Screen({
  children,
  contentContainerStyle,
  refreshing,
  onRefresh,
  ...props
}: ScrollViewProps & { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const colors = useColors();
  return (
    <ScrollView
      {...props}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[{ padding: spacing.lg, gap: spacing.lg }, contentContainerStyle]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
        style,
      ]}
    />
  );
}

type ButtonVariant = "primary" | "outline" | "ghost";

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  style,
  textColor,
  ...props
}: Omit<PressableProps, "style"> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For buttons on a coloured background. */
  textColor?: string;
}) {
  const colors = useColors();
  const inactive = disabled || loading;
  const background = variant === "primary" ? colors.primary : "transparent";
  const foreground =
    textColor ?? (variant === "primary" ? colors.primaryForeground : variant === "ghost" ? colors.primary : colors.foreground);
  return (
    <Pressable
      accessibilityLabel={title}
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          backgroundColor: background,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: colors.border,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator color={foreground} />}
      <RNText style={{ color: foreground, fontSize: 16, fontWeight: "600" }}>{title}</RNText>
    </Pressable>
  );
}

export function TextField({ label, invalid, ...props }: TextInputProps & { label: string; invalid?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="small" style={{ color: colors.foreground, fontWeight: "500" }}>
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: invalid ? colors.destructive : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          fontSize: 16,
          color: colors.foreground,
          backgroundColor: colors.background,
        }}
      />
    </View>
  );
}

/** A full-width notice, e.g. a failed load or a validation message. */
export function Notice({ text, tone = "error", action }: { text: string; tone?: "error" | "info"; action?: ReactNode }) {
  const colors = useColors();
  const color = tone === "error" ? colors.destructive : colors.foreground;
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: tone === "error" ? color : colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text style={{ color }}>{text}</Text>
      {action}
    </View>
  );
}

/** Actions pinned under a scrolling screen, clear of the home indicator. */
export function BottomBar({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: Math.max(insets.bottom, spacing.md),
        gap: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      {children}
    </View>
  );
}

export function Loading() {
  const colors = useColors();
  return (
    <View style={{ padding: spacing.xxl, alignItems: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
