import { ExtrasStep } from "./extras-step";

export default async function ExtrasPage({ params }: PageProps<"/showtimes/[id]/extras">) {
  const { id } = await params;
  return <ExtrasStep id={id} />;
}
