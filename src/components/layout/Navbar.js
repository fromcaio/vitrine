// Barra superior do espaço público (RF13; M17): logotipo (se houver), nome do espaço e as coleções
// raiz como links, mais o seletor do modo de cor (o lugar dele é aqui). Server Component de
// apresentação: recebe tudo por props, só com tokens de tema. A cor secundária é a da estrutura,
// com o texto `on-secondary` do modo; o item corrente se distingue por `aria-current`, negrito e
// sublinhado grosso (e não só pela cor, WCAG 1.4.1). Em tela estreita tudo quebra de linha: não há
// rolagem horizontal (RNF06).
import Link from "next/link";
import { ColorModeToggle } from "./ColorModeToggle";

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
 * @param {string | null} [props.logoUrl] logotipo (URL https já validada); sem ele, só o nome
 * @param {NavbarItem[]} [props.items] coleções raiz publicadas (`navItemsOf`)
 */
export function Navbar({ name, homeHref, logoUrl = null, items = [] }) {
  return (
    <header className="border-b-4 border-accent bg-secondary text-on-secondary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={homeHref} className="mr-auto flex min-w-0 items-center gap-3 rounded-sm">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa escolhida pelo dono (RF18)
            <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-sm object-contain" referrerPolicy="no-referrer" />
          ) : null}
          <span className="min-w-0 text-lg font-semibold break-words">{name}</span>
        </Link>
        {/* Sobre o fundo neutro: o botão marcado (primária) e os demais mantêm o contraste com
            qualquer paleta, em vez de depender da cor da barra. */}
        <div className="rounded-md bg-background p-1 text-foreground">
          <ColorModeToggle />
        </div>
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
