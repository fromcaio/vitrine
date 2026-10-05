// Mapa do site de um espaço, `/{handle}/sitemap.xml` (RF25, RN15, RN23; CT25, CT31, CT43): o início e cada
// documento PUBLICADO (rascunho e subárvore de rascunho nunca aparecem), com a data de modificação.
// Espaço inexistente, sem handle, suspenso ou reservado responde o MESMO 404 de qualquer caminho
// inexistente (RF14). O `matcher` do Proxy exclui caminhos com extensão, então este handler confere o
// espaço sozinho (`getSpace`).
//
// Dinâmico (nada em cache): o mapa lê a árvore do dono (~4 ms, M-018) e está sempre em dia com o
// espaço, sem entrar no conjunto de caminhos que um evento estrutural invalida; e um 404 para um handle
// qualquer não deixa arquivo em `.next/` (o que o Proxy evita nas páginas). O `next build` não consulta
// o banco (ADR-021): a guarda de `getSpace` vale aqui também.
import { notFound } from "next/navigation";
import { publicBaseUrl } from "@/lib/seo";
import { getSpace } from "../../_lib/space";
import { spaceSitemapXml } from "../../_lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { handle } = await params;
  const space = await getSpace(handle);
  if (!space) notFound();

  const xml = spaceSitemapXml({ base: publicBaseUrl(), basePath: space.basePath, roots: space.tree });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
