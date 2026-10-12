// Apoio às páginas do editor (P-012, R-007; CT53): o dono é conferido ANTES de renderizar. O conteúdo
// de outro dono, o inexistente e o `?pai=` que não seja uma coleção do próprio usuário respondem todos
// `notFound()`, indistinguíveis (RN19: a página não revela quais identificadores existem). O
// administrador também só edita o que é seu aqui: a moderação do conteúdo alheio, com o motivo, é da
// interface de moderação (UI, etapa 5), que envia `reason`. Pasta privada do App Router.
import { notFound } from "next/navigation";
import { findUserById } from "@/lib/auth";
import { getContentById, getPublicPaths, getUserByHandle } from "@/lib/db";

/**
 * Documento do próprio usuário, ou `notFound()`. O editor é só para documentos (R-007): uma
 * coleção também responde `notFound()`.
 * @param {string} userId usuário da sessão
 * @param {string} contentId
 */
export async function loadOwnDocument(userId, contentId) {
  const content = await getContentById(contentId);
  if (!content || content.authorId !== userId || content.type !== "DOCUMENT") notFound();
  return content;
}

/**
 * Valor de `?pai=`: `null` se ausente ou vazio (o conteúdo nasce na raiz); o identificador de uma
 * coleção DO PRÓPRIO usuário; qualquer outra coisa (documento, coleção alheia, inexistente, valor
 * repetido) responde `notFound()`.
 * @param {string} userId usuário da sessão
 * @param {string | string[] | undefined} value valor bruto de `searchParams.pai`
 * @returns {Promise<string | null>}
 */
export async function resolveParent(userId, value) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string") notFound();
  const parent = await getContentById(value);
  if (!parent || parent.authorId !== userId || parent.type !== "COLLECTION") notFound();
  return parent.id;
}

/**
 * Caminho PÚBLICO do documento (`/{handle}/{slugs}`), ou `null` se ele não tem página agora (P-025; RN15, RN23):
 * o dono tem `handle` e está ativo (não suspenso) e o documento e TODOS os ancestrais estão PUBLISHED. Reaproveita
 * as regras das páginas públicas (`getUserByHandle`, que trata a suspensão, e `getPublicPaths`, que usa a árvore
 * podada). Devolve só o caminho: nenhum identificador nem dado do dono vai ao cliente. O `ownerId` é o DONO do
 * documento (na moderação, não o administrador).
 * @param {string} ownerId
 * @param {string} contentId
 * @returns {Promise<string | null>}
 */
export async function publicViewHref(ownerId, contentId) {
  const owner = await findUserById(ownerId);
  const handle = typeof owner?.handle === "string" ? owner.handle : "";
  if (!handle) return null;
  const space = await getUserByHandle(handle);
  if (!space || space.id !== ownerId) return null;
  const [slugs] = await getPublicPaths(ownerId, contentId);
  if (!slugs || slugs.length === 0) return null;
  return `/${[handle, ...slugs].map(encodeURIComponent).join("/")}`;
}
