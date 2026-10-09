// /api/configuration/footer-links (Cap. 5 §5.10, tab:api-v1; RF24, RN17, ADR-035): o rodapé do SISTEMA (o portal, o
// /login e o painel do administrador). Só o administrador (403 ao usuário comum). O dono do rodapé é o sistema
// (`null`). Revalida o portal; os espaços não herdam o rodapé (RN17).
import { revalidateConfiguration } from "@/lib/revalidate";
import { readFooter, writeFooter } from "../../_lib/footer";
import { ok } from "../../_lib/http";
import { route } from "../../_lib/route";

/** GET: `data: [{ icon, url }]`, na ordem do rodapé. */
export const GET = route({ action: "site:read" }, async () => readFooter(null));

/** PUT `{ links: [{ icon, url }] }`: substitui o rodapé inteiro do sistema (de 0 a 8 itens). */
export const PUT = route({ action: "site:update", mutation: true, rate: "content" }, async ({ readJson }) => {
  const links = await writeFooter(null, await readJson());
  revalidateConfiguration();
  return ok(links);
});
