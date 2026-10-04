// /api/configuration (Cap. 5 §5.10): configuração do SITE (portal, login e painel) para o painel.
// Só o administrador (RN19, RF30); o usuário comum recebe 403. A leitura pública da configuração
// não passa por aqui: é feita nos Server Components.
import { bodyBytes } from "@/lib/limits";
import { getConfiguration, updateConfiguration } from "@/lib/db";
import { revalidateConfiguration } from "@/lib/revalidate";
import { configurationUpdateSchema } from "@/lib/validators";
import { ApiError, contentJsonMaxBytes, ok, parse } from "../_lib/http";
import { contrastWarningsOf } from "../_lib/contrast";
import { currentLimits } from "../_lib/limits";
import { route } from "../_lib/route";

/** GET: configuração vigente (registro único, RN08), sem avisos de contraste. */
export const GET = route({ action: "site:read" }, async () => ok(await getConfiguration()));

/**
 * PUT: atualiza identidade, paletas (#RRGGBB, RN09), os seis links sociais (http/https; vazio
 * equivale a ausente, RN17), o texto do portal e o diretório (RN28). Campos ausentes não mudam.
 * O texto do portal respeita o limite de bytes de um corpo (RN25). Revalida o layout raiz (RN10).
 *
 * Responde `{ data, warnings }`: `warnings` traz os avisos de contraste da paleta GRAVADA
 * (Cap. 5 §5.9.1), no formato `{ code, field, ratio, minimum, message }`, e está sempre presente
 * (lista vazia se nenhuma cor falha). O aviso não bloqueia o salvamento: o status continua 200.
 */
export const PUT = route({ action: "site:update", mutation: true, rate: "content" }, async ({ readJson }) => {
  const limits = currentLimits();
  const patch = parse(configurationUpdateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
  const bytes = bodyBytes(patch.homeBody);
  if (bytes > limits.maxBodyBytes) {
    throw new ApiError(422, "QUOTA_EXCEEDED", "O texto do portal excede o tamanho máximo.", [
      { field: "body", bytes, max: limits.maxBodyBytes },
    ]);
  }

  const configuration = await updateConfiguration(patch);

  revalidateConfiguration();

  // Calculados depois da escrita e da revalidação, sobre o registro devolvido pelo banco, e
  // não sobre o corpo: o PUT é parcial, e os avisos valem mesmo quando ele não traz cores.
  return ok(configuration, { extra: { warnings: contrastWarningsOf(configuration) } });
});
