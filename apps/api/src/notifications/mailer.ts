export interface TicketEmail {
  to: string;
  subject: string;
  /** Values for the email template; keys match the placeholders in the EmailJS template. */
  params: Record<string, string>;
}

/** Email delivery boundary, so the provider can change without touching checkout. */
export interface Mailer {
  readonly name: string;
  send(email: TicketEmail): Promise<void>;
}
