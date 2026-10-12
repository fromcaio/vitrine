// /api/home (Cap. 5 §5.10; RF42, RN35, RN36, ADR-040): a página inicial do espaço DO PRÓPRIO usuário, de
// qualquer papel. Como /api/appearance, a rota não recebe identificador: age sempre sobre o dono da sessão
// (o administrador também edita só a sua; a página inicial de outro usuário só se despublica ou se apaga em
// /api/users/:id/home, com motivo). A página inicial do SISTEMA (o portal) é o `homeBody` e o `homeStatus` de
// /api/configuration.
import { getHome, updateHome } from "@/lib/db";
import { homeUpdateSchema } from "@/lib/validators";
import { contentJsonMaxBytes, ok, parse } from "../_lib/http";
import { currentLimits } from "../_lib/limits";
import { assertBodyWithinQuota, assertRenderable } from "../_lib/render";
import { revalidateSpaceHome } from "../_lib/revalidation";
import { route } from "../_lib/route";

/** O recurso é a página inicial do próprio ator. @param {{ actor: { id: string } }} context */
const ownHome = async ({ actor }) => ({ ownerId: actor.id });

/** GET: `{ data: { homeBody, homeStatus, homeShowItems } }` (padrão: nulo, `PUBLISHED`, `true`). */
export const GET = route({ action: "home:read", load: ownHome }, async ({ actor }) => ok(await getHome(actor.id)));

/**
 * PUT: atualização parcial (ao menos um campo) de `homeBody` (Markdown; vazio ou só espaços vira `null`),
 * `homeStatus` (`PUBLISHED` ou `DRAFT`) e `homeShowItems`. Sem `version`: o último envio vale, porque só o
 * dono escreve. O texto passa pelo MESMO tratamento do corpo de um conteúdo: 413 acima do limite do corpo
 * HTTP, 422 `QUOTA_EXCEEDED` acima de `MAX_BODY_BYTES` (RN25), 422 `CONTENT_TOO_COMPLEX` com `field`
 * `homeBody` e 503 `BUSY` (orçamento de renderização, ADR-033). Revalida a página `/{handle}` do dono, e só ela
 * (CT74); sem `handle`, não há o que revalidar. A senha provisória bloqueia a rota (RN21).
 */
export const PUT = route(
  { action: "home:update", mutation: true, rate: "content", load: ownHome },
  async ({ actor, readJson }) => {
    const limits = currentLimits();
    const patch = parse(homeUpdateSchema, await readJson({ maxBytes: contentJsonMaxBytes(limits) }));
    if (patch.homeBody !== undefined) {
      assertBodyWithinQuota(patch.homeBody, limits);
      await assertRenderable(patch.homeBody, "homeBody", { userId: actor.id });
    }
    const home = await updateHome(actor.id, patch, { limits });
    await revalidateSpaceHome(actor.id);
    return ok(home);
  },
);
