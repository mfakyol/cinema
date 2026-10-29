"use client";

import { type AdminLayout, LayoutError, layoutSchema, type LayoutRow, seatsFromLayout } from "@sinema/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cell = "S" | "W" | "_";
interface EditorRow {
  label: string;
  cells: Cell[];
}

const BRUSHES: { cell: Cell; key: "brushSeat" | "brushWheelchair" | "brushAisle" }[] = [
  { cell: "S", key: "brushSeat" },
  { cell: "W", key: "brushWheelchair" },
  { cell: "_", key: "brushAisle" },
];

const cellStyle: Record<Cell, string> = {
  S: "border border-border bg-secondary",
  W: "border border-border bg-secondary ring-2 ring-primary/70",
  _: "border border-dashed border-border/60 bg-transparent",
};

/** Every row as wide as the widest, padded with aisle cells, so the grid is a rectangle. */
function toEditorRows(rows: readonly LayoutRow[]): EditorRow[] {
  const width = Math.max(1, ...rows.map((row) => row.cells.length));
  return rows.map(({ label, cells }) => ({
    label,
    cells: [...cells.padEnd(width, "_")] as Cell[],
  }));
}

/** What is saved: trailing aisle cells mean nothing, so they are dropped. */
const toLayoutRows = (rows: EditorRow[]): LayoutRow[] =>
  rows.map(({ label, cells }) => ({ label: label.trim(), cells: cells.join("").replace(/_+$/, "") }));

/** The next row label after the last one: A, B, … Z, AA, AB, … */
function nextLabel(rows: EditorRow[]): string {
  const last = rows.at(-1)?.label.trim().toUpperCase() ?? "";
  if (!/^[A-Z]+$/.test(last)) return String.fromCharCode(65 + rows.length);
  const chars = [...last];
  let i = chars.length - 1;
  while (i >= 0 && chars[i] === "Z") chars[i--] = "A";
  if (i < 0) chars.unshift("A");
  else chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
  return chars.join("");
}

const BLANK: LayoutRow[] = ["A", "B", "C", "D", "E"].map((label) => ({ label, cells: "SSSS_SSSS" }));

/**
 * Draws a hall's seating plan. Pick a brush and click or drag over cells; rows and columns can
 * be added and removed, and row labels edited. The stats and validity update as you draw.
 */
