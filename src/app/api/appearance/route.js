// /api/appearance (Cap. 5 §5.10): aparência do espaço DO PRÓPRIO usuário (RF31, RN19). A rota não
// recebe identificador: age sempre sobre o dono da sessão, de modo que não há como pedir a de outro
// (nem o administrador edita a de outro usuário; a suspensão é o recurso contra uma aparência
// abusiva).
import { getAppearance, getEffectiveAppearance, updateAppearance } from "@/lib/db";
import { appearanceUpdateSchema } from "@/lib/validators";
import { contrastReport, syncContrastNotifications } from "../_lib/contrast";
import { ok, parse } from "../_lib/http";
import { revalidateWholeSpace } from "../_lib/revalidation";
import { route } from "../_lib/route";

/** O recurso é a aparência do próprio ator. @param {{ actor: { id: string } }} context */
const ownAppearance = async ({ actor }) => ({ ownerId: actor.id });

/**
 * GET: a aparência CRUA do usuário (`data`), com os `null` de quem herda o sistema (ADR-038) e os
 * padrões de `showLogo` e `showName` se ele ainda não salvou nenhuma, e, ao lado, `effective` (a
 * mescla sobre o sistema, sem o padrão embutido) e `inherits` (o que veio do sistema).
 */
export const GET = route({ action: "appearance:read", load: ownAppearance }, async ({ actor }) => {
  const [appearance, effective] = await Promise.all([getAppearance(actor.id), getEffectiveAppearance(actor.id)]);
  const { inherits, ...merged } = effective ?? {};
  return ok(appearance, { extra: { effective: merged, inherits } });
});

/**
 * PUT: atualização parcial de identidade, da barra superior (`showLogo`, `showName`) e das paletas clara
 * e noturna (RN09, RN27); campos ausentes não mudam, e `null` no nome e nas cores volta a herdar o
 * sistema (ADR-038): a paleta de um modo tem as três cores ou nenhuma (422, `field` `lightPalette` ou
 * `darkPalette`) e os dois interruptores da barra não ficam ambos desligados (422, `field`
 * `showName`). Responde `{ data, warnings }`, como a configuração do site, com a aparência crua em
 * `data`. `warnings` traz os avisos de contraste dos modos cuja paleta o PRÓPRIO usuário definiu
 * (ADR-038, item 7): a herdada é de quem a definiu, e quem herda uma paleta ruim do sistema não é
 * avisado nem notificado. Cada modo com aviso gera (ou reabre) a notificação `CONTRAST`
 * `contrast:{modo}` do usuário; o modo que passa a atender, ou que volta a herdar, resolve a sua (RN26).
 * Revalida o espaço inteiro do dono (a página inicial e todos os caminhos públicos) e, se mudou o
 * nome ou a descrição, o portal, que os exibe no diretório (RN10, RN28, ADR-030).
 */
export const PUT = route(
  { action: "appearance:update", mutation: true, rate: "content", load: ownAppearance },
  async ({ actor, readJson }) => {
    const patch = parse(appearanceUpdateSchema, await readJson());
    const appearance = await updateAppearance(actor.id, patch);
    await revalidateWholeSpace({ ownerId: actor.id, directory: "siteName" in patch || "siteDescription" in patch });
    const { byMode, warnings } = contrastReport(appearance);
    await syncContrastNotifications({ userId: actor.id, scope: "appearance", byMode });
    return ok(appearance, { extra: { warnings } });
  },
);
