import type { Mailer, TicketEmail } from "./mailer.js";

/** Writes emails to the log; used when EmailJS is not configured, e.g. in development. */
export class LogMailer implements Mailer {
  readonly name = "log";

  async send(email: TicketEmail): Promise<void> {
    console.info(`[email] to=${email.to} subject="${email.subject}" link=${email.params.order_link}`);
  }
}
