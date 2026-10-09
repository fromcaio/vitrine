// Rodapé por ícones (A-029, RF24, RN17; ADR-035; Cap. 5 §5.10, `tab:api-v1`): o GET e o PUT do rodapé de um dono,
// que as duas rotas (`/api/footer-links`, do próprio espaço, e `/api/configuration/footer-links`, do sistema) usam
// com a mesma forma. O PUT recebe o rodapé INTEIRO (`{ links: [{ icon, url }] }`, na ordem do vetor), valida o lote
// por Zod (ícone da lista fechada, sem repetir, `https://` ou `mailto:` no `email`, teto de 8; 422
// `VALIDATION_ERROR` com um `details` por item, `field` como `links[2].url`) e o entrega ao Dados, que o grava
// numa transação. A pasta `_lib` é privada: não gera rota.
import { listFooterLinks, replaceFooterLinks } from "@/lib/db";
import { footerLinksSchema } from "@/lib/validators";
import { ok, parse } from "./http";

/**
 * O rodapé como a API o devolve: só o ícone e a URL, na ordem.
 * @param {Array<{ icon: string, url: string }>} links
 */
const publicLinks = (links) => links.map(({ icon, url }) => ({ icon, url }));

/**
 * @param {string | null} ownerId o usuário, ou `null` para o rodapé do site
 */
export async function readFooter(ownerId) {
  return ok(publicLinks(await listFooterLinks(ownerId)));
}

/**
 * @param {string | null} ownerId
 * @param {unknown} body o corpo JSON lido
 */
export async function writeFooter(ownerId, body) {
  const { links } = parse(footerLinksSchema, body, { bracketIndexes: true });
  return publicLinks(await replaceFooterLinks(ownerId, links));
}
