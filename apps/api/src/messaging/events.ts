/**
 * Events published through the outbox. The routing key is the event type; consumers find the
 * details in PostgreSQL by the id in the payload, so a message stays small and never stale.
 */
export const TICKET_ISSUED = "ticket.issued";
export const ORDER_REFUNDED = "order.refunded";

export interface TicketIssuedPayload {
  orderId: string;
}

export interface OrderRefundedPayload {
  orderId: string;
}
