"use client";

import type { AdminLayout } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { LayoutEditor } from "../layout-editor";

export function EditLayout({ id }: { id: string }) {
  const layout = useQuery({
    queryKey: ["admin", "layouts", id],
    queryFn: () => apiFetch<{ layout: AdminLayout }>(`/admin/layouts/${id}`),
  });
  if (layout.isError) return <LoadError onRetry={() => void layout.refetch()} />;
  if (!layout.data) return <Skeleton className="h-96 w-full" />;
  // Keyed by the saved version, so the editor starts again from what was saved.
  return <LayoutEditor key={JSON.stringify(layout.data.layout)} layout={layout.data.layout} />;
}
