"use client";

// A seção "Rodapé" de `/admin/aparencia` (RF24, RN17, UC20): o título e o `FooterLinksEditor` ligado à
// API do alvo, o rodapé do próprio espaço (`/api/footer-links`) ou o do sistema
// (`/api/configuration/footer-links`, só o administrador). É irmã do formulário de aparência, não filha:
// os dois têm gravação própria. Usada pelo `AppearanceForm` e pelo `SiteIdentityForm`.
import { useId } from "react";
import { FooterLinksEditor } from "./FooterLinksEditor";
import { FOOTER_ENDPOINTS, createFooterClient } from "./footer-client";

/**
 * @param {object} props
 * @param {{ icon: string, url: string }[]} props.links o rodapé gravado, na ordem
 * @param {"page" | "site"} props.scope
 * @param {import("./footer-client").FooterClient} [props.client] o cliente de gravação; o padrão fala com a API do alvo
 * @param {"h2" | "h3"} [props.heading] o nível do título, conforme o lugar onde a seção entra (padrão `h2`)
 */
export function FooterLinksSection({ links, scope, client, heading: Heading = "h2" }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <Heading id={headingId} className="text-lg font-semibold">
        Rodapé
      </Heading>
      <FooterLinksEditor initial={links} scope={scope} client={client ?? createFooterClient(FOOTER_ENDPOINTS[scope])} />
    </section>
  );
}
