// Rotas de envio e remoção de imagem (A-029, RF35, RF36, RN29; ADR-034; Cap. 5 §5.10, `tab:api-v1`): o logotipo e
// o favicon do espaço (o próprio dono) e do sistema (o administrador) e o avatar (o próprio usuário). As cinco
// rotas fazem o mesmo, e só mudam o tipo de imagem, o dono (um usuário ou o sistema), a ação da matriz de
// autorização e o que revalidar; por isso nascem de `imageRoutes`. A pasta `_lib` é privada: não gera rota.
//
// PUT: lê o arquivo do `multipart` com limite (413), reserva a vaga de processamento (503), decodifica e
// reencoda com o `sharp` fora do laço de eventos (422 `INVALID_IMAGE`, sem eco do arquivo), troca a imagem
// (a nova entra e a antiga sai na MESMA transação do Dados, com id novo: a URL imutável nunca mostra a imagem
// errada) e revalida por caminhos literais (ADR-030). Responde 200 com `{ id, url, width, height }`.
// DELETE: remove a imagem e volta ao nível de baixo da cadeia de padrões (RN30); 204, também se não havia.
import { removeImage, replaceImage } from "@/lib/db";
import { ImageError, MAX_IMAGE_BYTES, processImage } from "@/lib/media";
import { revalidateConfiguration } from "@/lib/revalidate";
import { invalidImage, noContent, ok } from "./http";
import { acquireImageSlot } from "./image-slots";
import { revalidateInheritingSpaces, revalidateWholeSpace } from "./revalidation";
import { route } from "./route";

/** O caminho público de uma imagem (`GET /media/<id>`). @param {string} id */
export const mediaUrl = (id) => `/media/${id}`;

/**
 * Lê, confere e reencoda a imagem do corpo, com a vaga de processamento do usuário.
 * @param {import("@/lib/media").ImageKind} kind
 * @param {string} userId
 * @param {import("./route").RouteContext["readFile"]} readFile
 */
export async function receiveImage(kind, userId, readFile) {
  const { bytes, type } = await readFile({ maxFileBytes: MAX_IMAGE_BYTES });
  const release = acquireImageSlot(userId);
  try {
    return await processImage(kind, bytes, { declaredType: type });
  } catch (error) {
    throw error instanceof ImageError ? invalidImage(error.message) : error;
  } finally {
    release();
  }
}

/**
 * @typedef {object} ImageRouteConfig
 * @property {import("@/lib/media").ImageKind} kind
 * @property {"appearance:update" | "site:update" | "profile:update"} action ação da matriz de autorização
 * @property {boolean} site a imagem é do SISTEMA (dono `null`); senão, do próprio usuário da sessão
 * @property {boolean} [directory] a imagem aparece no diretório do portal (o avatar)
 */

/**
 * O PUT e o DELETE de uma imagem.
 * @param {ImageRouteConfig} config
 */
export function imageRoutes({ kind, action, site, directory = false }) {
  /** O recurso é o próprio ator (a imagem é sempre a dele; o sistema não tem dono). @param {{ actor: { id: string } }} context */
  const own = async ({ actor }) => ({ ownerId: actor.id });
  const load = site ? undefined : own;

  /** @param {{ id: string }} actor @param {"logo" | "favicon" | "avatar"} what */
  async function refresh(actor, what) {
    if (site) {
      // O portal mostra o logotipo e o favicon do sistema, e os espaços que os herdam também (ADR-038, item 6).
      revalidateConfiguration();
      if (what === "logo" || what === "favicon") await revalidateInheritingSpaces({ units: [what] });
      return;
    }
    await revalidateWholeSpace({ ownerId: actor.id, directory });
  }

  const PUT = route({ action, mutation: true, multipart: true, rate: "media", load }, async ({ actor, readFile }) => {
    const processed = await receiveImage(kind, actor.id, readFile);
    const saved = await replaceImage(kind, site ? null : actor.id, processed);
    await refresh(actor, kind);
    return ok({ id: saved.id, url: mediaUrl(saved.id), width: saved.width, height: saved.height });
  });

  const DELETE = route({ action, mutation: true, rate: "media", load }, async ({ actor }) => {
    const { removed } = await removeImage(kind, site ? null : actor.id);
    if (removed) await refresh(actor, kind);
    return noContent();
  });

  return { PUT, DELETE };
}
