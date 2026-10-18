import { Delete } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { PIN_LENGTH } from "@/lib/pin";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Six dots and a large number pad, also typed on the keyboard. Hands the PIN over as soon as
 * the sixth digit is in, then clears itself.
 */
export function PinPad({
  onComplete,
  disabled = false,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("kiosk");
  const [digits, setDigits] = useState("");
  // Keys can arrive faster than renders; the ref always holds what was typed so far.
  const typed = useRef("");

  const show = (value: string) => {
    typed.current = value;
    setDigits(value);
  };
  const press = (digit: string) => {
    if (disabled || typed.current.length >= PIN_LENGTH) return;
    const next = typed.current + digit;
    if (next.length < PIN_LENGTH) {
      show(next);
      return;
    }
    show("");
    onComplete(next);
  };
  const backspace = () => {
    if (!disabled) show(typed.current.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!/^\d$/.test(event.key) && event.key !== "Backspace") return;
      // The pad takes the key, so the digit never also lands in a field shown right after.
      event.preventDefault();
      if (event.key === "Backspace") backspace();
      else press(event.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key = "size-20 text-2xl font-semibold";
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-3" aria-hidden>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn("size-4 rounded-full border-2 border-foreground/40", i < digits.length && "border-primary bg-primary")}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((digit) => (
          <Button key={digit} variant="outline" className={key} disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </Button>
        ))}
        <span />
        <Button variant="outline" className={key} disabled={disabled} onClick={() => press("0")}>
          0
        </Button>
        <Button
          variant="ghost"
          className="size-20"
          disabled={disabled || digits.length === 0}
          aria-label={t("deleteDigit")}
          onClick={backspace}
        >
          <Delete className="size-7" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
