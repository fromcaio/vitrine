// Barra superior do espaço público (RF13; M17): o logo e/ou o nome do espaço (D-34; o logo embutido
// quando não há imagem) e as coleções raiz como links, mais o link "Administração" (só para quem
// está logado) e o seletor do modo de cor (o lugar dele é aqui). Server Component de
// apresentação: recebe tudo por props, só com tokens de tema. A cor secundária é a da estrutura,
// com o texto `on-secondary` do modo; o item corrente se distingue por `aria-current`, negrito e
// sublinhado grosso (e não só pela cor, WCAG 1.4.1). Em tela estreita tudo quebra de linha: não há
// rolagem horizontal (RNF06).
//
// Um só cabeçalho (P-024, item 4): o bloco do nome e o das coleções têm o mesmo fundo, SEM linha entre
// eles e SEM faixa embaixo; quem separa o cabeçalho do conteúdo é uma sombra (`.vitrine-cabecalho`,
// globals.css: suave no modo claro, mais forte no noturno). Sem `sticky`.
import Link from "next/link";
import { AdminLink } from "./AdminLink";
import { ColorModeToggle } from "./ColorModeToggle";
import { ColorModeToggleStatic } from "./ColorModeToggleStatic";
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
 * @param {"light" | "dark" | null} [props.modeTogglePreview] só da pré-visualização da aparência (com `modeToggle`
 *   desligado): mostra a IMAGEM do botão (`ColorModeToggleStatic`), sem cookie, sem efeito e sem foco, no modo
 *   da amostra dado aqui; `null` (padrão) não mostra nada
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
  modeTogglePreview = null,
}) {
  return (
    <header className="vitrine-cabecalho relative z-10 bg-secondary text-on-secondary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={homeHref} className="mr-auto flex min-w-0 items-center gap-3 rounded-sm">
          <SiteBrand name={name} logoUrl={logoUrl} showLogo={showLogo} showName={showName} />
        </Link>
        {/* O link entra no espaço livre à esquerda do botão de modo (depois da hidratação, e só para
            quem tem o marcador de sessão): o botão e o resto da barra não se mexem. */}
        {adminLink ? <AdminLink /> : null}
        {/* O botão traz o próprio fundo neutro (bg-background, texto e borda neutros): o contraste dele
            com qualquer paleta não depende da cor da barra, e o fundo fica só dentro dele (P-024, item 3). */}
        {modeToggle ? (
          <ColorModeToggle iconPair={modeIconPair} />
        ) : modeTogglePreview ? (
          <ColorModeToggleStatic mode={modeTogglePreview} iconPair={modeIconPair} />
        ) : null}
      </div>
      {items.length > 0 ? (
        <nav aria-label="Coleções" className="px-4 pb-3">
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
