// Rodapé do espaço e do site (RF24, RN17; ADR-035): o texto de direitos, gerado do nome e do ano, e a
// fila de ícones dos links que o dono escolheu (até 8, um por ícone, vazia por padrão: o rodapé não
// herda). Server Component de apresentação, só com tokens de tema.
//
// O que vira `href` passa por `renderableLinks` mesmo vindo do servidor (defesa em profundidade): só
// `https://` e, no ícone `email`, `mailto:` com e-mail válido. Os `https` abrem em nova aba com
// `rel="noopener noreferrer"`; o nome acessível é o do ícone (o "abre em uma nova aba" fica na
// descrição, em `title`). Nenhuma imagem externa: os ícones são SVG inline.
import { FooterIcon } from "./FooterIcon";
import { EMAIL_ICON, FOOTER_ICON_LABELS, renderableLinks } from "./footer-model";

/**
 * @param {object} props
 * @param {string} props.name nome do espaço (ou do site, no portal)
 * @param {{ icon: string, url: string }[] | null} [props.links] os links do dono, na ordem do rodapé
 *   (`GET /api/footer-links`; `listFooterLinks`)
 * @param {number} [props.year] ano dos direitos; o padrão é o ano corrente (nas páginas estáticas,
 *   o do momento em que foram geradas)
 */
export function Footer({ name, links = null, year = new Date().getFullYear() }) {
  const items = renderableLinks(links);
  return (
    <footer className="mt-auto border-t border-border bg-surface px-4 py-6 text-sm text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 break-words">
          © {year} {name}. Todos os direitos reservados.
        </p>
        {items.length > 0 ? (
          <nav aria-label="Links do rodapé">
            <ul className="flex flex-wrap gap-2">
              {items.map(({ icon, url }) => {
                const label = FOOTER_ICON_LABELS[/** @type {keyof typeof FOOTER_ICON_LABELS} */ (icon)];
                const external = icon !== EMAIL_ICON;
                return (
                  <li key={icon}>
                    <a
                      href={url}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer", title: `${label} (abre em uma nova aba)` } : { title: label })}
                      aria-label={label}
                      className="inline-flex size-10 items-center justify-center rounded-md border border-border-strong hover:bg-border"
                    >
                      <FooterIcon icon={icon} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
