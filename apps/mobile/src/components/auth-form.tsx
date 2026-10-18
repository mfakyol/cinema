import { loginSchema, registerSchema, type AuthResponse } from "@sinema/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ComponentProps, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useTranslations } from "use-intl";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { sessionStore } from "@/lib/session";
import { spacing } from "@/lib/theme";
import { Button, Notice, Screen, Text, TextField } from "./ui";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const submit = useMutation({
    mutationFn: (input: unknown) => api.post<AuthResponse>(`/auth/${mode}`, input),
    onSuccess: async (session) => {
      await sessionStore.set(session);
      void queryClient.invalidateQueries();
      router.back();
    },
  });

  const onSubmit = () => {
    const input = mode === "login" ? { email: values.email, password: values.password } : values;
    const result = (mode === "login" ? loginSchema : registerSchema).safeParse(input);
    if (!result.success) {
      setInvalid(new Set(result.error.issues.map((issue) => String(issue.path[0]))));
      return;
    }
    setInvalid(new Set());
    submit.mutate(result.data);
  };

  const field = (name: keyof typeof values, extra: Partial<ComponentProps<typeof TextField>>) => (
    <TextField
      label={t(`auth.${name}`)}
      value={values[name]}
      onChangeText={(text) => setValues((current) => ({ ...current, [name]: text }))}
      invalid={invalid.has(name)}
      autoCapitalize="none"
      autoCorrect={false}
      {...extra}
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">{t(mode === "login" ? "auth.signInTitle" : "auth.registerTitle")}</Text>
          <Text variant="muted">{t(mode === "login" ? "auth.signInSubtitle" : "auth.registerSubtitle")}</Text>
        </View>
        {mode === "register" && field("name", { autoCapitalize: "words", autoComplete: "name", textContentType: "name" })}
        {field("email", { keyboardType: "email-address", autoComplete: "email", textContentType: "emailAddress" })}
        {field("password", {
          secureTextEntry: true,
          autoComplete: mode === "login" ? "current-password" : "new-password",
          textContentType: mode === "login" ? "password" : "newPassword",
          onSubmitEditing: onSubmit,
        })}
        {(invalid.size > 0 || submit.isError) && (
          <Notice text={invalid.size > 0 ? t("errors.VALIDATION") : errorMessage(submit.error)} />
        )}
        <Button
          title={t(mode === "login" ? "common.signIn" : "common.register")}
          loading={submit.isPending}
          onPress={onSubmit}
        />
        <Button
          title={`${t(mode === "login" ? "auth.noAccount" : "auth.haveAccount")} ${t(
            mode === "login" ? "common.register" : "common.signIn",
          )}`}
          variant="ghost"
          onPress={() => router.replace(mode === "login" ? "/register" : "/sign-in")}
        />
        {mode === "login" && (
          <Text variant="small" style={{ textAlign: "center" }}>
            {t("auth.demoHint", { email: "customer@sinema.test", password: "demo1234" })}
          </Text>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
