import { MovieDetail } from "./movie-detail";

export default async function MoviePage({ params }: PageProps<"/movies/[id]">) {
  const { id } = await params;
  return <MovieDetail id={id} />;
}
