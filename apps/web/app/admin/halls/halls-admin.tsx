"use client";

import type { AdminHall, AdminLayout, ShowFormat } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FormatPicker, selectClass, useAdminMutation } from "../admin-ui";
import { layoutsQuery } from "../layouts/layout-list";

export const hallsQuery = {
  queryKey: ["admin", "halls"],
  queryFn: () => apiFetch<{ halls: AdminHall[] }>("/admin/halls"),
};

/** One hall: its name, formats and layout, each saved on its own. */
function HallRow({ hall, layouts }: { hall: AdminHall; layouts: AdminLayout[] }) {
  const t = useTranslations("admin");
  const [name, setName] = useState(hall.name);
  const [layoutId, setLayoutId] = useState(hall.layout?.id ?? "");

  const update = useAdminMutation(
    (body: { name?: string; formats?: ShowFormat[] }) =>
      apiFetch(`/admin/halls/${hall.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    t("saved"),
  );
  const apply = useAdminMutation(
    () => apiFetch(`/admin/halls/${hall.id}/layout`, { method: "PUT", body: JSON.stringify({ layoutId }) }),
    t("layoutApplied"),
  );

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor={`hall-${hall.id}`}>{t("name")}</Label>
          <div className="flex gap-2">
            <Input id={`hall-${hall.id}`} value={name} onChange={(event) => setName(event.target.value)} className="max-w-56" />
            <Button
              variant="outline"
              disabled={!name.trim() || name.trim() === hall.name || update.isPending}
              onClick={() => update.mutate({ name: name.trim() })}
            >
              {t("save")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("seats", { count: hall.seatCount })} · {t("upcoming", { count: hall.upcomingShowtimes })}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">{t("formats")}</span>
          <FormatPicker value={hall.formats} disabled={update.isPending} onChange={(formats) => update.mutate({ formats })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`layout-${hall.id}`}>{t("layout")}</Label>
          <div className="flex gap-2">
            <select
              id={`layout-${hall.id}`}
              className={selectClass}
              value={layoutId}
              disabled={hall.hasSales}
              onChange={(event) => setLayoutId(event.target.value)}
            >
              {!hall.layout && <option value="">{t("noLayout")}</option>}
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name} ({t("seats", { count: layout.seatCount })})
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={hall.hasSales || !layoutId || (layoutId === hall.layout?.id && hall.seatCount > 0) || apply.isPending}
              onClick={() => apply.mutate(undefined)}
            >
              {t("applyLayout")}
            </Button>
          </div>
          {hall.hasSales && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              {t("planLocked")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewHall({ layouts, onDone }: { layouts: AdminLayout[]; onDone: () => void }) {
  const t = useTranslations("admin");
  const [name, setName] = useState("");
  const [formats, setFormats] = useState<ShowFormat[]>(["TWO_D"]);
  const [layoutId, setLayoutId] = useState(layouts[0]?.id ?? "");
  const create = useAdminMutation(
    () =>
      apiFetch("/admin/halls", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), formats, ...(layoutId ? { layoutId } : {}) }),
      }),
    t("saved"),
  );

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{t("newHall")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="new-hall-name">{t("name")}</Label>
          <Input id="new-hall-name" value={name} onChange={(event) => setName(event.target.value)} className="max-w-56" />
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">{t("formats")}</span>
          <FormatPicker value={formats} onChange={setFormats} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-hall-layout">{t("layout")}</Label>
          <select id="new-hall-layout" className={cn(selectClass, "w-full")} value={layoutId} onChange={(event) => setLayoutId(event.target.value)}>
            <option value="">{t("noLayout")}</option>
            {layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 lg:col-span-3">
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate(undefined, { onSuccess: onDone })}>
            {t("create")}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function HallsAdmin() {
  const t = useTranslations("admin");
  const halls = useQuery(hallsQuery);
  const layouts = useQuery(layoutsQuery);
  const [adding, setAdding] = useState(false);

  if (halls.isError || layouts.isError) {
    return <LoadError onRetry={() => void Promise.all([halls.refetch(), layouts.refetch()])} />;
  }
  if (!halls.data || !layouts.data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("halls")}</h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("newHall")}
          </Button>
        )}
      </div>
      {adding && <NewHall layouts={layouts.data.layouts} onDone={() => setAdding(false)} />}
      <ul className="space-y-4">
        {halls.data.halls.map((hall) => (
          <li key={hall.id}>
            {/* Keyed by what was saved, so the inputs reset after each save. */}
            <HallRow key={`${hall.name}:${hall.layout?.id}`} hall={hall} layouts={layouts.data.layouts} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        <Badge variant="secondary">{t("layouts")}</Badge> {t("reapplyHint")}
      </p>
    </div>
  );
}
