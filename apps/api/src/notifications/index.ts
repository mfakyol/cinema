import { env } from "../env.js";
import { EmailJsMailer } from "./emailjs-mailer.js";
import { LogMailer } from "./log-mailer.js";
import type { Mailer } from "./mailer.js";

function createMailer(): Mailer {
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = env;
  if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY && EMAILJS_PRIVATE_KEY) {
    return new EmailJsMailer({
      serviceId: EMAILJS_SERVICE_ID,
      templateId: EMAILJS_TEMPLATE_ID,
      publicKey: EMAILJS_PUBLIC_KEY,
      privateKey: EMAILJS_PRIVATE_KEY,
    });
  }
  return new LogMailer();
}

export const mailer: Mailer = createMailer();
