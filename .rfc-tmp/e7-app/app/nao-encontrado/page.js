import { notFound } from "next/navigation";
import { connection } from "next/server";
// Página dinâmica: nunca vai para o cache; responde 404 sem gerar arquivo em disco.
export default async function NaoEncontrado() {
  await connection();
  notFound();
}
