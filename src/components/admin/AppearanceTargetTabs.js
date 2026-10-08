// Seletor do alvo da tela de aparência (D-41, §11 do épico v1): só o ADMINISTRADOR o vê. Ele escolhe
// entre editar a "Aparência do sistema" (`/api/configuration`: o que se vê em `/`, no login e no
// painel dele, e a base de quem não definiu a própria) e a "Minha página" (`/api/appearance`: o
// espaço dele). O usuário comum edita só a própria página e não vê o seletor.
//
// São LINKS, não abas de painel: cada alvo é uma URL (`?alvo=sistema` ou `?alvo=pagina`, que a página
// do Core lê), de modo que o alvo sobrevive a recarregar, ao botão Voltar e a favoritar. O alvo
// corrente leva `aria-current="page"` (e negrito e sublinhado, não só a cor; WCAG 1.4.1). Componente
// de apresentação: os endereços chegam por props e o papel também.
import Link from "next/link";

/** @typedef {"sistema" | "pagina"} AppearanceTarget */

/**
 * @param {object} props
 * @param {string} [props.role] papel do usuário da sessão; só `admin` vê o seletor
 * @param {AppearanceTarget} props.active o alvo que a página está editando
 * @param {string} [props.systemHref] endereço do alvo "sistema"
 * @param {string} [props.pageHref] endereço do alvo "página"
 */
export function AppearanceTargetTabs({ role, active, systemHref = "?alvo=sistema", pageHref = "?alvo=pagina" }) {
  if (role !== "admin") return null;
  const targets = /** @type {const} */ ([
    { id: "sistema", label: "Aparência do sistema", href: systemHref, hint: "o portal, o login e o painel" },
    { id: "pagina", label: "Minha página", href: pageHref, hint: "o seu espaço público" },
  ]);
  return (
    <nav aria-label="Aparência a editar">
      <ul className="flex flex-wrap gap-2">
        {targets.map((target) => {
          const current = target.id === active;
          return (
            <li key={target.id} className="min-w-0">
              <Link
                href={target.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-10 flex-col justify-center rounded-md border px-4 py-1.5 text-sm ${
                  current
                    ? "border-foreground bg-surface font-semibold underline decoration-2 underline-offset-4"
                    : "border-border-strong font-medium hover:border-foreground hover:bg-surface"
                }`}
              >
                <span>{target.label}</span>
                <span className="text-xs font-normal text-muted no-underline">{target.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
