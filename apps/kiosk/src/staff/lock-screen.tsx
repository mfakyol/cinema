import type { AuthResponse } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { checkPin, storeLockPin } from "@/lib/pin";
import { sessionStore } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Wrong PINs allowed before the lock screen asks for the account password instead. */
const MAX_TRIES = 3;

/**
 * Covers the whole box office while staff are away. The sale underneath is kept; the staff
 * member's lock PIN unlocks it, or, after too many wrong PINs, their password.
 */
export function LockScreen({
  name,
  email,
  onUnlock,
  onSignOut,
}: {
  name: string;
  email: string;
  /** `withPassword` is true when the PIN was replaced by the password. */
  onUnlock: (withPassword: boolean) => void;
  onSignOut: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const now = useNow({ updateInterval: 30_000 });
  const [tries, setTries] = useState(0);
  const [checking, setChecking] = useState(false);
  const needsPassword = tries >= MAX_TRIES;

  const verify = async (pin: string) => {
    setChecking(true);
    const ok = await checkPin(pin);
    setChecking(false);
    if (ok) onUnlock(false);
    else setTries((count) => count + 1);
  };

  // The password signs in again, which also refreshes the session and the PIN digest.
  const withPassword = useMutation({
    mutationFn: (password: string) => api.post<AuthResponse>("/auth/login", { email, password }),
    onSuccess: async (session) => {
      storeLockPin(session.lockPin);
      await sessionStore.set(session);
      onUnlock(true);
    },
  });

  const onPasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (password) withPassword.mutate(password);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
    >
      <div className="space-y-2 text-center">
        <Lock className="mx-auto size-10 text-primary" aria-hidden />
        <p className="text-5xl font-bold tabular-nums">
          {format.dateTime(now, { hour: "2-digit", minute: "2-digit" })}
        </p>
        <h1 id="lock-title" className="text-2xl font-semibold">
          {t("kiosk.locked")}
        </h1>
        <p className="text-muted-foreground">
          {needsPassword ? t("kiosk.passwordNeeded") : t("kiosk.lockedHint", { name })}
        </p>
      </div>

      {needsPassword ? (
        <form onSubmit={onPasswordSubmit} className="w-full max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unlock-password">{t("auth.password")}</Label>
            <Input
              id="unlock-password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="h-11"
              aria-invalid={withPassword.isError || undefined}
            />
          </div>
          {withPassword.isError && (
            <p className="text-sm font-medium text-destructive" role="status">
              {errorMessage(withPassword.error)}
            </p>
          )}
          <Button type="submit" size="lg" className="h-12 w-full" disabled={withPassword.isPending}>
            {t("kiosk.unlock")}
          </Button>
        </form>
      ) : (
        <>
          <p className={cn("h-5 text-sm font-medium text-destructive", tries === 0 && "invisible")} role="status">
            {t("kiosk.wrongPin", { left: MAX_TRIES - tries })}
          </p>
          <PinPad disabled={checking} onComplete={(pin) => void verify(pin)} />
        </>
      )}

      <Button variant="link" className="text-muted-foreground" onClick={onSignOut}>
        {t("kiosk.switchUser")}
      </Button>
    </div>
  );
}
