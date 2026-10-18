import { type AuthResponse, loginSchema } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useTranslations } from "use-intl";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { sessionStore } from "@/lib/session";
import { spacing } from "@/lib/theme";

/** Raised when a valid account is not a staff account; it never gets stored. */
class NotStaffError extends Error {}

export default function StaffSignInScreen() {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const session = await api.post<AuthResponse>("/auth/login", input);
      // Customers have accounts too; only staff and admins may use this app.
      if (session.user.role === "CUSTOMER") throw new NotStaffError();
      return session;
    },
    onSuccess: async (session) => {
      await sessionStore.set(session);
      router.replace("/");
    },
  });

  const onSubmit = () => {
    const result = loginSchema.safeParse({ email, password });
    setInvalid(!result.success);
    if (result.success) submit.mutate(result.data);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">{t("staff.signInTitle")}</Text>
          <Text variant="muted">{t("staff.signInSubtitle")}</Text>
        </View>
        <TextField
          label={t("auth.email")}
          value={email}
          onChangeText={setEmail}
          invalid={invalid}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label={t("auth.password")}
          value={password}
          onChangeText={setPassword}
          invalid={invalid}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={onSubmit}
        />
        {(invalid || submit.isError) && (
          <Notice
            text={
              invalid
                ? t("errors.VALIDATION")
                : submit.error instanceof NotStaffError
                  ? t("staff.notStaff")
                  : errorMessage(submit.error)
            }
          />
        )}
        <Button title={t("common.signIn")} loading={submit.isPending} onPress={onSubmit} />
        <Text variant="small" style={{ textAlign: "center" }}>
          {t("auth.demoHint", { email: "staff@sinema.test", password: "demo1234" })}
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
