import { type AuthResponse, loginSchema } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { sessionStore } from "@/lib/session";

class NotStaffError extends Error {}

/** Staff and admin accounts only; a customer account is turned away without being kept. */
export function SignIn() {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [invalid, setInvalid] = useState(false);

  const signIn = useMutation({
    mutationFn: async (input: unknown) => {
      const session = await api.post<AuthResponse>("/auth/login", input);
      if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") throw new NotStaffError();
      await sessionStore.set(session);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    setInvalid(!result.success);
    if (result.success) signIn.mutate(result.data);
  };

  return (
    <Card className="m-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t("kiosk.signInTitle")}</CardTitle>
        <CardDescription>{t("kiosk.signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required aria-invalid={invalid || undefined} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={invalid || undefined}
            />
          </div>
          {(invalid || signIn.isError) && (
            <Alert variant="destructive">
              <AlertDescription>
                {invalid
                  ? t("errors.VALIDATION")
                  : signIn.error instanceof NotStaffError
                    ? t("kiosk.notStaff")
                    : errorMessage(signIn.error)}
              </AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
            {t("common.signIn")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.demoHint", { email: "staff@sinema.test", password: "demo1234" })}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
