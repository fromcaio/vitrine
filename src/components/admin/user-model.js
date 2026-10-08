// Modelo da gestão de usuários (RF27; RN19 a RN24; ADR-024): funções puras, sem React nem DOM. O
// servidor é a autoridade (RF21): estas regras só decidem o que a tela OFERECE e o que ela valida
// antes de enviar. A tela nunca oferece uma ação que a matriz de autorização recusaria (a própria
// conta não se suspende nem se exclui; o último administrador ativo não é rebaixado, suspenso nem
// excluído); se errar, o 403 ou o 409 do servidor chega e a mensagem aparece.

/**
 * O usuário como `GET /api/users` o devolve (sem hash, sem sessão).
 * @typedef {object} PublicUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string | null} handle
 * @property {"admin" | "user"} role
 * @property {boolean} suspended a suspensão VIGENTE (um prazo vencido não conta, RN23)
 * @property {string | null} banReason
 * @property {string | null} banExpires ISO 8601
 * @property {string | null} avatarImageId o identificador da imagem do avatar (`/media/<id>`), ou nulo sem avatar (RF36)
 * @property {boolean} mustChangePassword senha provisória pendente (RN21)
 * @property {string | null} createdAt
 * @property {string | null} updatedAt
 */

/** RN20: limites do `handle` (repetem `HANDLE_*` de validators.js; um teste os compara). */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** RN20: nomes que o handle não pode ter (repete `RESERVED_HANDLES`; um teste os compara). */
export const RESERVED_HANDLES = Object.freeze(["admin", "api", "login", "logout", "_next", "media"]);
/** Limite do nome de exibição (repete `NAME_MAX_LENGTH`). */
export const NAME_MAX_LENGTH = 100;
/** Limite do e-mail (repete o do validador de criação). */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Usuário saneado: só os campos conhecidos, com os tipos esperados (um item malformado não derruba a
 * lista). `null` se não tem identificador.
 * @param {any} raw
 * @returns {PublicUser | null}
 */
export function normalizeUser(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || raw.id === "") return null;
  const text = (/** @type {unknown} */ value) => (typeof value === "string" ? value : "");
  const maybe = (/** @type {unknown} */ value) => (typeof value === "string" && value !== "" ? value : null);
  return {
    id: raw.id,
    name: text(raw.name),
    email: text(raw.email),
    handle: maybe(raw.handle),
    role: raw.role === "admin" ? "admin" : "user",
    suspended: raw.suspended === true,
    banReason: maybe(raw.banReason),
    banExpires: maybe(raw.banExpires),
    avatarImageId: typeof raw.avatarImageId === "string" && /^[A-Za-z0-9_-]+$/.test(raw.avatarImageId) ? raw.avatarImageId : null,
    mustChangePassword: raw.mustChangePassword === true,
    createdAt: maybe(raw.createdAt),
    updatedAt: maybe(raw.updatedAt),
  };
}

/**
 * A lista inicial de `GET /api/users`, saneada.
 * @param {any} raw `{ data, total, limit, offset }`
 * @returns {{ users: PublicUser[], total: number, limit: number, offset: number }}
 */
export function normalizePage(raw) {
  const count = (/** @type {unknown} */ value, /** @type {number} */ fallback) => (Number.isInteger(value) && /** @type {number} */ (value) >= 0 ? /** @type {number} */ (value) : fallback);
  const users = /** @type {PublicUser[]} */ ((Array.isArray(raw?.data) ? raw.data : []).map(normalizeUser).filter(Boolean));
  return { users, total: count(raw?.total, users.length), limit: Math.max(1, count(raw?.limit, 50)), offset: count(raw?.offset, 0) };
}

/** O usuário é um administrador ativo (papel de administrador e sem suspensão vigente). @param {PublicUser} user */
export const isActiveAdmin = (user) => user.role === "admin" && !user.suspended;

/**
 * O que a tela oferece para um usuário (RN22, RN23, RN24). `lastAdmin` só é afirmado quando se sabe
 * quantos administradores ativos há (`activeAdminCount`); sem o número, a tela não bloqueia e o
 * servidor decide (409 `LAST_ADMIN`).
 * @param {PublicUser} user
 * @param {{ currentUserId: string, activeAdminCount?: number | null }} context
 * @returns {{ self: boolean, lastAdmin: boolean, canSuspend: boolean, canReactivate: boolean, canDelete: boolean, canChangeRole: boolean,
 *   canRemoveAvatar: boolean, suspendReason: string | null, deleteReason: string | null, roleReason: string | null }}
 */
export function permissionsFor(user, { currentUserId, activeAdminCount = null }) {
  const self = user.id === currentUserId;
  const lastAdmin = isActiveAdmin(user) && typeof activeAdminCount === "number" && activeAdminCount <= 1;
  const selfNote = "É a sua conta: ela não pode ser suspensa nem excluída.";
  const lastNote = "É o último administrador ativo: ele não pode ser rebaixado, suspenso nem excluído.";
  const suspendReason = user.suspended ? null : self ? selfNote : lastAdmin ? lastNote : null;
  const deleteReason = self ? selfNote : lastAdmin ? lastNote : null;
  return {
    self,
    lastAdmin,
    canSuspend: !user.suspended && suspendReason === null,
    canReactivate: user.suspended,
    canDelete: deleteReason === null,
    canChangeRole: !lastAdmin,
    // RF36: o administrador remove o avatar de OUTRO usuário (o próprio, ele troca em /admin/perfil).
    canRemoveAvatar: !self && user.avatarImageId !== null,
    suspendReason,
    deleteReason,
    roleReason: lastAdmin ? lastNote : null,
  };
}

