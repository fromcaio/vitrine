// Apoio às páginas de gestão de usuários e de moderação (A-014 Parte 3e-2; RF27, RF34; RN19, RN24; UC13, UC15):
// a primeira página da lista de usuários, no formato de `GET /api/users`, e os modelos de endereço que os
// componentes da UI usam (texto, e não função: uma página de Servidor não passa funções a um Componente
// Cliente). A conta e o conteúdo de OUTRO usuário só chegam a quem a página já provou ser administrador.
// Pasta privada do App Router: não gera rota.
import { notFound } from "next/navigation";
import { auth, findUserById } from "@/lib/auth";
import { getContentById } from "@/lib/db";
import { authCall, publicUser } from "../../api/_lib/users";

/** Usuários por página (o padrão de `GET /api/users`, `userListQuerySchema`). */
export const USERS_PAGE_SIZE = 50;

/** Modelo do endereço do espaço público de um usuário: a `UserTable` troca `{handle}`. */
export const SPACE_HREF = "/{handle}";

/** Modelo do endereço da árvore de moderação de um usuário: a `UserTable` troca `{id}`. */
export const USER_CONTENT_HREF = "/admin/usuarios/{id}/conteudo";

/**
 * O modelo do endereço de edição de um conteúdo alheio, COM o dono: o `ContentTree` em moderação troca `{id}`
 * pelo identificador do conteúdo. O dono entra por valor (codificado); `{id}` fica literal.
 * @param {string} ownerId
 */
export const moderationEditHref = (ownerId) => `/admin/usuarios/${encodeURIComponent(ownerId)}/conteudo/{id}`;

/**
 * A primeira página da lista de usuários, como `GET /api/users` a devolve: `data` é `publicUser` (nunca a
 * senha, as contas nem as sessões), mais `total`, `limit` e `offset`. A mesma consulta da rota
 * (`auth.api.listUsers`, do mais antigo ao mais novo), com os cabeçalhos do pedido, sem abrir rota nova. O
 * resultado vai como JSON puro (as datas em texto), pois a `UserTable` é um Componente Cliente. A senha
 * provisória NUNCA passa por aqui: só pela resposta da API, direto no navegador.
 * @param {Headers} requestHeaders os cabeçalhos do pedido (a sessão do administrador)
 */
export async function firstUsersPage(requestHeaders) {
  const result = await authCall(() =>
    auth.api.listUsers({
      headers: requestHeaders,
      query: { limit: USERS_PAGE_SIZE, offset: 0, sortBy: "createdAt", sortDirection: "asc" },
    }),
  );
  const users = /** @type {any[]} */ (result.users);
  return JSON.parse(JSON.stringify({ data: users.map(publicUser), total: result.total, limit: USERS_PAGE_SIZE, offset: 0 }));
}

/**
 * O usuário dono do conteúdo que o administrador vai moderar, ou `notFound()` se não existe (a conta
 * suspensa existe: a moderação vale também para ela).
 * @param {string} ownerId
 */
export async function loadOwner(ownerId) {
  const owner = await findUserById(ownerId);
  if (!owner) notFound();
  return owner;
}

/**
 * O DOCUMENTO a moderar, que TEM de pertencer ao usuário `ownerId` (o `authorId`): um `contentId` de outro dono,
 * inexistente ou uma coleção responde `notFound()`, indistinguíveis. Sem isto, um endereço forjado
 * (`/admin/usuarios/{A}/conteudo/{conteúdo do B}`) faria o administrador editar "o conteúdo do B" como se fosse
 * da A (a moderação vale por dono, e a notificação vai ao dono).
 * @param {string} ownerId
 * @param {string} contentId
 */
export async function loadOwnedDocument(ownerId, contentId) {
  const content = await getContentById(contentId);
  if (!content || content.authorId !== ownerId || content.type !== "DOCUMENT") notFound();
  return content;
}
