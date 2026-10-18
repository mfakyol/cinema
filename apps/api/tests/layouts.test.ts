import { LayoutError, layoutColumns, seatsFromLayout } from "@sinema/shared";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { applyLayout } from "../src/services/layouts.js";
import { api, checkout, createFixture, createUser, lock } from "./helpers.js";

const rows = [
  { label: "A", cells: "WSS_SSW" },
  { label: "B", cells: "_SS_SS" },
];

describe("hall layouts", () => {
  it("numbers seats left to right, skipping aisles, and keeps their columns", () => {
    const seats = seatsFromLayout(rows);
    expect(seats.map((s) => `${s.row}${s.number}@${s.column}:${s.type}`)).toEqual([
      "A1@0:WHEELCHAIR",
      "A2@1:STANDARD",
      "A3@2:STANDARD",
      "A4@4:STANDARD",
      "A5@5:STANDARD",
      "A6@6:WHEELCHAIR",
      "B1@1:STANDARD",
      "B2@2:STANDARD",
      "B3@4:STANDARD",
      "B4@5:STANDARD",
    ]);
    expect(layoutColumns(rows)).toBe(7);
  });

  it("rejects unknown cells, empty rows and repeated labels", () => {
    expect(() => seatsFromLayout([{ label: "A", cells: "SX" }])).toThrow(LayoutError);
    expect(() => seatsFromLayout([{ label: "A", cells: "___" }])).toThrow(/no seats/);
    expect(() => seatsFromLayout([{ label: "A", cells: "S" }, { label: "A", cells: "S" }])).toThrow(/twice/);
    expect(() => seatsFromLayout([])).toThrow(LayoutError);
  });

  it("rebuilds a hall's seats from a layout and maps them with their columns", async () => {
    const { hall, showtime } = await createFixture();
    const layout = await prisma.hallLayout.create({ data: { name: "Test layout", rows } });

    expect(await applyLayout(hall.id, layout.id)).toBe(10);
    const map = await api().get(`/api/showtimes/${showtime.id}/seats`).expect(200);
    expect(map.body.columns).toBe(7);
    expect(map.body.seats[0]).toMatchObject({ row: "A", number: 1, column: 0, type: "WHEELCHAIR" });
    expect(map.body.seats.find((s: { row: string; number: number }) => s.row === "B" && s.number === 1)).toMatchObject({
      column: 1,
      type: "STANDARD",
    });
    expect((await prisma.hall.findUniqueOrThrow({ where: { id: hall.id } })).layoutId).toBe(layout.id);
  });

  it("refuses to change the plan of a hall with sold or held seats", async () => {
    const { hall, showtime, seats } = await createFixture();
    const layout = await prisma.hallLayout.create({ data: { name: "Another layout", rows } });
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    await expect(applyLayout(hall.id, layout.id)).rejects.toMatchObject({ code: "HALL_IN_USE" });

    await checkout(token, showtime.id).expect(201);
    await expect(applyLayout(hall.id, layout.id)).rejects.toMatchObject({ code: "HALL_IN_USE" });
  });

  it("rejects a stored layout that does not parse", async () => {
    const { hall } = await createFixture();
    const broken = await prisma.hallLayout.create({ data: { name: "Broken", rows: [{ label: "A", cells: "SQ" }] } });
    await expect(applyLayout(hall.id, broken.id)).rejects.toMatchObject({ code: "INVALID_LAYOUT" });
  });
});