export function LayoutEditor({ layout }: { layout?: AdminLayout }) {
  const t = useTranslations("admin");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(layout?.name ?? "");
  const [rows, setRows] = useState<EditorRow[]>(() => toEditorRows(layout?.rows ?? BLANK));
  const [brush, setBrush] = useState<Cell>("S");
  const painting = useRef(false);

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const paint = (row: number, column: number) =>
    setRows((current) =>
      current[row]?.cells[column] === brush
        ? current
        : current.map((r, i) => (i === row ? { ...r, cells: r.cells.map((c, j) => (j === column ? brush : c)) } : r)),
    );

  /** The cell under the pointer, for drags (a touch keeps sending events to where it started). */
  const cellAt = (event: PointerEvent) => {
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const row = element?.dataset.row;
    const column = element?.dataset.column;
    return row !== undefined && column !== undefined ? { row: Number(row), column: Number(column) } : null;
  };

  const layoutRows = toLayoutRows(rows);
  let seats: ReturnType<typeof seatsFromLayout> = [];
  let planError = false;
  try {
    seats = seatsFromLayout(layoutRows);
  } catch (error) {
    if (!(error instanceof LayoutError)) throw error;
    planError = true;
  }
  const valid = layoutSchema.safeParse({ name, rows: layoutRows }).success;
  const width = rows[0]?.cells.length ?? 0;

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ layout: AdminLayout }>(layout ? `/admin/layouts/${layout.id}` : "/admin/layouts", {
        method: layout ? "PUT" : "POST",
        body: JSON.stringify({ name, rows: layoutRows }),
      }),
    onSuccess: ({ layout: saved }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("saved"));
      if (!layout) router.replace(`/admin/layouts/${saved.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch<void>(`/admin/layouts/${layout!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("deleted"));
      router.replace("/admin/layouts");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{layout ? t("editLayout") : t("newLayout")}</h1>
        <div className="flex gap-2">
          {layout && (
            <Button
              variant="outline"
              disabled={layout.hallCount > 0 || remove.isPending}
              title={layout.hallCount > 0 ? t("inUseHint") : undefined}
              onClick={() => remove.mutate()}
            >
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          )}
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {layout ? t("save") : t("create")}
          </Button>
        </div>
      </div>

      <div className="max-w-sm space-y-2">
        <Label htmlFor="layout-name">{t("name")}</Label>
        <Input id="layout-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      {layout && layout.hallCount > 0 && (
        <Alert>
          <AlertDescription>
            {t("usedBy", { count: layout.hallCount })}. {t("reapplyHint")}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("brush")}>
            <span className="text-sm font-medium">{t("brush")}</span>
            {BRUSHES.map(({ cell, key }) => (
              <Button
                key={cell}
                type="button"
                size="sm"
                role="radio"
                aria-checked={brush === cell}
                variant={brush === cell ? "default" : "outline"}
                onClick={() => setBrush(cell)}
              >
                <span aria-hidden className={cn("size-3.5 rounded-sm", cellStyle[cell])} />
                {t(key)}
              </Button>
            ))}
            <span className="ml-auto flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={width >= 60} onClick={() => setRows((r) => r.map((row) => ({ ...row, cells: [...row.cells, "_"] })))}>
                <Plus aria-hidden />
                {t("addColumn")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={width <= 1} onClick={() => setRows((r) => r.map((row) => ({ ...row, cells: row.cells.slice(0, -1) })))}>
                <Minus aria-hidden />
                {t("removeColumn")}
              </Button>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t("editorHint")}</p>

          <div className="overflow-x-auto p-2">
            <div className="mx-auto w-max space-y-1.5">
              <div className="mx-auto mb-4 h-2 w-4/5 rounded-t-full bg-gradient-to-b from-primary/60 to-transparent" />
              <div
                className="space-y-1.5 touch-none select-none"
                onPointerDown={(event) => {
                  const cell = cellAt(event);
                  if (!cell) return;
                  painting.current = true;
                  paint(cell.row, cell.column);
                }}
                onPointerMove={(event) => {
                  if (!painting.current) return;
                  const cell = cellAt(event);
                  if (cell) paint(cell.row, cell.column);
                }}
              >
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex items-center gap-1.5">
                    <Input
                      aria-label={t("rowLabel", { row: rowIndex + 1 })}
                      className="h-8 w-12 px-1 text-center"
                      maxLength={3}
                      value={row.label}
                      onChange={(event) =>
                        setRows((r) => r.map((item, i) => (i === rowIndex ? { ...item, label: event.target.value } : item)))
                      }
                    />
                    {row.cells.map((cell, column) => (
                      <button
                        key={column}
                        type="button"
                        data-row={rowIndex}
                        data-column={column}
                        aria-label={t("cell", {
                          row: row.label || rowIndex + 1,
                          column: column + 1,
                          kind: t(BRUSHES.find((b) => b.cell === cell)!.key),
                        })}
                        onClick={() => paint(rowIndex, column)}
                        className={cn(
                          "grid size-8 place-items-center rounded-t-lg rounded-b-sm text-[11px] transition-colors hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-ring",
                          cellStyle[cell],
                        )}
                      >
                        {cell === "W" ? <span aria-hidden>♿</span> : null}
                      </button>
                    ))}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={rows.length <= 1}
                      aria-label={t("removeRow", { label: row.label || rowIndex + 1 })}
                      onClick={() => setRows((r) => r.filter((_, i) => i !== rowIndex))}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length >= 40}
              onClick={() => setRows((r) => [...r, { label: nextLabel(r), cells: Array.from({ length: width }, () => "S" as Cell) }])}
            >
              <Plus aria-hidden />
              {t("addRow")}
            </Button>
            <p className={cn("text-sm", planError ? "font-medium text-destructive" : "text-muted-foreground")} role="status">
              {planError
                ? t("invalidPlan")
                : t("stats", {
                    seats: seats.length,
                    wheelchair: seats.filter((seat) => seat.type === "WHEELCHAIR").length,
                    rows: rows.length,
                  })}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
