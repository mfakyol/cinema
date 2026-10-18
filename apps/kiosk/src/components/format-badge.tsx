import type { ShowFormat } from "@sinema/shared";
import { useTranslations } from "use-intl";
import { Badge } from "@/components/ui/badge";

/** 2D, 3D, IMAX or IMAX 3D; anything beyond plain 2D stands out. */
export function FormatBadge({ format }: { format: ShowFormat }) {
  const t = useTranslations("format");
  return <Badge variant={format === "TWO_D" ? "secondary" : "default"}>{t(format)}</Badge>;
}
