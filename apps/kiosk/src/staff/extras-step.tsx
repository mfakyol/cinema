import { groupBy, MAX_ITEM_QUANTITY, type ProductCategory } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Minus } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { productsQuery } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Glasses lead on 3D showings; the API only lists them for those. */
const CATEGORY_ORDER: ProductCategory[] = ["GLASSES", "COMBO", "SNACK", "DRINK"];

/** Snacks, drinks and glasses as large tiles: one tap adds one. */
export function ExtrasStep({ showtimeId, seatCount }: { showtimeId: string; seatCount: number }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const cart = useCart(showtimeId);
  const products = useQuery(productsQuery(showtimeId));

  if (!products.data) return <Skeleton className="h-96 w-full" />;
  const groups = groupBy(products.data.products, (product) => product.category);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <p className="text-muted-foreground">{t("kiosk.tapToAdd")}</p>
      {CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => {
        const list = groups.get(category)!;
        const glasses = category === "GLASSES";
        return (
          <section key={category} className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{t(`extras.categories.${category}`)}</h2>
              {glasses && seatCount > 0 && (
                <Button variant="outline" onClick={() => cart.setQuantity(list[0]!.id, seatCount)}>
                  {t("extras.onePerSeat", { count: seatCount })}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {list.map((product) => {
                const quantity = cart.quantities.get(product.id) ?? 0;
                const name = product.name[locale];
                return (
                  <div key={product.id} className="relative">
                    <button
                      type="button"
                      disabled={quantity >= MAX_ITEM_QUANTITY}
                      aria-label={t("extras.add", { name })}
                      onClick={() => cart.setQuantity(product.id, quantity + 1)}
                      className={cn(
                        "flex h-full min-h-28 w-full flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring",
                        quantity > 0 && "border-primary bg-primary/10",
                        glasses && "border-primary/60",
                      )}
                    >
                      <span className="pr-20 font-semibold">{name}</span>
                      {product.description && (
                        <span className="text-xs text-muted-foreground">{product.description[locale]}</span>
                      )}
                      <span className="mt-auto pt-2 font-medium">{price(product.price)}</span>
                    </button>
                    {quantity > 0 && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label={t("extras.remove", { name })}
                          onClick={() => cart.setQuantity(product.id, quantity - 1)}
                        >
                          <Minus aria-hidden />
                        </Button>
                        <span
                          className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                          aria-label={t("extras.inCart", { count: quantity })}
                        >
                          {quantity}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
