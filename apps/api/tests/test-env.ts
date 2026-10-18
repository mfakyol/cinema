/** Tests run against their own database so they never touch development data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://sinema:sinema@localhost:5432/sinema_test";

export const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "test-jwt-secret-0123456789",
  QR_SECRET: "test-qr-secret-0123456789",
};
