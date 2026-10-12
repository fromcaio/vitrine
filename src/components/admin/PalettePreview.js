// Pré-visualização da aparência em um dos dois modos (RF31, RN27): o cabeçalho com as coleções, a sidebar da
// coleção EXPANDIDA e, à direita dela, a faixa vazia do fundo do conteúdo (cerca de 80% e 20% da largura, o
// leiaute real do espaço), e o rodapé com ícones de exemplo; tudo desenhado pelos mesmos componentes do espaço
// público (SpaceLayout, Navbar, Sidebar, Footer) com o `themeStyle` do que está sendo editado. NÃO há conteúdo de
// exemplo: mudar as cores não muda o conteúdo (P-030).
//
// O modo é forçado pela classe `vitrine-modo-claro` ou `vitrine-modo-escuro` (globals.css), seja
// qual for o da página. Nada nela é interativo: o `inert` tira os links e botões da ordem de
// tabulação e da árvore de acessibilidade, de modo que a pré-visualização não rouba o foco nem
// repete os marcos (banner, main, rodapé) da página; o grupo rotulado a identifica. Não conhece o
// dono: recebe o nome, o logotipo e as variáveis por props. O botão de modo claro/escuro aparece só como
// IMAGEM (`ColorModeToggleStatic`, P-024 item 6): sem cookie, sem efeito e sem tocar na classe `dark` do <html>.
import { SpaceLayout } from "@/components/layout/SpaceLayout";

const NAV_ITEMS = [
  { id: "a", label: "Coleção A", href: "#", current: true },
  { id: "b", label: "Coleção B", href: "#", current: false },
];

/** @param {string} id @param {string} slug @param {string} title @param {"COLLECTION" | "DOCUMENT"} type @param {any[]} [children] */
const node = (id, slug, title, type, children = []) => ({ id, slug, title, type, status: "PUBLISHED", parentId: null, order: 0, children });

/**
 * A coleção de exemplo da barra lateral: "Limites" aberta (é a cadeia do item ativo, em negrito), com três
 * filhos, um deles ativo; "Derivadas" fechada (chevron para a direita) e um documento solto em repouso.
 * Dados fixos da amostra (a amostra não conhece o dono).
 */
const SAMPLE_COLLECTION = /** @type {import("@/lib/content-tree").ContentNode} */ (
  /** @type {unknown} */ (
    node("amostra-calculo", "calculo", "Cálculo I", "COLLECTION", [
      node("amostra-intro", "introducao", "Introdução", "DOCUMENT"),
      node("amostra-limites", "limites", "Limites", "COLLECTION", [
        node("amostra-definicao", "definicao", "Definição de limite", "DOCUMENT"),
        node("amostra-propriedades", "propriedades", "Propriedades dos limites", "DOCUMENT"),
        node("amostra-continuidade", "continuidade", "Continuidade", "DOCUMENT"),
      ]),
      node("amostra-derivadas", "derivadas", "Derivadas", "COLLECTION", [node("amostra-regras", "regras", "Regras de derivação", "DOCUMENT")]),
      node("amostra-exercicios", "exercicios", "Exercícios", "DOCUMENT"),
    ])
  )
);
/** A página ativa da amostra: "Propriedades dos limites". */
const SAMPLE_ACTIVE_PATH = ["calculo", "limites", "propriedades"];

/** Os quatro ícones de exemplo do rodapé (URLs fictícias; nada é navegável dentro do `inert`). */
const SAMPLE_FOOTER_LINKS = [
  { icon: "github", url: "https://exemplo.com/github" },
  { icon: "linkedin", url: "https://exemplo.com/linkedin" },
  { icon: "youtube", url: "https://exemplo.com/youtube" },
  { icon: "email", url: "mailto:contato@exemplo.com" },
];

/**
 * @param {object} props
 * @param {"light" | "dark"} props.mode modo mostrado
 * @param {string} props.id prefixo dos ids (o do `<main>` da amostra não repete o da página)
 * @param {string} props.name nome do site ou do espaço
 * @param {string | null} [props.logoUrl] logotipo válido, se houver; sem ele, o logo embutido
 * @param {boolean} [props.showLogo] mostra o logo na barra (padrão)
 * @param {boolean} [props.showName] mostra o nome na barra (padrão)
 * @param {Record<string, string>} props.themeStyle as dez variáveis do envoltório (`previewStyle`)
 * @param {string} [props.modeIconPair] o par de ícones do botão de modo na amostra (`modeIconPair` do site); sem
 *   ele, `sun_moon`
 */
export function PalettePreview({ mode, id, name, logoUrl = null, showLogo = true, showName = true, themeStyle, modeIconPair }) {
  const light = mode === "light";
  return (
    <div
      role="group"
      aria-label={`Pré-visualização do modo ${light ? "claro" : "noturno"}`}
      className={`${light ? "vitrine-modo-claro" : "vitrine-modo-escuro"} overflow-hidden rounded-md border border-border-strong`}
    >
      <div inert className="flex">
        <SpaceLayout
          themeStyle={themeStyle}
          name={name}
          homeHref="#"
          logoUrl={logoUrl}
          showLogo={showLogo}
          showName={showName}
          navItems={NAV_ITEMS}
          year={2026}
          modeToggle={false}
          modeTogglePreview={mode}
          modeIconPair={modeIconPair}
          mainId={`${id}-amostra`}
          collection={SAMPLE_COLLECTION}
          basePath="/amostra"
          activePath={SAMPLE_ACTIVE_PATH}
          footerLinks={SAMPLE_FOOTER_LINKS}
          preview
        />
      </div>
    </div>
  );
}
