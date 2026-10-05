// Layout do espaço público (RF29, RNF05, RNF06; M17): o envoltório `.vitrine-tema` com a aparência
// do dono, o atalho "Pular para o conteúdo", a barra superior (banner), a sidebar da coleção
// corrente (navegação), a área principal (main) e o rodapé (contentinfo). Server Component de
// apresentação: não lê o banco nem conhece o dono; o Core entrega tudo por props.
//
// O `themeStyle` (as variáveis das duas paletas, que o Core monta com `textColorsOf`) vai ao
// atributo `style` do MESMO elemento da classe `vitrine-tema`: as regras do §5.9 resolvem
// `var(--vitrine-light-*)` ali, onde as variáveis existem. Passa por `safeThemeStyle` antes: só as
// dez variáveis conhecidas, só com valor #RRGGBB.
import { safeThemeStyle } from "@/lib/theme";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

/**
 * @param {object} props
 * @param {Record<string, string> | null} [props.themeStyle] variáveis `--vitrine-light-*` e
 *   `--vitrine-dark-*` da aparência do dono; sem elas valem as paletas padrão do CSS
 * @param {string} props.name nome do espaço (ou do site, no portal)
 * @param {string} props.homeHref início do espaço (`/maria`; `/` no portal)
 * @param {string | null} [props.logoUrl] logotipo, se houver
 * @param {import("./Navbar").NavbarItem[]} [props.navItems] coleções raiz (`navItemsOf`)
 * @param {import("@/lib/content-tree").ContentNode | null} [props.collection] coleção raiz corrente;
 *   sem ela (início do espaço, portal), não há sidebar
 * @param {string} [props.basePath] prefixo do espaço, sem barra final (`/maria`; "" no portal)
 * @param {string[]} [props.activePath] cadeia de slugs da página corrente
 * @param {import("./SocialLinks").SocialLinksValue | null} [props.socialLinks] links do rodapé
 * @param {number} [props.year] ano dos direitos
 * @param {boolean} [props.modeToggle] mostra o seletor do modo de cor na barra (padrão)
 * @param {string} [props.mainId] id do `<main>`, alvo do atalho; só a pré-visualização o troca, para
 *   não repetir o id da página
 * @param {import("react").ReactNode} props.children a página
 */
export function SpaceLayout({
  themeStyle = null,
  name,
  homeHref,
  logoUrl = null,
  navItems = [],
  collection = null,
  basePath = "",
  activePath = [],
  socialLinks = null,
  year,
  modeToggle = true,
  mainId = "conteudo-principal",
  children,
}) {
  return (
    <div className="vitrine-tema relative flex flex-1 flex-col bg-background text-foreground" style={safeThemeStyle(themeStyle)}>
      {/* Atalho de teclado (WCAG 2.4.1): fica acima da janela até receber o foco. */}
      <a
        href={`#${mainId}`}
        className="absolute top-2 left-2 z-10 -translate-y-20 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Navbar name={name} homeHref={homeHref} logoUrl={logoUrl} items={navItems} modeToggle={modeToggle} />
      <div className="flex flex-1 flex-col md:flex-row">
        {collection ? <Sidebar collection={collection} basePath={basePath} activePath={activePath} /> : null}
        {/* tabIndex -1: recebe o foco do atalho sem entrar na ordem de tabulação. */}
        <main id={mainId} tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none sm:p-6 md:p-8">
          {children}
        </main>
      </div>
      <Footer name={name} socialLinks={socialLinks} year={year} />
    </div>
  );
}
