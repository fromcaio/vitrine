// XML dos mapas do site (RF25, RN15; sitemaps.org): funções puras que montam o `urlset` de um espaço e o
// `sitemapindex` do portal. Só recebem o que já é público (o chamador usa a árvore podada pela RN15).
// Pasta privada do App Router: não gera rota.
import { contentHref } from "@/components/layout/space-paths";

/** Espaço de nomes dos mapas (sitemaps.org). */
const NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** @param {unknown} value */
export function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Endereço de um caminho: absoluto com a URL pública e, sem ela, só o caminho (relativo).
 * @param {string | null} base URL pública sem barra final, ou `null`
 * @param {string} path caminho começado por `/`
 */
export const absoluteUrl = (base, path) => (base ? `${base}${path}` : path);

/**
 * Documentos publicados de um espaço, na ordem da árvore, com a data de modificação (RN15: a árvore já
 * vem podada, sem rascunho nem subárvore de rascunho). Coleções ficam de fora: a URL de uma coleção
 * redireciona ao primeiro documento (RN14), e um redirecionamento não é página de mapa.
 * @param {import("@/lib/content-tree").ContentNode[]} roots
 * @param {string} basePath `/{handle}`
 * @returns {{ path: string, lastModified: Date | null }[]}
 */
export function documentEntries(roots, basePath) {
  /** @type {{ path: string, lastModified: Date | null }[]} */
  const entries = [];
  /** @param {import("@/lib/content-tree").ContentNode[]} nodes @param {string[]} parents */
  const walk = (nodes, parents) => {
    for (const node of nodes) {
      const slugs = [...parents, node.slug];
      if (node.type === "DOCUMENT") {
        const updated = /** @type {{ updatedAt?: Date | string }} */ (node).updatedAt;
        entries.push({ path: contentHref(basePath, slugs), lastModified: updated ? new Date(updated) : null });
      }
      walk(node.children, slugs);
    }
  };
  walk(roots, []);
  return entries;
}

/** @param {Date | null | undefined} date */
const lastmod = (date) => (date && !Number.isNaN(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : "");

/**
 * `urlset` de um espaço: o início e cada documento publicado.
 * @param {{ base: string | null, basePath: string, roots: import("@/lib/content-tree").ContentNode[] }} space
 */
export function spaceSitemapXml({ base, basePath, roots }) {
  const documents = documentEntries(roots, basePath);
  const latest = documents.reduce((max, { lastModified }) => (lastModified && (!max || lastModified > max) ? lastModified : max), /** @type {Date | null} */ (null));
  const entries = [{ path: basePath, lastModified: latest }, ...documents];
  const urls = entries.map(({ path, lastModified }) => `<url><loc>${xmlEscape(absoluteUrl(base, path))}</loc>${lastmod(lastModified)}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NAMESPACE}">${urls.join("")}</urlset>\n`;
}

/**
 * `sitemapindex` do portal: o mapa de cada espaço listado.
 * @param {{ base: string | null, handles: string[] }} input
 */
export function sitemapIndexXml({ base, handles }) {
  const maps = handles.map((handle) => `<sitemap><loc>${xmlEscape(absoluteUrl(base, `/${handle}/sitemap.xml`))}</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NAMESPACE}">${maps.join("")}</sitemapindex>\n`;
}
