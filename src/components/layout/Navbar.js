// Barra superior do espaço público (RF13; M17): o logo e/ou o nome do espaço (D-34; o logo embutido
// quando não há imagem) e as coleções raiz como links, mais o link "Administração" (só para quem
// está logado) e o seletor do modo de cor (o lugar dele é aqui). Server Component de
// apresentação: recebe tudo por props, só com tokens de tema. A cor secundária é a da estrutura,
// com o texto `on-secondary` do modo; o item corrente se distingue por `aria-current`, negrito e
// sublinhado grosso (e não só pela cor, WCAG 1.4.1). Em tela estreita tudo quebra de linha: não há
// rolagem horizontal (RNF06).
import Link from "next/link";
import { AdminLink } from "./AdminLink";
import { ColorModeToggle } from "./ColorModeToggle";
import { SiteBrand } from "./SiteBrand";

/**
 * @typedef {object} NavbarItem
 * @property {string} id chave estável (o id da coleção)
 * @property {string} label título da coleção
 * @property {string} href URL da coleção
 * @property {boolean} [current] a página corrente está nesta coleção
 */

/**
 * @param {object} props
 * @param {string} props.name nome do espaço (ou do site, no portal)
 * @param {string} props.homeHref início do espaço (por exemplo, `/maria`; `/` no portal)
 * @param {string | null} [props.logoUrl] logo (`/media/<id>`); sem ele, o logo embutido (`DefaultLogo`)
 * @param {boolean} [props.showLogo] mostra o logo (padrão); pelo menos um de `showLogo` e `showName`
 *   fica ligado (D-34): o logo vem antes do nome
 * @param {boolean} [props.showName] mostra o nome (padrão)
 * @param {NavbarItem[]} [props.items] coleções raiz publicadas (`navItemsOf`)
 * @param {boolean} [props.modeToggle] mostra o seletor do modo de cor (padrão); a pré-visualização
 *   da aparência o omite, porque nela nada é interativo
 * @param {boolean} [props.adminLink] inclui o link "Administração" (`AdminLink`, só para quem está
 *   logado; padrão); a pré-visualização o omite
 * @param {string} [props.modeIconPair] o par de ícones do seletor de modo (`modeIconPair` do site)
 */
export function Navbar({
  name,
  homeHref,
  logoUrl = null,
  showLogo = true,
  showName = true,
  items = [],
  modeToggle = true,
  adminLink = true,
  modeIconPair,
}) {
  return (
    <header className="border-b-4 border-accent bg-secondary text-on-secondary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={homeHref} className="mr-auto flex min-w-0 items-center gap-3 rounded-sm">
          <SiteBrand name={name} logoUrl={logoUrl} showLogo={showLogo} showName={showName} />
        </Link>
        {/* O link entra no espaço livre à esquerda do botão de modo (depois da hidratação, e só para
            quem tem o marcador de sessão): o botão e o resto da barra não se mexem. */}
        {adminLink ? <AdminLink /> : null}
        {/* Sobre o fundo neutro: o botão marcado (primária) e os demais mantêm o contraste com
            qualquer paleta, em vez de depender da cor da barra. */}
        {modeToggle ? (
          <div className="rounded-md bg-background p-1 text-foreground">
            <ColorModeToggle iconPair={modeIconPair} />
          </div>
        ) : null}
      </div>
      {items.length > 0 ? (
        <nav aria-label="Coleções" className="border-t border-on-secondary/30 px-4 py-2">
          <ul className="flex flex-wrap gap-x-1 gap-y-1">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={
                    item.current
                      ? "block rounded-md px-3 py-1.5 text-sm font-semibold break-words underline decoration-2 underline-offset-4"
                      : "block rounded-md px-3 py-1.5 text-sm font-medium break-words hover:underline hover:underline-offset-4"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
