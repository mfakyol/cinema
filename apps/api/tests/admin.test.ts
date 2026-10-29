import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, bearer, checkout, createFixture, createUser, lock } from "./helpers.js";

const plan = (rows: Record<string, string>) => Object.entries(rows).map(([label, cells]) => ({ label, cells }));

async function admin() {
  return bearer((await createUser("ADMIN")).token);
}

describe("admin: layouts", () => {
  it("is for admins only", async () => {
    await api().get("/api/admin/layouts").expect(401);
    for (const role of ["CUSTOMER", "STAFF"] as const) {
      const { token } = await createUser(role);
      await api().get("/api/admin/layouts").set(bearer(token)).expect(403);
    }
  });

  it("creates, lists, edits and deletes a layout", async () => {
    const auth = await admin();
    const created = await api()
      .post("/api/admin/layouts")
      .set(auth)
      .send({ name: "Small", rows: plan({ A: "WSS_SSW", B: "SSS_SSS" }) })
      .expect(201);
    expect(created.body.layout).toMatchObject({ name: "Small", seatCount: 12, hallCount: 0 });

    const { id } = created.body.layout;
    const edited = await api()
      .put(`/api/admin/layouts/${id}`)
      .set(auth)
      .send({ name: "Small, three rows", rows: plan({ A: "WSS_SSW", B: "SSS_SSS", C: "SSS_SSS" }) })
      .expect(200);
    expect(edited.body.layout).toMatchObject({ name: "Small, three rows", seatCount: 18 });

    const list = await api().get("/api/admin/layouts").set(auth).expect(200);
    expect(list.body.layouts.map((layout: { name: string }) => layout.name)).toEqual(["Small, three rows"]);

    await api().delete(`/api/admin/layouts/${id}`).set(auth).expect(204);
    await api().get(`/api/admin/layouts/${id}`).set(auth).expect(404);
  });

  it("refuses unusable plans and repeated names", async () => {
    const auth = await admin();
    const bad = [plan({ A: "SSX" }), plan({ A: "___" }), plan({ A: "SS", B: "" }), []];
    for (const rows of bad) {
      const res = await api().post("/api/admin/layouts").set(auth).send({ name: "Bad", rows }).expect(400);
      expect(res.body.error.code).toBe("VALIDATION");
    }
    const repeated = [{ label: "A", cells: "SS" }, { label: "A", cells: "SS" }];
    await api().post("/api/admin/layouts").set(auth).send({ name: "Bad", rows: repeated }).expect(400);

    await api().post("/api/admin/layouts").set(auth).send({ name: "Twin", rows: plan({ A: "SS" }) }).expect(201);
    const twin = await api().post("/api/admin/layouts").set(auth).send({ name: "Twin", rows: plan({ A: "SS" }) }).expect(409);
    expect(twin.body.error.code).toBe("NAME_TAKEN");
  });

  it("does not delete a layout halls are built from", async () => {
    const auth = await admin();
    const { body } = await api().post("/api/admin/layouts").set(auth).send({ name: "Used", rows: plan({ A: "SSS" }) }).expect(201);
    await api().post("/api/admin/halls").set(auth).send({ name: "Hall X", formats: ["TWO_D"], layoutId: body.layout.id }).expect(201);
    const res = await api().delete(`/api/admin/layouts/${body.layout.id}`).set(auth).expect(409);
    expect(res.body.error.code).toBe("LAYOUT_IN_USE");
  });
});

describe("admin: halls", () => {
  it("creates a hall from a layout and lists it", async () => {
    const auth = await admin();
    const { body } = await api().post("/api/admin/layouts").set(auth).send({ name: "Box", rows: plan({ A: "SSSS", B: "SSSS" }) }).expect(201);
    const created = await api()
      .post("/api/admin/halls")
      .set(auth)
      .send({ name: "Hall 9", formats: ["TWO_D", "THREE_D"], layoutId: body.layout.id })
      .expect(201);
    expect(created.body.hall).toMatchObject({
      name: "Hall 9",
      formats: ["TWO_D", "THREE_D"],
      layout: { id: body.layout.id, name: "Box" },
      seatCount: 8,
      upcomingShowtimes: 0,
      hasSales: false,
    });
    expect(await prisma.seat.count({ where: { hallId: created.body.hall.id } })).toBe(8);
  });

  it("renames a hall and changes its formats, but keeps formats upcoming showtimes need", async () => {
    const auth = await admin();
    const { hall } = await createFixture();
    await prisma.hall.update({ where: { id: hall.id }, data: { formats: ["TWO_D", "THREE_D"] } });

    const renamed = await api().patch(`/api/admin/halls/${hall.id}`).set(auth).send({ name: "Renamed" }).expect(200);
    expect(renamed.body.hall.name).toBe("Renamed");

    // The fixture's showtime is a 2D one next Saturday: 3D can go, 2D cannot.
    await api().patch(`/api/admin/halls/${hall.id}`).set(auth).send({ formats: ["TWO_D"] }).expect(200);
    const res = await api().patch(`/api/admin/halls/${hall.id}`).set(auth).send({ formats: ["IMAX"] }).expect(409);
    expect(res.body.error.code).toBe("FORMAT_IN_USE");
  });

  it("keeps the plan of a hall that has sold seats", async () => {
    const auth = await admin();
    const { hall, showtime, seats } = await createFixture();
    const { body } = await api().post("/api/admin/layouts").set(auth).send({ name: "New plan", rows: plan({ A: "SSS" }) }).expect(201);
    const buyer = await createUser();
    await lock(buyer.token, showtime.id, [seats[0]!.id]).expect(201);
    await checkout(buyer.token, showtime.id).expect(201);

    const halls = await api().get("/api/admin/halls").set(auth).expect(200);
    expect(halls.body.halls.find((row: { id: string }) => row.id === hall.id)).toMatchObject({ hasSales: true, upcomingShowtimes: 1 });
    const res = await api().put(`/api/admin/halls/${hall.id}/layout`).set(auth).send({ layoutId: body.layout.id }).expect(409);
    expect(res.body.error.code).toBe("HALL_IN_USE");
  });
});
