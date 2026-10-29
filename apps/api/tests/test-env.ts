/** Tests run against their own database so they never touch development data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://sinema:sinema@localhost:5432/sinema_test";

export const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "test-jwt-secret-0123456789",
  QR_SECRET: "test-qr-secret-0123456789",
  // Database 1, so tests never touch the development data in database 0.
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
  RABBITMQ_URL: process.env.TEST_RABBITMQ_URL ?? "amqp://sinema:sinema@localhost:5672",
  PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-0123456789",
  FAKE_PAYMENT_CALLBACKS: "off",
};
