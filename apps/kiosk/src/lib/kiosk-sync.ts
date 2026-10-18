import { useEffect, useRef, useState } from "react";

/**
 * What the customer screen shows. The staff screen publishes it on every change; both windows
 * run in the same browser (two monitors), so a BroadcastChannel links them without a server
 * round trip. The customer screen loads the seat map, products and order itself and only
 * needs these ids.
 */
export interface KioskState {
  /** Where the staff screen is; the customer may pick seats while it is on "seats". */
  step: "showtime" | "seats" | "extras" | "payment" | "done";
  showtimeId: string | null;
  /** Product id and quantity pairs in the basket. */
  items: [string, number][];
  /** Set once paid: the order behind the receipt and its QR code. */
  orderToken: string | null;
}

type KioskMessage = { type: "state"; state: KioskState } | { type: "hello" } | { type: "bye" };

const CHANNEL = "sinema-kiosk";
/** The customer screen says hello this often, so the staff screen knows it is open. */
const HEARTBEAT_MS = 5_000;

/**
 * Staff screen: sends the current sale to the customer screen, now and whenever it opens.
 * Returns whether a customer screen is open.
 */
export function useKioskPublisher(state: KioskState): boolean {
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(state);
  const [displayOn, setDisplayOn] = useState(false);
  // A stable key, so a new but equal object does not resend.
  const key = JSON.stringify(state);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    let offTimer: ReturnType<typeof setTimeout> | undefined;
    ch.onmessage = (event: MessageEvent<KioskMessage>) => {
      if (event.data.type === "hello") {
        ch.postMessage({ type: "state", state: latest.current } satisfies KioskMessage);
        setDisplayOn(true);
        clearTimeout(offTimer);
        offTimer = setTimeout(() => setDisplayOn(false), HEARTBEAT_MS * 3);
      } else if (event.data.type === "bye") {
        clearTimeout(offTimer);
        setDisplayOn(false);
      }
    };
    return () => {
      clearTimeout(offTimer);
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    const next = JSON.parse(key) as KioskState;
    latest.current = next;
    channel.current?.postMessage({ type: "state", state: next } satisfies KioskMessage);
  }, [key]);

  return displayOn;
}

/** Customer screen: the sale the staff screen is working on, or null before it answers. */
export function useKioskState(): KioskState | null {
  const [state, setState] = useState<KioskState | null>(null);
  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (event: MessageEvent<KioskMessage>) => {
      if (event.data.type === "state") setState(event.data.state);
    };
    const hello = () => ch.postMessage({ type: "hello" } satisfies KioskMessage);
    hello();
    const heartbeat = setInterval(hello, HEARTBEAT_MS);
    const bye = () => ch.postMessage({ type: "bye" } satisfies KioskMessage);
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", bye);
      ch.close();
    };
  }, []);
  return state;
}
