import type { Mailer, TicketEmail } from "./mailer.js";

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  /** Lets the server call EmailJS; "Allow EmailJS API for non-browser applications" must be on. */
  privateKey: string;
}

/**
 * Sends through EmailJS's REST API from the server, so the private key never reaches the
 * browser and a client cannot send arbitrary emails through our account.
 */
export class EmailJsMailer implements Mailer {
  readonly name = "emailjs";

  constructor(private readonly config: EmailJsConfig) {}

  async send(email: TicketEmail): Promise<void> {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: this.config.serviceId,
        template_id: this.config.templateId,
        user_id: this.config.publicKey,
        accessToken: this.config.privateKey,
        template_params: { to_email: email.to, subject: email.subject, ...email.params },
      }),
    });
    if (!response.ok) {
      throw new Error(`EmailJS responded ${response.status}: ${await response.text()}`);
    }
  }
}
