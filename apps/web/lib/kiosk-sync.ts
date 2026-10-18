"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What the box office's customer screen shows. The staff screen publishes it on every change;
 * both run in the same browser (two windows, two monitors), so a BroadcastChannel links them
 * without a server round trip. The customer screen loads the seat map, products and order
 * itself and only needs these ids.
 */
export interface KioskState {
  showtimeId: string | null;
  /** Product id and quantity pairs in the basket. */
  items: [string, number][];
  /** Set once paid: the order behind the receipt and its QR code. */
  orderToken: string | null;
}

type KioskMessage = { type: "state"; state: KioskState } | { type: "hello" };

const CHANNEL = "sinema-kiosk";

/** Staff screen: sends the current sale to the customer screen, now and whenever it opens. */
export function useKioskPublisher(state: KioskState) {
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(state);
  // A stable key, so a new but equal object does not resend.
  const key = JSON.stringify(state);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    // A customer screen opened later asks for the current sale.
    ch.onmessage = (event: MessageEvent<KioskMessage>) => {
      if (event.data.type === "hello") ch.postMessage({ type: "state", state: latest.current });
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    const next = JSON.parse(key) as KioskState;
    latest.current = next;
    channel.current?.postMessage({ type: "state", state: next } satisfies KioskMessage);
  }, [key]);
}

/** Customer screen: the sale the staff screen is working on, or null before it answers. */
export function useKioskState(): KioskState | null {
  const [state, setState] = useState<KioskState | null>(null);
  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (event: MessageEvent<KioskMessage>) => {
      if (event.data.type === "state") setState(event.data.state);
    };
    ch.postMessage({ type: "hello" } satisfies KioskMessage);
    return () => ch.close();
  }, []);
  return state;
}
