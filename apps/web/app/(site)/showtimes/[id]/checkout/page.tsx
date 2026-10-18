import { CheckoutStep } from "./checkout-step";

export default async function CheckoutPage({ params }: PageProps<"/showtimes/[id]/checkout">) {
  const { id } = await params;
  return <CheckoutStep id={id} />;
}
