import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, createFixture } from "./helpers.js";

describe("movies and showtimes", () => {
  it("lists movies", async () => {
    const { movie } = await createFixture();
    const res = await api().get("/api/movies").expect(200);
    expect(res.body.movies).toEqual([expect.objectContaining({ id: movie.id, title: "Test Movie" })]);
  });

  it("lists only upcoming showtimes for a movie", async () => {
    const { movie, hall, showtime } = await createFixture();
    await prisma.showtime.create({
      data: { movieId: movie.id, hallId: hall.id, startsAt: new Date(Date.now() - 60_000), price: 1000 },
    });
    const res = await api().get(`/api/movies/${movie.id}/showtimes`).expect(200);
    expect(res.body.showtimes.map((s: { id: string }) => s.id)).toEqual([showtime.id]);
  });

  it("returns 404 for an unknown movie", async () => {
    await api().get("/api/movies/does-not-exist/showtimes").expect(404);
  });

  it("returns every seat of the hall as free on a new showtime", async () => {
    const { showtime, seats } = await createFixture();
    const res = await api().get(`/api/showtimes/${showtime.id}/seats`).expect(200);
    expect(res.body.seats).toHaveLength(seats.length);
    expect(res.body.seats.every((seat: { state: string }) => seat.state === "free")).toBe(true);
    expect(res.body.seats[0]).toMatchObject({ row: "A", number: 1 });
  });

  it("returns 404 for unknown API routes", async () => {
    const res = await api().get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
