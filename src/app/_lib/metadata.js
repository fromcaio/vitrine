// Metadados de SEO das páginas públicas (RF25, RNF07, CT25; Cap. 5 §5.11; M12): título, descrição,
// endereço canônico e Open Graph de um documento, do início de um espaço e do portal. Funções puras: as
// páginas (`generateMetadata`) só as chamam. Tudo é texto puro (o `metadata` do Next escapa o HTML, mas
// o que entra aqui nem leva marcação: a descrição passa por `plainDescription`).
//
// Os endereços são caminhos (`/ana/calculo/limites`); com `metadataBase` (a URL pública, do layout raiz)
// o Next os torna absolutos; sem ela, ficam relativos.
import { contentHref } from "@/components/layout/space-paths";
import { plainDescription } from "@/lib/seo";

/** @param {string | null | undefined} description */
const withDescription = (description) => (description ? { description } : {});

/**
 * Metadados de uma coleção ou de um documento do espaço. O `title` recebe o modelo `%s | nome` do layout
 * do espaço; a `description` é o começo do texto do documento, sem marcação (sem texto, vale a do espaço).
 * @param {{
 *   space: { basePath: string, name: string },
 *   content: { title: string, type: string, body?: string | null, updatedAt?: Date | string | null },
 *   slugs: string[]
 * }} page
 */
export function documentMetadata({ space, content, slugs }) {
  const path = contentHref(space.basePath, slugs);
  const description = plainDescription(content.body);
  const isDocument = content.type === "DOCUMENT";
  const modified = isDocument && content.updatedAt ? new Date(content.updatedAt) : null;
  return {
    title: content.title,
    ...withDescription(description),
    alternates: { canonical: path },
    openGraph: {
      type: isDocument ? "article" : "website",
      title: content.title,
      siteName: space.name,
      url: path,
      ...withDescription(description),
      ...(modified && !Number.isNaN(modified.getTime()) ? { modifiedTime: modified.toISOString() } : {}),
    },
  };
}

/**
 * Metadados do início de um espaço: o título e a descrição do espaço vêm do layout; aqui entram o
 * endereço canônico e o Open Graph.
 * @param {{ basePath: string, name: string, appearance: { siteDescription?: string | null } }} space
 */
export function spaceHomeMetadata(space) {
  const description = space.appearance.siteDescription?.trim();
  return {
    alternates: { canonical: space.basePath },
    openGraph: { type: "website", title: space.name, siteName: space.name, url: space.basePath, ...withDescription(description) },
  };
}

/**
 * Metadados do portal `/`: o título e a descrição do site, mais o endereço canônico e o Open Graph.
 * @param {{ title: { absolute: string }, description: string }} site o retorno de `siteMetadata`
 */
export function portalMetadata(site) {
  return {
    ...site,
    alternates: { canonical: "/" },
    openGraph: { type: "website", title: site.title.absolute, siteName: site.title.absolute, url: "/", description: site.description },
  };
}
