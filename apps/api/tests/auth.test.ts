import { describe, expect, it } from "vitest";
import { api, bearer } from "./helpers.js";

const account = { email: "Jane@Example.com", password: "s3cret-pass", name: "Jane" };

describe("auth", () => {
  it("registers a customer and signs them in", async () => {
    const registered = await api().post("/api/auth/register").send(account).expect(201);
    expect(registered.body.user).toMatchObject({ email: "jane@example.com", role: "CUSTOMER" });
    expect(registered.body.token).toEqual(expect.any(String));
    expect(registered.body.user).not.toHaveProperty("passwordHash");

    const login = await api()
      .post("/api/auth/login")
      .send({ email: "jane@example.com", password: account.password })
      .expect(200);
    await api().get("/api/me/tickets").set(bearer(login.body.token)).expect(200);
  });

  it("rejects a second account with the same email", async () => {
    await api().post("/api/auth/register").send(account).expect(201);
    const res = await api().post("/api/auth/register").send(account).expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a wrong password", async () => {
    await api().post("/api/auth/register").send(account).expect(201);
    const res = await api()
      .post("/api/auth/login")
      .send({ email: account.email, password: "wrong-password" })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("validates the request body", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short", name: "" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("rejects a forged token", async () => {
    await api().get("/api/me/tickets").set(bearer("not.a.token")).expect(401);
  });

  it("starts guest sessions without an account", async () => {
    const guest = await api().post("/api/auth/guest").send({ channel: "WEB" }).expect(201);
    const res = await api().get("/api/me/tickets").set(bearer(guest.body.token)).expect(200);
    expect(res.body.tickets).toEqual([]);
  });

  it("rejects an unknown guest channel", async () => {
    await api().post("/api/auth/guest").send({ channel: "FAX" }).expect(400);
  });
});