/**
 * O número de administradores ativos depois de uma mudança, para a tela manter `activeAdminCount`
 * em dia sem reler a lista inteira (só ela sabe de todos os usuários, e é paginada).
 * @param {number | null | undefined} count
 * @param {PublicUser} before o usuário antes
 * @param {PublicUser | null} after o usuário depois (`null` se foi excluído)
 * @returns {number | null}
 */
export function adjustActiveAdmins(count, before, after) {
  if (typeof count !== "number") return null;
  return Math.max(0, count - (isActiveAdmin(before) ? 1 : 0) + (after && isActiveAdmin(after) ? 1 : 0));
}

/**
 * Os estados de um usuário em texto (a tela mostra ícone E nome, nunca só a cor).
 * @param {PublicUser} user
 * @returns {{ key: "active" | "suspended" | "pending", label: string, detail: string | null }[]}
 */
export function statesOf(user) {
  /** @type {{ key: "active" | "suspended" | "pending", label: string, detail: string | null }[]} */
  const states = [];
  if (user.suspended) {
    const until = user.banExpires && !Number.isNaN(Date.parse(user.banExpires)) ? formatWhen(user.banExpires) : null;
    states.push({ key: "suspended", label: "Suspenso", detail: until ? `até ${until}` : "sem prazo" });
  } else {
    states.push({ key: "active", label: "Ativo", detail: null });
  }
  if (user.mustChangePassword) states.push({ key: "pending", label: "Senha provisória pendente", detail: null });
  return states;
}

const WHEN = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** @param {string} iso */
export function formatWhen(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

/**
 * Forma canônica do handle: aparado e em minúsculas; vazio é `null` (sem espaço público).
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeHandleInput(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "" ? null : value;
}

/**
 * A mensagem do `handle` (já normalizado), ou `null` se vale (RN20).
 * @param {string | null} handle
 * @returns {string | null}
 */
export function handleError(handle) {
  if (handle === null) return null;
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) return `O handle deve ter de ${HANDLE_MIN_LENGTH} a ${HANDLE_MAX_LENGTH} caracteres.`;
  if (!HANDLE_PATTERN.test(handle)) return "O handle deve conter apenas letras minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido.";
  if (RESERVED_HANDLES.includes(handle)) return `O handle "${handle}" é reservado.`;
  return null;
}

/**
 * Mudar o handle muda as URLs do espaço e NÃO há redirecionamento (ADR-024): vale o aviso quando um
 * handle que existe é trocado ou removido. Dar um handle a quem não tinha não quebra endereço algum.
 * @param {string | null} before
 * @param {string | null} after
 * @returns {boolean}
 */
export function handleChangeBreaksUrls(before, after) {
  return before !== null && before !== after;
}

/**
 * Valida o formulário de usuário antes de enviar (o servidor valida de novo, RF21).
 * @param {{ email?: string, name: string, handle: string, role: string }} values
 * @param {"create" | "edit"} mode
 * @returns {{ errors: { email?: string, name?: string, handle?: string, role?: string }, value: { email?: string, name: string, handle: string | null, role: "admin" | "user" } }}
 */
export function validateUserForm(values, mode) {
  /** @type {{ email?: string, name?: string, handle?: string, role?: string }} */
  const errors = {};
  const name = String(values.name ?? "").trim();
  const handle = normalizeHandleInput(values.handle);
  const email = String(values.email ?? "").trim().toLowerCase();
  if (mode === "create") {
    if (email === "") errors.email = "O e-mail é obrigatório.";
    else if (email.length > EMAIL_MAX_LENGTH) errors.email = "O e-mail é longo demais.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Informe um e-mail válido.";
  }
  if (name === "") errors.name = "O nome é obrigatório.";
  else if (name.length > NAME_MAX_LENGTH) errors.name = `O nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`;
  const bad = handleError(handle);
  if (bad) errors.handle = bad;
  if (values.role !== "admin" && values.role !== "user") errors.role = "O papel deve ser Administrador ou Usuário.";
  return { errors, value: { ...(mode === "create" ? { email } : {}), name, handle, role: values.role === "admin" ? "admin" : "user" } };
}

/**
 * Um endereço a partir de um modelo de texto: `{id}` e `{handle}` são trocados (e codificados). Uma
 * página de Servidor do Next.js não passa funções a um Componente Cliente: os endereços vão como texto.
 * @param {string} template por exemplo, `/admin/usuarios/{id}/conteudo` ou `/{handle}`
 * @param {{ id?: string, handle?: string | null }} user
 * @returns {string}
 */
export function expandUserHref(template, user) {
  return template.replaceAll("{id}", encodeURIComponent(user.id ?? "")).replaceAll("{handle}", encodeURIComponent(user.handle ?? ""));
}
