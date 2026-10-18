import type { ShowFormat } from "@sinema/shared";
import { useTranslations } from "use-intl";
import { Badge } from "@/components/ui/badge";

/** 2D, 3D, IMAX or IMAX 3D, in a neutral colour: red is kept for warnings such as few seats left. */
export function FormatBadge({ format }: { format: ShowFormat }) {
  const t = useTranslations("format");
  return <Badge variant="secondary">{t(format)}</Badge>;
}
