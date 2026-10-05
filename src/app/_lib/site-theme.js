// Envoltório do tema do site (ADR-030, ADR-025; Cap. 5 §5.9): o elemento `.vitrine-tema` que leva, no
// PRÓPRIO atributo `style`, as variáveis das duas paletas do proprietário (`--vitrine-light-*` e
// `--vitrine-dark-*`); as regras do globals.css escolhem o conjunto do modo no mesmo elemento (um
// `var()` declarado em `:root` seria resolvido onde as variáveis do proprietário não existem). O layout
// raiz é estático e não define cores: o portal, o login e o painel usam este envoltório com a
// configuração do site. Pasta privada do App Router: não gera rota.
import { buildThemeStyle } from "./site";

/**
 * @param {object} props
 * @param {Record<string, unknown> | null | undefined} props.configuration configuração do site (ou
 *   `null`: valem as paletas padrão do globals.css)
 * @param {import("react").ReactNode} props.children
 */
export function SiteTheme({ configuration, children }) {
  const style = buildThemeStyle(configuration);
  return (
    <div className="vitrine-tema flex flex-1 flex-col" style={Object.keys(style).length > 0 ? style : undefined}>
      {children}
    </div>
  );
}
