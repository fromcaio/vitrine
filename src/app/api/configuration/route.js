// /api/configuration (Cap. 5 §5.10): configuração do SITE (portal, login e painel) para o painel.
// Só o administrador (RN19, RF30); o usuário comum recebe 403. A leitura pública da configuração
// não passa por aqui: é feita nos Server Components.
import { bodyBytes } from "@/lib/limits";
import { getConfiguration, updateConfiguration } from "@/lib/db";
import { revalidateConfiguration } from "@/lib/revalidate";
import { configurationUpdateSchema } from "@/lib/validators";
import { ApiError, contentJsonMaxBytes, ok, parse } from "../_lib/http";
import { contrastReport, syncContrastNotifications } from "../_lib/contrast";
import { currentLimits } from "../_lib/limits";
import { assertRenderable } from "../_lib/render";
import { route } from "../_lib/route";

/** GET: configuração vigente (registro único, RN08), sem avisos de contraste. */
export const GET = route({ action: "site:read" }, async () => ok(await getConfiguration()));

/**
 * PUT: atualiza identidade, paletas (#RRGGBB, RN09), os seis links sociais (http/https; vazio
 * equivale a ausente, RN17), o texto do portal e o diretório (RN28). Campos ausentes não mudam.
 * O texto do portal respeita o limite de bytes de um corpo (RN25). Revalida só o portal `/` (`revalidatePath("/")`; RN10, ADR-030).
 *
 * Responde `{ data, warnings }`: `warnings` traz os avisos de contraste das DUAS paletas gravadas (a
 * noturna tem o prefixo `dark` no `field`; Cap. 5 §5.9.1), no formato
 * `{ code, field, ratio, minimum, message }`, e está sempre presente (lista vazia se nenhuma cor
 * falha). O aviso não bloqueia o salvamento: o status continua 200. Cada modo com aviso gera (ou
 * reabre) a notificação `CONTRAST` `contrast-site:{modo}` do administrador que gravou; o modo que
 * passa a atender resolve a sua (RN26).
 */
export const PUT = route({ action: "site:update", mutation: true, rate: "content" }, async ({ actor, readJson }) => {
  const limits = currentLimits();
  const patch = parse(configurationUpdateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
  const bytes = bodyBytes(patch.homeBody);
  if (bytes > limits.maxBodyBytes) {
    throw new ApiError(422, "QUOTA_EXCEEDED", "O texto do portal excede o tamanho máximo.", [
      { field: "body", bytes, max: limits.maxBodyBytes },
    ]);
  }

  // ADR-033: o texto do portal também passa pelo orçamento de renderização, depois da cota em bytes e antes
  // de gravar (422 `CONTENT_TOO_COMPLEX`, `field: "homeBody"`).
  await assertRenderable(patch.homeBody, "homeBody");

  const configuration = await updateConfiguration(patch);

  revalidateConfiguration();

  // Calculados depois da escrita e da revalidação, sobre o registro devolvido pelo banco, e
  // não sobre o corpo: o PUT é parcial, e os avisos valem mesmo quando ele não traz cores.
  const { byMode, warnings } = contrastReport(configuration);
  await syncContrastNotifications({ userId: actor.id, scope: "site", byMode });
  return ok(configuration, { extra: { warnings } });
});
