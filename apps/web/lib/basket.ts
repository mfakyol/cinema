import { apiFetch, type Product } from "./api";

/** The snacks, drinks and (for 3D) glasses on sale for a showtime. */
export const productsQuery = (showtimeId: string) => ({
  queryKey: ["products", showtimeId],
  queryFn: () => apiFetch<{ products: Product[] }>(`/products?showtimeId=${showtimeId}`),
});

export interface BasketLine {
  product: Product;
  quantity: number;
}

/** The products in a cart, in catalogue order, and what seats plus products cost together. */
export function basket(
  products: Product[] | undefined,
  quantities: ReadonlyMap<string, number>,
  seatPrice: number,
  seatCount: number,
) {
  const lines: BasketLine[] = (products ?? [])
    .filter((product) => quantities.has(product.id))
    .map((product) => ({ product, quantity: quantities.get(product.id)! }));
  const itemsTotal = lines.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
  return { lines, itemsTotal, total: seatPrice * seatCount + itemsTotal };
}
