// O desenho de um ícone do rodapé (RF24, RN17; ADR-035): a marca do Simple Icons (SVG inline de
// `brand-icons.js`, preenchido com `currentColor`) ou, para o que o pacote não tem (`lattes`,
// `linkedin`) e para o que não é marca (`website`, `email`), um glifo neutro próprio do projeto. É
// decorativo: o link (ou o botão do seletor) que o contém leva o nome.
import { BookOpenIcon, ContactCardIcon, GlobeIcon, MailIcon } from "@/components/ui/icons";
import { BRAND_ICONS } from "./brand-icons";

/** @type {Record<string, (props: { className?: string }) => import("react").ReactElement>} */
const NEUTRAL_GLYPHS = { website: GlobeIcon, email: MailIcon, lattes: BookOpenIcon, linkedin: ContactCardIcon };

/** @param {string} icon */
export const hasBrandMark = (icon) => Object.hasOwn(BRAND_ICONS, icon);

/**
 * @param {object} props
 * @param {string} props.icon um identificador da lista fechada (`footer-model.js`)
 * @param {string} [props.className]
 */
export function FooterIcon({ icon, className = "size-5 shrink-0" }) {
  if (hasBrandMark(icon)) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className} data-brand={icon}>
        <path d={BRAND_ICONS[icon].path} />
      </svg>
    );
  }
  const Glyph = NEUTRAL_GLYPHS[icon] ?? GlobeIcon;
  return <Glyph className={className} />;
}
