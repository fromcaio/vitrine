// robots.txt (RF25, RNF07; Cap. 5 §5.11): libera os espaços públicos e o portal, bloqueia o painel, a API e
// o login, e aponta para o índice do mapa do site. Não precisa de banco. Dinâmico: a URL pública
// (`BETTER_AUTH_URL`) é lida da instância em execução, e não do ambiente do `next build` (que no estágio de
// build da imagem Docker não a tem); sem ela, o `robots` não traz a linha do mapa (URL relativa não vale ali).
import { publicBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Caminhos que nenhum buscador deve percorrer: o painel, a API e o login. */
const DISALLOWED_PATHS = ["/admin", "/api", "/login"];

export default function robots() {
  const base = publicBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
