// Rodapé do espaço e do site (RF24, RN17; ADR-035): o texto de direitos, gerado do nome e do ano, e a
// fila de ícones dos links que o dono escolheu (até 8, um por ícone, vazia por padrão: o rodapé não
// herda). Server Component de apresentação, só com tokens de tema. A cor é a do cabeçalho (P-029): `bg-secondary
// text-on-secondary`, a secundária do dono e do modo, sem linha nem sombra entre os dois.
//
// Leiaute (P-024, itens 1 e 2): até o ponto de quebra `md` (768 px) o texto e a fila de ícones ficam um
// sobre o outro, CENTRALIZADOS, com os ícones ACIMA do texto (`flex-col-reverse`: só a ordem visual muda;
// no DOM o texto vem antes da `nav`, e é essa a ordem de leitura). Do `md` em diante é uma linha só
// (`flex-nowrap`): o texto à esquerda, que encolhe e quebra dentro da própria caixa (`min-w-0`), e os
// ícones à direita (`shrink-0`). Não há estado intermediário: 8 ícones (cerca de 376 px) e o nome mais
// longo permitido cabem na linha a partir do `md`, e abaixo dele o empilhado centralizado sempre cabe.
//
// O que vira `href` passa por `renderableLinks` mesmo vindo do servidor (defesa em profundidade): só
// `https://` e, no ícone `email`, `mailto:` com e-mail válido. Os `https` abrem em nova aba com
// `rel="noopener noreferrer"`; o nome acessível é o do ícone (o "abre em uma nova aba" fica na
// descrição, em `title`). Nenhuma imagem externa: os ícones são SVG inline.
import { FooterIcon } from "./FooterIcon";
import { EMAIL_ICON, FOOTER_ICON_LABELS, renderableLinks } from "./footer-model";

/**
 * Botão de ícone do rodapé: a mesma linguagem das setas da barra de coleções (`NavbarCollections`), derivada
 * do `on-secondary` (o par que a aparência já valida em 4,5:1 sobre a secundária, nos dois modos). Foco: contorno
 * de 2 px em `on-secondary`, fora do botão.
 */
export const ICON_LINK =
  "inline-flex size-10 items-center justify-center rounded-md border border-on-secondary/30 bg-on-secondary/10 text-on-secondary " +
  "transition-colors motion-reduce:transition-none hover:border-on-secondary/50 hover:bg-on-secondary/20 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-secondary";

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
    <footer className="mt-auto bg-secondary px-4 py-2 text-sm text-on-secondary">
      <div className="flex flex-col-reverse items-center gap-3 md:flex-row md:flex-nowrap md:justify-between md:gap-6">
        <p className="min-w-0 text-center break-words md:text-left">
          © {year} {name}. Todos os direitos reservados.
        </p>
        {items.length > 0 ? (
          <nav aria-label="Links do rodapé" className="shrink-0">
            <ul className="flex flex-wrap justify-center gap-2">
              {items.map(({ icon, url }) => {
                const label = FOOTER_ICON_LABELS[/** @type {keyof typeof FOOTER_ICON_LABELS} */ (icon)];
                const external = icon !== EMAIL_ICON;
                return (
                  <li key={icon}>
                    <a
                      href={url}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer", title: `${label} (abre em uma nova aba)` } : { title: label })}
                      aria-label={label}
                      className={ICON_LINK}
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
