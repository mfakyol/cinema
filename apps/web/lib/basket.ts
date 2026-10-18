import { apiFetch, type Product } from "./api";

/** The snacks, drinks and (for 3D) glasses on sale for a showtime. */
export const productsQuery = (showtimeId: string) => ({
  queryKey: ["products", showtimeId],
  queryFn: () => apiFetch<{ products: Product[] }>(`/products?showtimeId=${showtimeId}`),
});
