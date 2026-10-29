import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MoviesAdmin } from "./movies-admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("movies") };
}

export default function MoviesPage() {
  return <MoviesAdmin />;
}
