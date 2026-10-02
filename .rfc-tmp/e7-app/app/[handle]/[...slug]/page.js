import { notFound } from "next/navigation";
export const generateStaticParams = async () => [];
export default async function Doc({ params }) {
  const { handle, slug } = await params;
  if (slug.includes("inexistente")) notFound();
  return <p>[[doc:{handle}/{slug.join("/")}:{Date.now()}]]</p>;
}
