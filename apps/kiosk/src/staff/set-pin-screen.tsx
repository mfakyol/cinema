import type { LockPin } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { PinPad } from "@/components/pin-pad";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { storeLockPin } from "@/lib/pin";
import { cn } from "@/lib/utils";

/**
 * Sets the staff member's lock PIN on their account: typed twice, then saved on the server,
 * which sends the new digest back for this box office. Shown once for staff without a PIN, and
 * from the header to change it (`onCancel` then closes it).
 */
export function SetPinScreen({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [first, setFirst] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const save = useMutation({
    mutationFn: (pin: string) => api.fetch<{ lockPin: LockPin }>("/me/pin", { method: "PUT", body: JSON.stringify({ pin }) }),
    onSuccess: ({ lockPin }) => {
      storeLockPin(lockPin);
      onDone();
    },
    onError: () => setFirst(null),
  });

  const onComplete = (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setMismatch(false);
    } else if (pin === first) {
      save.mutate(pin);
    } else {
      setFirst(null);
      setMismatch(true);
    }
  };

  const message = save.isError ? errorMessage(save.error) : mismatch ? t("kiosk.pinMismatch") : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-pin-title"
    >
      <div className="space-y-2 text-center">
        <KeyRound className="mx-auto size-10 text-primary" aria-hidden />
        <h1 id="set-pin-title" className="text-2xl font-semibold">
          {t(first === null ? "kiosk.setPinTitle" : "kiosk.repeatPin")}
        </h1>
        <p className="max-w-sm text-muted-foreground">{t("kiosk.setPinHint")}</p>
      </div>
      <p className={cn("h-5 text-sm font-medium text-destructive", !message && "invisible")} role="status">
        {message}
      </p>
      {/* A new pad for the second entry, so the first one's dots never carry over. */}
      <PinPad key={first ?? "first"} disabled={save.isPending} onComplete={onComplete} />
      {onCancel && (
        <Button variant="link" className="text-muted-foreground" onClick={onCancel}>
          {t("kiosk.cancel")}
        </Button>
      )}
    </div>
  );
}
