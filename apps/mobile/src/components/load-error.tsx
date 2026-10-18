import { useTranslations } from "use-intl";
import { Button, Notice } from "./ui";

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common");
  return <Notice text={t("loadFailed")} action={<Button title={t("retry")} variant="outline" onPress={onRetry} />} />;
}
