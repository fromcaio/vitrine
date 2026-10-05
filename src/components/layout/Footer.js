// Rodapé do espaço (RF24; M17): o texto de direitos, gerado do nome e do ano, e os ícones das redes
// com link (SocialLinks). Server Component de apresentação, só com tokens de tema.
import { SocialLinks } from "./SocialLinks";

/**
 * @param {object} props
 * @param {string} props.name nome do espaço (ou do site, no portal)
 * @param {import("./SocialLinks").SocialLinksValue | null} [props.socialLinks] links do dono
 * @param {number} [props.year] ano dos direitos; o padrão é o ano corrente (nas páginas estáticas,
 *   o do momento em que foram geradas)
 */
export function Footer({ name, socialLinks = null, year = new Date().getFullYear() }) {
  return (
    <footer className="mt-auto border-t border-border bg-surface px-4 py-6 text-sm text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 break-words">
          © {year} {name}. Todos os direitos reservados.
        </p>
        <SocialLinks links={socialLinks} />
      </div>
    </footer>
  );
}
