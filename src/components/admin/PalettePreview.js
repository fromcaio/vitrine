// Pré-visualização da aparência em um dos dois modos (RF31, RN27): a barra, uma coleção, um botão
// primário, o destaque e o rodapé com as redes preenchidas, desenhados pelos mesmos componentes do
// espaço público (SpaceLayout, Navbar, Footer) com o `themeStyle` do que está sendo editado.
//
// O modo é forçado pela classe `vitrine-modo-claro` ou `vitrine-modo-escuro` (globals.css), seja
// qual for o da página. Nada nela é interativo: o `inert` tira os links e botões da ordem de
// tabulação e da árvore de acessibilidade, de modo que a pré-visualização não rouba o foco nem
// repete os marcos (banner, main, rodapé) da página; o grupo rotulado a identifica. Não conhece o
// dono: recebe o nome, o logotipo, os links e as variáveis por props.
import { SpaceLayout } from "@/components/layout/SpaceLayout";
import { Button } from "@/components/ui/Button";

const NAV_ITEMS = [
  { id: "a", label: "Coleção A", href: "#", current: true },
  { id: "b", label: "Coleção B", href: "#", current: false },
];

/**
 * @param {object} props
 * @param {"light" | "dark"} props.mode modo mostrado
 * @param {string} props.id prefixo dos ids (o do `<main>` da amostra não repete o da página)
 * @param {string} props.name nome do site ou do espaço
 * @param {string | null} [props.logoUrl] logotipo válido, se houver
 * @param {import("@/components/layout/SocialLinks").SocialLinksValue} [props.links] links válidos
 * @param {Record<string, string>} props.themeStyle as dez variáveis do envoltório (`previewStyle`)
 */
export function PalettePreview({ mode, id, name, logoUrl = null, links = {}, themeStyle }) {
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
          navItems={NAV_ITEMS}
          socialLinks={links}
          year={2026}
          modeToggle={false}
          mainId={`${id}-amostra`}
        >
          <div className="flex flex-col gap-3">
            <h3 className="text-xl font-semibold break-words">Título de um documento</h3>
            <p className="text-sm">
              Um parágrafo de exemplo, com <strong>negrito</strong> e <span className="text-muted">texto secundário</span>.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button tabIndex={-1}>Ação principal</Button>
              <span className="inline-flex items-center gap-2 text-sm">
                <span className="inline-block size-4 rounded-full bg-accent" />
                Destaque
              </span>
            </div>
          </div>
        </SpaceLayout>
      </div>
    </div>
  );
}
