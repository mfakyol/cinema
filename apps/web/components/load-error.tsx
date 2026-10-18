"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common");
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex items-center justify-between gap-4">
        {t("loadFailed")}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
