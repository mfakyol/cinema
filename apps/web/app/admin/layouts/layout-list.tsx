"use client";

import type { AdminLayout, LayoutRow } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export const layoutsQuery = {
  queryKey: ["admin", "layouts"],
  queryFn: () => apiFetch<{ layouts: AdminLayout[] }>("/admin/layouts"),
};

/** A thumbnail of the plan: one dot per cell. */
function PlanPreview({ rows }: { rows: LayoutRow[] }) {
  return (
    <div aria-hidden className="space-y-0.5">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-0.5">
          {[...row.cells].map((cell, i) => (
            <span
              key={i}
              className={cn("size-1.5 rounded-[1px]", cell === "S" && "bg-muted-foreground/60", cell === "W" && "bg-primary")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LayoutList() {
  const t = useTranslations("admin");
  const layouts = useQuery(layoutsQuery);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("layouts")}</h1>
        <Button asChild>
          <Link href="/admin/layouts/new">
            <Plus aria-hidden />
            {t("newLayout")}
          </Link>
        </Button>
      </div>
      {layouts.isError && <LoadError onRetry={() => void layouts.refetch()} />}
      {layouts.isPending && <Skeleton className="h-48 w-full" />}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {layouts.data?.layouts.map((layout) => (
          <li key={layout.id}>
            <Link href={`/admin/layouts/${layout.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <h2 className="font-semibold">{layout.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("seats", { count: layout.seatCount })} · {t("usedBy", { count: layout.hallCount })}
                    </p>
                  </div>
                  <PlanPreview rows={layout.rows} />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
