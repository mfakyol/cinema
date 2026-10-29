"use client";

import { SHOW_FORMATS, type ShowFormat } from "@sinema/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/lib/format";

/** A native select styled like the inputs. */
export const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

/** An admin change: refreshes every admin list afterwards and reports the outcome. */
export function useAdminMutation<TInput, TResult = unknown>(
  request: (input: TInput) => Promise<TResult>,
  success: string | ((result: TResult) => string),
) {
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(typeof success === "string" ? success : success(result));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Toggle buttons for the formats a hall can show; at least one stays on. */
export function FormatPicker({
  value,
  onChange,
  disabled,
}: {
  value: ShowFormat[];
  onChange: (formats: ShowFormat[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.formats")}>
      {SHOW_FORMATS.map((format) => {
        const on = value.includes(format);
        return (
          <Button
            key={format}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            disabled={disabled || (on && value.length === 1)}
            onClick={() =>
              onChange(on ? value.filter((f) => f !== format) : SHOW_FORMATS.filter((f) => f === format || value.includes(f)))
            }
          >
            {t(`format.${format}`)}
          </Button>
        );
      })}
    </div>
  );
}

/** A local "YYYY-MM-DD" for date inputs, `offset` days from today. */
export function isoDay(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
