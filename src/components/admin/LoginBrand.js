// Marca do cartão de /login (D-34, ADR-037): o logo e/ou o nome do SITE (o login usa sempre a
// aparência do sistema), na mesma regra da barra: `showLogo` e `showName` valem `true` por padrão,
// com o logo antes do nome e o logo embutido quando não há imagem. Server Component de apresentação;
// o Core o monta com os dados da configuração do site.
import { SiteBrand } from "@/components/layout/SiteBrand";

/**
 * @param {object} props
 * @param {string} props.name nome do site
 * @param {string | null} [props.logoUrl] logo (`/media/<id>`)
 * @param {boolean} [props.showLogo]
 * @param {boolean} [props.showName]
 */
export function LoginBrand({ name, logoUrl = null, showLogo = true, showName = true }) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-muted" data-testid="marca-do-login">
      <SiteBrand
        name={name}
        logoUrl={logoUrl}
        showLogo={showLogo}
        showName={showName}
        nameClassName="text-sm font-semibold uppercase tracking-wide"
      />
    </div>
  );
}
