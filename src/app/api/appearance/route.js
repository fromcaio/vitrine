// /api/appearance (Cap. 5 §5.10): aparência do espaço DO PRÓPRIO usuário (RF31, RN19). A rota não
// recebe identificador: age sempre sobre o dono da sessão, de modo que não há como pedir a de outro
// (nem o administrador edita a de outro usuário; a suspensão é o recurso contra uma aparência
// abusiva).
import { getAppearance, updateAppearance } from "@/lib/db";
import { appearanceUpdateSchema } from "@/lib/validators";
import { contrastWarningsOf } from "../_lib/contrast";
import { ok, parse } from "../_lib/http";
import { revalidateWholeSpace } from "../_lib/revalidation";
import { route } from "../_lib/route";

/** O recurso é a aparência do próprio ator. @param {{ actor: { id: string } }} context */
const ownAppearance = async ({ actor }) => ({ ownerId: actor.id });

/** GET: aparência vigente do usuário (os padrões, se ele ainda não salvou nenhuma), sem avisos. */
export const GET = route({ action: "appearance:read", load: ownAppearance }, async ({ actor }) =>
  ok(await getAppearance(actor.id)),
);

/**
 * PUT: atualização parcial de identidade, links sociais (RN17) e das paletas clara e noturna (RN09,
 * RN27); campos ausentes não mudam. Responde `{ data, warnings }`, como a configuração do site.
 * Revalida o espaço inteiro do dono (a página inicial e todos os caminhos públicos) e, se mudou o
 * nome ou a descrição, o portal, que os exibe no diretório (RN10, RN28, ADR-030).
 */
export const PUT = route(
  { action: "appearance:update", mutation: true, rate: "content", load: ownAppearance },
  async ({ actor, readJson }) => {
    const patch = parse(appearanceUpdateSchema, await readJson());
    const appearance = await updateAppearance(actor.id, patch);
    await revalidateWholeSpace({ ownerId: actor.id, directory: "siteName" in patch || "siteDescription" in patch });
    return ok(appearance, { extra: { warnings: contrastWarningsOf(appearance) } });
  },
);
