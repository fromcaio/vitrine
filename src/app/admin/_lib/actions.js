"use server";

// Server Functions do painel (pasta privada do App Router). Cada função exportada daqui pode ser
// chamada por uma requisição POST direta, e não só pela interface: valide no servidor tudo o
// que a função exigir.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Encerra a sessão no servidor (RF20): apaga a sessão do banco e remove o cookie. */
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
