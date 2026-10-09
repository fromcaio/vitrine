// /api/footer-links (Cap. 5 §5.10, tab:api-v1; RF24, RN17, ADR-035): o rodapé do espaço DO PRÓPRIO usuário (qualquer
// papel). Sem identificador: age sempre sobre o dono da sessão (RN19). O rodapé não herda o do sistema (RN17).
import { revalidateWholeSpace } from "../_lib/revalidation";
import { readFooter, writeFooter } from "../_lib/footer";
import { ok } from "../_lib/http";
import { route } from "../_lib/route";

/** O recurso é o rodapé do próprio ator. @param {{ actor: { id: string } }} context */
const own = async ({ actor }) => ({ ownerId: actor.id });

/** GET: `data: [{ icon, url }]`, na ordem do rodapé. */
export const GET = route({ action: "appearance:read", load: own }, async ({ actor }) => readFooter(actor.id));

/**
 * PUT `{ links: [{ icon, url }] }`: substitui o rodapé inteiro (de 0 a 8 itens; a ordem do vetor é a do rodapé).
 * Um item inválido recusa o lote (422, um `details` por item). Revalida o espaço do dono (ADR-030).
 */
export const PUT = route({ action: "appearance:update", mutation: true, rate: "content", load: own }, async ({ actor, readJson }) => {
  const links = await writeFooter(actor.id, await readJson());
  await revalidateWholeSpace({ ownerId: actor.id });
  return ok(links);
});
