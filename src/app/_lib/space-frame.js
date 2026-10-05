// Moldura das páginas do espaço público (RF29, ADR-030): monta o `SpaceLayout` da UI com a aparência do
// dono, o nome, o logotipo, os links sociais e as abas das coleções raiz publicadas. É das PÁGINAS, e
// não do `layout.js`, porque a *sidebar* e a aba corrente dependem do caminho, que um layout não
// recebe. Pasta privada do App Router: não gera rota.
import { SpaceLayout } from "@/components/layout/SpaceLayout";
import { navItemsOf } from "@/components/layout/space-paths";
import { buildThemeStyle } from "./site";

/**
 * @param {object} props
 * @param {NonNullable<Awaited<ReturnType<typeof import("./space").getSpace>>>} props.space
 * @param {import("@/lib/content-tree").ContentNode | null} [props.collection] coleção raiz corrente
 *   (com a *sidebar*); sem ela, só o início do espaço ou um documento solto na raiz
 * @param {string[]} [props.activePath] cadeia de slugs da página corrente
 * @param {import("react").ReactNode} props.children
 */
export function SpaceFrame({ space, collection = null, activePath = [], children }) {
  const { appearance, tree, basePath, name } = space;
  return (
    <SpaceLayout
      themeStyle={buildThemeStyle(appearance)}
      name={name}
      homeHref={basePath}
      logoUrl={appearance.logoUrl}
      navItems={navItemsOf(tree, { basePath, activeSlug: activePath[0] ?? null })}
      collection={collection}
      basePath={basePath}
      activePath={activePath}
      socialLinks={appearance}
    >
      {children}
    </SpaceLayout>
  );
}
