"use client";

import { useSyncExternalStore } from "react";

/**
 * Snacks, drinks and glasses picked for a showtime, kept between the purchase steps.
 * Held in memory only: the seat hold runs out within minutes anyway.
 */
type Quantities = ReadonlyMap<string, number>;

const carts = new Map<string, Quantities>();
const listeners = new Set<() => void>();
const EMPTY: Quantities = new Map();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setCart(showtimeId: string, next: Quantities) {
  carts.set(showtimeId, next);
  listeners.forEach((listener) => listener());
}

export function useCart(showtimeId: string) {
  const quantities = useSyncExternalStore(
    subscribe,
    () => carts.get(showtimeId) ?? EMPTY,
    () => EMPTY,
  );
  return {
    quantities,
    setQuantity(productId: string, quantity: number) {
      const next = new Map(quantities);
      if (quantity > 0) next.set(productId, quantity);
      else next.delete(productId);
      setCart(showtimeId, next);
    },
    clear: () => setCart(showtimeId, EMPTY),
  };
}
