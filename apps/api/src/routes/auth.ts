import { randomUUID } from "node:crypto";
import { Router } from "express";
import { guestSessionSchema, loginSchema, registerSchema } from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { signToken } from "../lib/jwt.js";
import { storedLockPin } from "../lib/lock-pin.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { validate } from "../lib/validate.js";

export const authRouter = Router();

const publicUser = (user: { id: string; email: string; name: string; role: string }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});

authRouter.post("/register", async (req, res) => {
  const input = validate(registerSchema, req.body);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }
  res.status(201).json({ token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const input = validate(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is wrong");
  }
  const staff = user.role === "STAFF" || user.role === "ADMIN";
  res.json({
    token: signToken({ sub: user.id, role: user.role }),
    user: publicUser(user),
    ...(staff && { lockPin: storedLockPin(user) }),
  });
});

/** Starts a guest session: an anonymous identity that can lock seats, check out and see its tickets. */
authRouter.post("/guest", (req, res) => {
  const { channel } = validate(guestSessionSchema, req.body ?? {});
  res
    .status(201)
    .json({ token: signToken({ sub: `guest_${randomUUID()}`, role: "GUEST", channel }) });
});
