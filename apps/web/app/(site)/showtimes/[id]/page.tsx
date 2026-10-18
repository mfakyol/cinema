import { SeatPicker } from "./seat-picker";

export default async function ShowtimePage({ params }: PageProps<"/showtimes/[id]">) {
  const { id } = await params;
  return <SeatPicker id={id} />;
}
