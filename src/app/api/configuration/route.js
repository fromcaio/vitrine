// /api/configuration (Cap. 5 §5.10): configuração do site para o painel. Toda rota exige sessão.
// A leitura pública da configuração não passa por aqui: é feita nos Server Components.
import { getConfiguration, updateConfiguration } from "@/lib/db";
import { revalidateConfiguration } from "@/lib/revalidate";
import { contrastWarnings } from "@/lib/theme";
import { configurationUpdateSchema } from "@/lib/validators";
import { ok, parse, readJson, route } from "../_lib/http";

/** GET: configuração vigente (registro único, RN08), sem avisos de contraste. */
export const GET = route(async () => ok(await getConfiguration()));

/**
 * PUT: atualiza identidade, cores (#RRGGBB, RN09) e os seis links sociais (http/https; vazio
 * equivale a ausente, RN17). Campos ausentes não mudam. Revalida o layout raiz (RN10).
 *
 * Responde `{ data, warnings }`: `warnings` traz os avisos de contraste da paleta GRAVADA
 * (Cap. 5 §5.9.1), no formato `{ code, field, ratio, minimum, message }`, e está sempre presente
 * (lista vazia se nenhuma cor falha). O aviso não bloqueia o salvamento: o status continua 200.
 */
export const PUT = route(
  async ({ request }) => {
    const patch = parse(configurationUpdateSchema, await readJson(request));
    const configuration = await updateConfiguration(patch);

    revalidateConfiguration();

    // Calculados depois da escrita e da revalidação, sobre o registro devolvido pelo banco, e
    // não sobre o corpo: o PUT é parcial, e os avisos valem mesmo quando ele não traz cores.
    const warnings = contrastWarnings({
      primaryColor: configuration.primaryColor,
      secondaryColor: configuration.secondaryColor,
      accentColor: configuration.accentColor,
    });
    return ok(configuration, { extra: { warnings } });
  },
  { mutation: true },
);
