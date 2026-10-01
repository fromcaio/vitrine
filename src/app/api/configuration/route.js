// /api/configuration (Cap. 5 §5.10): configuração do site para o painel. Toda rota exige sessão.
// A leitura pública da configuração não passa por aqui: é feita nos Server Components.
import { getConfiguration, updateConfiguration } from "@/lib/db";
import { revalidateConfiguration } from "@/lib/revalidate";
import { configurationUpdateSchema } from "@/lib/validators";
import { ok, parse, readJson, route } from "../_lib/http";

/** GET: configuração vigente (registro único, RN08). */
export const GET = route(async () => ok(await getConfiguration()));

/**
 * PUT: atualiza identidade, cores (#RRGGBB, RN09) e os seis links sociais (http/https; vazio
 * equivale a ausente, RN17). Campos ausentes não mudam. Revalida o layout raiz (RN10).
 */
export const PUT = route(
  async ({ request }) => {
    const patch = parse(configurationUpdateSchema, await readJson(request));
    const configuration = await updateConfiguration(patch);

    revalidateConfiguration();
    return ok(configuration);
  },
  { mutation: true },
);
