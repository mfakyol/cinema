import { type AuthResponse, loginSchema } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { storeLockPin } from "@/lib/pin";
import { sessionStore } from "@/lib/session";

class NotStaffError extends Error {}

/** The seeded demo staff account, filled in with one tap on the hint. */
const DEMO = { email: "staff@sinema.test", password: "demo1234" };

/**
 * Staff and admin accounts only; a customer account is turned away without being kept. The
 * account's lock PIN digest comes with the session.
 */
export function SignIn() {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [invalid, setInvalid] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const fillDemo = () => {
    if (emailRef.current) emailRef.current.value = DEMO.email;
    if (passwordRef.current) passwordRef.current.value = DEMO.password;
    setInvalid(false);
  };

  const signIn = useMutation({
    mutationFn: async (credentials: unknown) => {
      const session = await api.post<AuthResponse>("/auth/login", credentials);
      if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") throw new NotStaffError();
      storeLockPin(session.lockPin);
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
            <Input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              aria-invalid={invalid || undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              ref={passwordRef}
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
          <Button type="button" variant="link" size="sm" className="w-full text-muted-foreground" onClick={fillDemo}>
            {t("auth.demoHint", DEMO)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
