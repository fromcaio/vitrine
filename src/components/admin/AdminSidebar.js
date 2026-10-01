"use client";

// Navegação do painel (M10, casca). É Componente Cliente só para ler a rota corrente e marcar o
// item ativo. Em telas pequenas a lista fica em um <details> recolhível (RNF06), sem estado em
// JavaScript; a partir de 768 px vira a barra lateral fixa. As duas cópias nunca aparecem juntas:
// a que está oculta sai também da árvore de acessibilidade.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDownIcon,
  DocumentIcon,
  MenuIcon,
  OverviewIcon,
  SettingsIcon,
} from "@/components/ui/icons";

/**
 * Itens da navegação. Só têm `href` as rotas que já existem; os demais aparecem desabilitados
 * ("em breve") até a entrega das páginas de conteúdo (M10) e de configurações (M11).
 * @type {{ label: string, href: string | null, icon: import("react").ReactNode }[]}
 */
const NAV_ITEMS = [
  { label: "Visão geral", href: "/admin", icon: <OverviewIcon /> },
  { label: "Conteúdo", href: null, icon: <DocumentIcon /> },
  { label: "Configurações", href: null, icon: <SettingsIcon /> },
];

const ITEM = "flex items-center gap-2 rounded-md border-l-4 px-3 py-2 text-sm font-medium";

/**
 * A visão geral só é a página corrente na própria rota; as demais seções incluem as subpáginas.
 * @param {string} pathname
 * @param {string} href
 */
function isCurrent(pathname, href) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

/** @param {{ pathname: string }} props */
function NavList({ pathname }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ label, href, icon }) => {
        if (href === null) {
          return (
            <li key={label} className={`${ITEM} border-transparent text-muted`}>
              {icon}
              {label}{" "}
              <span className="ml-auto shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs font-normal whitespace-nowrap">
                em breve
              </span>
            </li>
          );
        }
        const current = isCurrent(pathname, href);
        return (
          <li key={label}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? `${ITEM} border-accent bg-primary text-on-primary`
                  : `${ITEM} border-transparent text-foreground hover:border-accent hover:bg-border`
              }
            >
              {icon}
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* A chave recria o <details> a cada navegação, o que o devolve ao estado recolhido. */}
      <details key={pathname} className="group border-b border-border bg-surface p-2 md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <MenuIcon />
          Menu
          <ChevronDownIcon className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="Navegação do painel" className="px-1 pt-2 pb-1">
          <NavList pathname={pathname} />
        </nav>
      </details>
      <nav
        aria-label="Navegação do painel"
        className="hidden w-64 shrink-0 border-r border-border bg-surface p-3 md:block"
      >
        <NavList pathname={pathname} />
      </nav>
    </>
  );
}
