"use client";

// Navegação do painel (M10, M19, M20): o menu por papel e por senha provisória. Componente Cliente só
// para ler a rota corrente e marcar o item ativo. Em telas pequenas a lista fica em um <details>
// recolhível (RNF06), sem estado em JavaScript; a partir de 768 px vira a barra lateral fixa. As duas
// cópias nunca aparecem juntas: a que está oculta sai também da árvore de acessibilidade.
//
// O menu: Visão geral, Conteúdo, Aparência, Notificações, Perfil, Trocar a senha e, só para o
// administrador, Configurações e Usuários. Com a senha PROVISÓRIA (RN21), só "Trocar a senha": é a
// única página que a conta pode abrir (o "Sair" está na barra superior). Um item cuja página ainda
// não existe aparece desabilitado, com "em breve": quem monta o painel diz quais existem em
// `availablePaths`.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  ChevronDownIcon,
  DocumentIcon,
  KeyIcon,
  MenuIcon,
  OverviewIcon,
  PaletteIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";

/** @typedef {"admin" | "user"} AdminRole */

/**
 * Itens da navegação, na ordem do menu. `adminOnly`: só para o administrador.
 * @type {{ label: string, href: string, icon: import("react").ReactNode, adminOnly?: boolean }[]}
 */
export const NAV_ITEMS = [
  { label: "Visão geral", href: "/admin", icon: <OverviewIcon /> },
  { label: "Conteúdo", href: "/admin/conteudo", icon: <DocumentIcon /> },
  { label: "Aparência", href: "/admin/aparencia", icon: <PaletteIcon /> },
  { label: "Notificações", href: "/admin/notificacoes", icon: <BellIcon /> },
  { label: "Perfil", href: "/admin/perfil", icon: <UserIcon /> },
  { label: "Trocar a senha", href: "/admin/senha", icon: <KeyIcon /> },
  { label: "Configurações", href: "/admin/configuracoes", icon: <SettingsIcon />, adminOnly: true },
  { label: "Usuários", href: "/admin/usuarios", icon: <UsersIcon />, adminOnly: true },
];

/** O único item com a senha provisória. */
const PASSWORD_HREF = "/admin/senha";

/** Páginas que existem hoje (o padrão de `availablePaths`); o Core acrescenta as que for entregando. */
export const DEFAULT_AVAILABLE_PATHS = Object.freeze(["/admin", "/admin/senha"]);

const ITEM = "flex items-center gap-2 rounded-md border-l-4 px-3 py-2 text-sm font-medium";

/**
 * Os itens do menu de quem tem este papel e esta situação.
 * @param {{ role?: AdminRole, mustChangePassword?: boolean }} options
 */
export function menuFor({ role = "user", mustChangePassword = false } = {}) {
  if (mustChangePassword) return NAV_ITEMS.filter((item) => item.href === PASSWORD_HREF);
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
}

/**
 * A visão geral só é a página corrente na própria rota; as demais seções incluem as subpáginas.
 * @param {string} pathname
 * @param {string} href
 */
function isCurrent(pathname, href) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

/** @param {{ pathname: string, items: ReturnType<typeof menuFor>, available: readonly string[] }} props */
function NavList({ pathname, items, available }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ label, href, icon }) => {
        if (!available.includes(href)) {
          return (
            <li key={href} className={`${ITEM} border-transparent text-muted`}>
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
          <li key={href}>
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

/**
 * @param {object} props
 * @param {AdminRole} [props.role] papel do usuário; o padrão é o de usuário comum
 * @param {boolean} [props.mustChangePassword] a conta usa a senha provisória: só "Trocar a senha"
 * @param {readonly string[]} [props.availablePaths] caminhos cujas páginas já existem; os demais itens
 *   aparecem como "em breve". O padrão é `DEFAULT_AVAILABLE_PATHS`
 */
export function AdminSidebar({ role = "user", mustChangePassword = false, availablePaths = DEFAULT_AVAILABLE_PATHS }) {
  const pathname = usePathname();
  const items = menuFor({ role, mustChangePassword });

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
          <NavList pathname={pathname} items={items} available={availablePaths} />
        </nav>
      </details>
      <nav
        aria-label="Navegação do painel"
        className="hidden w-64 shrink-0 border-r border-border bg-surface p-3 md:block"
      >
        <NavList pathname={pathname} items={items} available={availablePaths} />
      </nav>
    </>
  );
}
