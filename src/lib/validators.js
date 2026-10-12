// Esquemas de entrada da API (Cap. 5 §5.10; D-11: Zod). Aqui fica a validação de FORMATO, que
// src/lib/db.js não faz: slug (RN03), cor #RRGGBB (RN09) e URL http(s) (RN17). As regras que
// dependem do estado do banco (unicidade, tipo do pai, ciclo) são de db.js e chegam como DataError.
// Módulo puro: não importa db.js nem o Next.js, de modo que a interface também pode reutilizá-lo.
import * as z from "zod";
// Só o módulo do português do Brasil, e não `z.locales` (todos os idiomas, ~37 kB a mais no pacote do
// navegador); `zod/v4/locales/pt.js` é o português de Portugal e dá mensagens diferentes (R-007).
import ptBRLocale from "zod/v4/locales/pt-BR.js";
import { FOOTER_ICONS, MAX_FOOTER_LINKS, MODE_ICON_PAIRS } from "./footer-icons.js";

// --------------------------------------------------------
// Constantes das regras de negócio
// --------------------------------------------------------

/** RN03: letras minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** RN03: tamanho máximo do slug. */
export const SLUG_MAX_LENGTH = 80;
/** RN09: cor no formato #RRGGBB. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** RN02: tipos de conteúdo (os mesmos valores de CONTENT_TYPES em db.js). */
export const CONTENT_TYPES = /** @type {const} */ (["DOCUMENT", "COLLECTION"]);
/** RN16: estados de publicação (os mesmos valores de CONTENT_STATUSES em db.js). */
export const CONTENT_STATUSES = /** @type {const} */ (["DRAFT", "PUBLISHED"]);
/** Limites de senha (os padrões do better-auth, repetidos em src/lib/auth.js). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** RN20: o handle tem de 3 a 30 caracteres [a-z0-9-], sem hífen nas pontas nem repetido. */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = SLUG_PATTERN;
/**
 * RN20: nomes que o handle não pode ter, porque colidem com rotas da aplicação: `admin`, `api`,
 * `login`, `logout`, `media` (as imagens, `/media/<id>`; A-029) e `_next` (este, por segurança: a classe [a-z0-9-] já o recusa). É a ÚNICA fonte
 * em código: o plugin do better-auth, as rotas e o teste de colisão (tests/core/handles.test.js, que
 * falha quando uma pasta de `public/` ou uma rota estática nova colide) leem daqui.
 */
export const RESERVED_HANDLES = Object.freeze(["admin", "api", "login", "logout", "media", "_next"]);

// --------------------------------------------------------
// Funções puras
// --------------------------------------------------------

/**
 * Forma canônica do handle: sem espaços nas pontas e em minúsculas (RN20). Texto vazio, `null` e
 * `undefined` viram `null` (usuário sem handle); qualquer outro tipo passa sem alteração para a
 * validação recusá-lo.
 * @param {unknown} value
 */
export function normalizeHandle(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

/**
 * RN20: mensagem de erro do handle (já normalizado), ou `null` se for válido.
 * @param {unknown} value
 * @returns {string | null}
 */
export function handleError(value) {
  if (typeof value !== "string") return "O handle deve ser um texto.";
  if (value.length < HANDLE_MIN_LENGTH || value.length > HANDLE_MAX_LENGTH) {
    return `O handle deve ter de ${HANDLE_MIN_LENGTH} a ${HANDLE_MAX_LENGTH} caracteres.`;
  }
  if (!HANDLE_PATTERN.test(value)) {
    return "O handle deve conter apenas letras minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido.";
  }
  if (RESERVED_HANDLES.includes(/** @type {any} */ (value))) return `O handle "${value}" é reservado.`;
  return null;
}

/** O ícone do rodapé que leva um e-mail (`mailto:`) em vez de um endereço `https://` (RN17, ADR-035). */
export const FOOTER_EMAIL_ICON = "email";

/** Tamanho máximo da URL de um link do rodapé, em caracteres. */
export const FOOTER_URL_MAX_LENGTH = 2048;

/**
 * E-mail simples: sem espaços nem `?` e `#` (nada de `mailto:` com parâmetros), uma arroba e um domínio com
 * ponto. O mesmo padrão da interface (`footer-model.js`): o servidor é quem decide, e a interface só antecipa.
 */
const FOOTER_EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"?#]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;

/**
 * RN17, ADR-035: a URL de um link do rodapé. Todo ícone aceita só `https://` (URL absoluta com host, sem
 * espaço); o `email` aceita só `mailto:` com um endereço válido. `javascript:`, `data:`, `http:`, URL sem
 * esquema e protocolo relativo são recusados. Devolve a mensagem do erro, ou `null` se vale.
 * @param {string} icon
 * @param {string} url a URL como será gravada
 * @returns {string | null}
 */
export function footerUrlError(icon, url) {
  if (url.length > FOOTER_URL_MAX_LENGTH) return `A URL deve ter no máximo ${FOOTER_URL_MAX_LENGTH} caracteres.`;
  if (icon === FOOTER_EMAIL_ICON) {
    if (!/^mailto:/i.test(url)) return "O e-mail deve ser um endereço mailto: válido.";
    const address = url.slice("mailto:".length);
    return address.length <= 254 && FOOTER_EMAIL_PATTERN.test(address) ? null : "Informe um endereço de e-mail válido.";
  }
  const message = "Informe uma URL absoluta com protocolo https.";
  // O prefixo é exigido porque `new URL("https:exemplo.com")` seria aceito pelo analisador.
  if (!/^https:\/\//i.test(url) || /\s/.test(url)) return message;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname !== "" ? null : message;
  } catch {
    return message;
  }
}

/**
 * Destino do redirecionamento após o login (UC08): só caminhos internos, para que um link
 * forjado não leve o administrador a outro site.
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeRedirectPath(value, fallback = "/admin") {
  if (typeof value !== "string") return fallback;
  // Uma única barra inicial ("//host" e "/\host" são interpretados como outro site).
  if (!/^\/(?![/\\])/.test(value) || /[\\\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

/**
 * Sugere um slug livre a partir de um slug em conflito (UC05, fluxo A1): acrescenta -2, -3...
 * respeitando o tamanho máximo.
 * @param {string} slug slug válido que já está em uso
 * @param {Iterable<string>} takenSlugs slugs dos irmãos
 * @returns {string | null} `null` se não houver sugestão
 */
export function suggestSlug(slug, takenSlugs) {
  const taken = new Set(takenSlugs);
  for (let n = 2; n <= 999; n++) {
    const suffix = `-${n}`;
    const base = slug.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "");
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate) && SLUG_PATTERN.test(candidate)) return candidate;
  }
  return null;
}

// --------------------------------------------------------
// Esquemas de campo
// --------------------------------------------------------

/** Cadeia vazia (ou só com espaços) equivale a ausente (RN17). */
const emptyToNull = (/** @type {unknown} */ value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** Variável de ambiente vazia equivale a não definida. */
const blankToUndefined = (/** @type {unknown} */ value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const slugSchema = z
  .string()
  .min(1, { error: "O slug é obrigatório." })
  .max(SLUG_MAX_LENGTH, { error: `O slug deve ter no máximo ${SLUG_MAX_LENGTH} caracteres.` })
  .regex(SLUG_PATTERN, { error: "O slug deve conter apenas letras minúsculas, dígitos e hífens." });

/** Handle (RN20): normalizado, 3 a 30 caracteres [a-z0-9-] e fora dos nomes reservados. */
export const handleSchema = z.preprocess(
  normalizeHandle,
  z.string({ error: "O handle é obrigatório." }).superRefine((value, ctx) => {
    const message = handleError(value);
    if (message) ctx.addIssue({ code: "custom", message });
  }),
);

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, { error: "A cor deve estar no formato #RRGGBB." });

const titleSchema = z.string().trim().min(1, { error: "O título é obrigatório." });
const idSchema = z.string().min(1, { error: "Identificador inválido." });
const orderSchema = z
  .number()
  .int({ error: "A ordem deve ser um número inteiro." })
  .min(0, { error: "A ordem deve ser um inteiro não negativo." });
const typeSchema = z.enum(CONTENT_TYPES, { error: "O tipo deve ser DOCUMENT ou COLLECTION." });
const statusSchema = z.enum(CONTENT_STATUSES, { error: "O estado deve ser DRAFT ou PUBLISHED." });

/** Recusa objeto sem nenhum campo conhecido (os campos desconhecidos já foram descartados). */
const hasAnyField = (/** @type {Record<string, unknown>} */ value) => Object.keys(value).length > 0;
const EMPTY_PATCH = { error: "Informe ao menos um campo para atualizar." };

/** RN19, RN22: motivo de uma ação do administrador sobre outro usuário (1 a 500 caracteres). */
export const REASON_MAX_LENGTH = 500;

/** Motivo obrigatório das ações do administrador sobre outro usuário (RN19, RN26). */
export const reasonSchema = z
  .string({ error: "Informe o motivo." })
  .trim()
  .min(1, { error: "Informe o motivo." })
  .max(REASON_MAX_LENGTH, { error: `O motivo deve ter no máximo ${REASON_MAX_LENGTH} caracteres.` });

// --------------------------------------------------------
// Esquemas das rotas
// --------------------------------------------------------

/** DELETE /api/users/:id/avatar (parâmetros de consulta): o motivo da moderação é obrigatório (RF36, RN19, RN26). */
export const avatarRemovalQuerySchema = z.object({ reason: reasonSchema });

/**
 * POST /api/contents. O autor não é aceito na entrada: vem da sessão (RN13). Campos desconhecidos
 * são descartados. O slug da raiz não tem nomes reservados: ele fica sob `/{handle}` (RN03), e os
 * nomes reservados valem para o handle (RN20).
 */
export const contentCreateSchema = z.object({
  title: titleSchema,
  slug: slugSchema,
  type: typeSchema,
  parentId: idSchema.nullable().optional(),
  body: z.string().nullable().optional(),
  order: orderSchema.optional(),
  status: statusSchema.optional(),
});

/**
 * RN18: a versão em que o autor se baseou, o `updatedAt` do conteúdo que ele abriu (ISO 8601, como
 * a API o devolve).
 */
export const versionSchema = z
  .string({ error: "Informe a versão em que o texto se baseou (campo version)." })
  .refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)), {
    error: "A versão deve ser a data ISO 8601 (updatedAt) do conteúdo que foi aberto.",
  });

/**
 * PATCH /api/contents/:id (atualização parcial). `version` não é um campo do conteúdo: é a versão
 * em que o autor se baseou (RN18), e o `PATCH` que altera o corpo a exige (422 sem ela, conferido
 * pela rota). `reason` tampouco é um campo do conteúdo: é o motivo da moderação (RN19, RN26), que a
 * rota exige quando o conteúdo é de outro dono e ignora quando é do próprio autor. Ao menos um campo
 * do conteúdo é obrigatório.
 */
export const contentUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    slug: slugSchema.optional(),
    type: typeSchema.optional(),
    parentId: idSchema.nullable().optional(),
    body: z.string().nullable().optional(),
    order: orderSchema.optional(),
    status: statusSchema.optional(),
    version: versionSchema.optional(),
    reason: reasonSchema.optional(),
  })
  .refine(({ version: _version, reason: _reason, ...fields }) => hasAnyField(fields), EMPTY_PATCH);

/** DELETE /api/contents/:id (parâmetros de consulta): `reason` é o motivo da moderação (RN19, RN26). */
export const contentDeleteQuerySchema = z.object({ reason: reasonSchema.optional() });

/**
 * GET /api/notifications (parâmetros de consulta, RF33): `unread=1` traz só as não lidas; `limit` de 1
 * a 100 (padrão 20); `cursor` é o `nextCursor` da página anterior.
 */
export const notificationListQuerySchema = z.object({
  unread: z
    .enum(["1", "0"], { error: "unread deve ser 1 ou 0." })
    .optional()
    .transform((value) => value === "1"),
  limit: z.coerce.number({ error: "limit deve ser um número." }).int().min(1).max(100).default(20),
  cursor: z.string().min(1, { error: "Cursor inválido." }).optional(),
});

/**
 * PATCH /api/notifications/:id: exatamente uma ação, `{ "read": true }` (marca como lida) ou
 * `{ "dismissed": true }` (dispensa). Não há como marcar como não lida.
 */
export const notificationUpdateSchema = z
  .object({
    read: z.literal(true, { error: "read só aceita true." }).optional(),
    dismissed: z.literal(true, { error: "dismissed só aceita true." }).optional(),
  })
  .refine((value) => Object.keys(value).length === 1, { error: "Informe read ou dismissed (apenas um)." });

/** PATCH /api/contents/reorder: lote `[{ id, parentId?, order }]`; `parentId` omitido mantém o pai. */
export const contentReorderSchema = z
  .array(
    z.object({
      id: idSchema,
      parentId: idSchema.nullable().optional(),
      order: orderSchema,
    }),
    { error: "O lote deve ser uma lista de itens { id, parentId, order }." },
  )
  .min(1, { error: "O lote não pode ser vazio." });

/** Campos que o site e a aparência têm em comum: a descrição e a barra superior (D-34). */
const sharedFields = {
  siteDescription: z.preprocess(emptyToNull, z.string().nullable()).optional(),
  showLogo: z.boolean({ error: "showLogo deve ser verdadeiro ou falso." }).optional(),
  showName: z.boolean({ error: "showName deve ser verdadeiro ou falso." }).optional(),
};

/** As seis cores (paletas clara e noturna, RN09, RN27). */
const COLOR_KEYS = /** @type {const} */ ([
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkSecondaryColor",
  "darkAccentColor",
]);

/** Tamanho máximo do título do diretório (D-38); o mesmo de `DIRECTORY_TITLE_MAX_LENGTH`, de db.js. */
const DIRECTORY_TITLE_MAX = 40;

/** Título do diretório do portal (D-38): texto simples de 1 a 40 caracteres (pontos de código, como em db.js). */
const directoryTitleSchema = z
  .string({ error: "O título do diretório deve ser um texto." })
  .trim()
  .refine((value) => [...value].length >= 1 && [...value].length <= DIRECTORY_TITLE_MAX, {
    error: `O título do diretório deve ter de 1 a ${DIRECTORY_TITLE_MAX} caracteres.`,
  });

/**
 * PUT /api/configuration (só o administrador): a identidade e as paletas do site (obrigatórias quando
 * enviadas: o site é a base da herança, ADR-038), a barra superior, o par de ícones do botão de modo
 * (RN32), o texto do portal (`homeBody`, Markdown), o diretório de espaços e o título dele; campos
 * ausentes não mudam. O tamanho do `homeBody` em bytes (RN25) é conferido pela rota; a regra "ao menos
 * um entre `showLogo` e `showName`", por db.js.
 */
export const configurationUpdateSchema = z
  .object({
    ...sharedFields,
    siteName: z.string().trim().min(1, { error: "O nome do site é obrigatório." }).optional(),
    ...Object.fromEntries(COLOR_KEYS.map((key) => [key, hexColorSchema.optional()])),
    modeIconPair: z
      .enum(MODE_ICON_PAIRS, { error: `O par de ícones deve ser um de: ${MODE_ICON_PAIRS.join(", ")}.` })
      .optional(),
    directoryTitle: directoryTitleSchema.optional(),
    homeBody: z.preprocess(emptyToNull, z.string().nullable()).optional(),
    homeStatus: statusSchema.optional(),
    directoryEnabled: z.boolean({ error: "O diretório deve ser verdadeiro ou falso." }).optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/**
 * PUT /api/home (o dono; RF42, RN35, ADR-040): a página inicial do PRÓPRIO espaço. Parcial (ao menos um
 * campo), sem `version` (o último envio vale: só o dono escreve) e sem campos desconhecidos (422). O tamanho
 * do `homeBody` em bytes (RN25) e o orçamento de renderização (ADR-033) são conferidos pela rota; texto
 * vazio ou só de espaços vira `null`.
 */
export const homeUpdateSchema = z
  .strictObject({
    homeBody: z.preprocess(emptyToNull, z.string({ error: "O texto deve ser um texto." }).nullable()).optional(),
    homeStatus: statusSchema.optional(),
    homeShowItems: z.boolean({ error: "A lista de itens deve ser verdadeiro ou falso." }).optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/**
 * PATCH /api/users/:id/home (o administrador despublica a página inicial de outro usuário; RF43, RN37): só
 * `status: "DRAFT"` e o `reason` obrigatório. Publicar é do dono; qualquer outro campo é recusado.
 */
export const homeModerationSchema = z.strictObject({
  status: z.literal("DRAFT", { error: "A moderação só despublica: o estado deve ser DRAFT." }),
  reason: reasonSchema,
});

/** DELETE /api/users/:id/home (parâmetros de consulta): o motivo da exclusão é obrigatório (RF43, RN37). */
export const homeRemovalQuerySchema = z.object({ reason: reasonSchema });

/**
 * PUT /api/appearance (o próprio usuário): a identidade, a barra superior e as paletas do espaço; campos
 * ausentes não mudam. O nome e as seis cores aceitam `null` (herdam o sistema, ADR-038). Que a paleta de
 * um modo tenha as três cores ou nenhuma, e que `showLogo` e `showName` não fiquem ambos falsos, é
 * conferido por db.js sobre o estado resultante (422 com `field` igual a `lightPalette`, `darkPalette` ou
 * `showName`).
 */
export const appearanceUpdateSchema = z
  .object({
    ...sharedFields,
    siteName: z
      .preprocess(emptyToNull, z.string().trim().min(1, { error: "O nome do site é obrigatório." }).nullable())
      .optional(),
    ...Object.fromEntries(COLOR_KEYS.map((key) => [key, hexColorSchema.nullable().optional()])),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/**
 * PUT /api/footer-links e /api/configuration/footer-links (A-029; RF24, RN17, ADR-035): o rodapé INTEIRO, na
 * ordem do vetor, de 0 a 8 links; o ícone vem da lista fechada e não se repete; a URL é `https://` ou, no ícone
 * `email`, `mailto:` com um endereço válido. Um item inválido recusa o lote, com um `details` por item
 * (`field` como `links[2].url`; use `parse` com `{ bracketIndexes: true }`). A URL é aparada.
 */
export const footerLinksSchema = z.object({
  links: z
    .array(
      z.object({
        // A lista fechada e a URL são conferidas abaixo, juntas, para que UMA resposta aponte todos os itens inválidos.
        icon: z.string({ error: "Escolha um ícone da lista." }),
        url: z.string({ error: "Informe a URL." }).trim(),
      }),
      { error: "links deve ser uma lista de { icon, url }." },
    )
    .max(MAX_FOOTER_LINKS, { error: `O rodapé aceita no máximo ${MAX_FOOTER_LINKS} links.` }),
}).superRefine(({ links }, ctx) => {
  /** @type {Set<string>} */
  const seen = new Set();
  links.forEach((link, index) => {
    const known = /** @type {readonly string[]} */ (FOOTER_ICONS).includes(link.icon);
    if (!known) ctx.addIssue({ code: "custom", path: ["links", index, "icon"], message: "Escolha um ícone da lista." });
    else if (seen.has(link.icon)) ctx.addIssue({ code: "custom", path: ["links", index, "icon"], message: "Cada ícone pode aparecer uma só vez." });
    seen.add(link.icon);
    const message = link.url === "" ? "Informe a URL." : known ? footerUrlError(link.icon, link.url) : null;
    if (message) ctx.addIssue({ code: "custom", path: ["links", index, "url"], message });
  });
});

// --------------------------------------------------------
// Usuários e senhas (RN19 a RN24; ADR-029)
// --------------------------------------------------------

/** Papéis aceitos nas rotas de usuários. */
export const USER_ROLE_VALUES = /** @type {const} */ (["admin", "user"]);
/** Tamanho da senha provisória gerada pelo servidor (RN21). */
export const TEMPORARY_PASSWORD_LENGTH = 16;
/** Limite do nome de exibição de um usuário (campos do pacote não têm limite próprio). */
export const NAME_MAX_LENGTH = 100;

const roleSchema = z.enum(USER_ROLE_VALUES, { error: "O papel deve ser admin ou user." });
const userNameSchema = z
  .string({ error: "O nome é obrigatório." })
  .trim()
  .min(1, { error: "O nome é obrigatório." })
  .max(NAME_MAX_LENGTH, { error: `O nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.` });
const passwordFieldSchema = z
  .string({ error: "A senha é obrigatória." })
  .min(PASSWORD_MIN_LENGTH, { error: `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.` })
  .max(PASSWORD_MAX_LENGTH, { error: `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.` });

/**
 * POST /api/users: e-mail, nome, handle e papel; senha opcional (o servidor gera a provisória de 16
 * caracteres, RN21). Nenhum outro campo é aceito (`banned`, `mustChangePassword` e afins são
 * descartados): quem define o estado da conta é o servidor.
 */
export const userCreateSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.string({ error: "O e-mail é obrigatório." }).max(254, { error: "O e-mail é longo demais." }).pipe(z.email({ error: "Informe um e-mail válido." })),
  ),
  name: userNameSchema,
  handle: handleSchema.nullable().optional(),
  role: roleSchema.default("user"),
  password: passwordFieldSchema.optional(),
});

/** PATCH /api/users/:id (administrador): nome, handle e papel; ao menos um. */
export const userUpdateSchema = z
  .object({
    name: userNameSchema.optional(),
    handle: handleSchema.nullable().optional(),
    role: roleSchema.optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/** PATCH /api/users/me: o usuário edita só o próprio nome. */
export const profileUpdateSchema = z.object({ name: userNameSchema });

/** POST /api/users/me/password: a senha atual e a nova, que não pode ser igual à atual (RN21). */
export const passwordChangeSchema = z
  .object({
    current: z.string({ error: "Informe a senha atual." }).min(1, { error: "Informe a senha atual." }).max(PASSWORD_MAX_LENGTH),
    next: passwordFieldSchema,
  })
  .superRefine((value, ctx) => {
    if (value.next === value.current) {
      ctx.addIssue({ code: "custom", path: ["next"], message: "A nova senha deve ser diferente da atual." });
    }
  });

/** PUT /api/users/:id/password (administrador): senha opcional; sem ela, o servidor gera a provisória. */
export const passwordResetSchema = z.object({ password: passwordFieldSchema.optional() });

/**
 * POST /api/users/:id/ban: suspende a conta (RN23). O motivo é obrigatório e o prazo (`expiresAt`,
 * ISO 8601, no futuro), opcional; sem prazo, a suspensão dura até o administrador reativar.
 */
export const banSchema = z.object({
  reason: reasonSchema,
  expiresAt: z
    .string()
    .nullable()
    .optional()
    .superRefine((value, ctx) => {
      if (value === null || value === undefined) return;
      const time = Date.parse(value);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(time)) {
        ctx.addIssue({ code: "custom", message: "O prazo deve ser uma data ISO 8601." });
      } else if (time <= Date.now()) {
        ctx.addIssue({ code: "custom", message: "O prazo da suspensão deve estar no futuro." });
      }
    }),
});

/**
 * DELETE /api/users/:id (parâmetros de consulta): o destino do conteúdo do usuário (RN24):
 * `content=transfer&to=<id>[&onConflict=rename]` ou `content=delete`. Sem o conteúdo, o `content`
 * é dispensado.
 */
export const userDeleteQuerySchema = z
  .object({
    content: z.enum(["transfer", "delete"], { error: "O conteúdo deve ser transfer ou delete." }).optional(),
    to: idSchema.optional(),
    onConflict: z.enum(["fail", "rename"], { error: "onConflict deve ser fail ou rename." }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.content === "transfer" && value.to === undefined) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Informe o usuário de destino (to)." });
    }
    if (value.content !== "transfer" && (value.to !== undefined || value.onConflict !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "to e onConflict só valem com content=transfer." });
    }
  });

/** GET /api/users (parâmetros de consulta): paginação e busca por e-mail ou nome. */
export const userListQuerySchema = z.object({
  limit: z.coerce.number({ error: "limit deve ser um número." }).int().min(1).max(100).default(50),
  offset: z.coerce.number({ error: "offset deve ser um número." }).int().min(0).default(0),
  search: z.string().trim().max(100).optional(),
});

/** E-mail das variáveis de ambiente dos comandos: aparado, em minúsculas e válido. */
const commandEmail = z.preprocess(
  blankToUndefined,
  z
    .string({ error: "Defina ADMIN_EMAIL." })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "ADMIN_EMAIL não é um e-mail válido." })),
);

/** Senha das variáveis de ambiente dos comandos; não é aparada: espaços podem fazer parte dela. */
const commandPassword = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string({ error: "Defina ADMIN_PASSWORD." })
    .min(PASSWORD_MIN_LENGTH, { error: `ADMIN_PASSWORD deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.` })
    .max(PASSWORD_MAX_LENGTH, { error: `ADMIN_PASSWORD deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.` }),
);

/**
 * Credenciais do administrador inicial (RF22), lidas do ambiente por `npm run admin:create`:
 * `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` e `ADMIN_HANDLE` (os dois últimos opcionais).
 */
export const adminBootstrapSchema = z.object({
  email: commandEmail,
  password: commandPassword,
  name: z.preprocess(blankToUndefined, z.string().trim().default("Administrador")),
  handle: z.preprocess(blankToUndefined, handleSchema.optional()),
});

/**
 * Conta e nova senha do `npm run admin:reset-password` (ADR-029, item 8), lidas das mesmas
 * variáveis `ADMIN_EMAIL` (e-mail da conta, de qualquer papel) e `ADMIN_PASSWORD` (a nova senha).
 */
export const passwordResetCommandSchema = z.object({
  email: commandEmail,
  password: commandPassword,
});

// --------------------------------------------------------
// Execução
// --------------------------------------------------------

const ptBR = ptBRLocale().localeError;

/**
 * Mensagens em português para os erros sem texto próprio no esquema.
 * @param {any} issue
 */
function errorMessage(issue) {
  if (issue.code === "invalid_type" && issue.input === undefined) return "Campo obrigatório.";
  return ptBR(issue);
}

/**
 * Item de `details` do formato de erro padrão (Cap. 5 §5.10).
 * @typedef {{ field: string, message: string }} ValidationDetail
 */

/**
 * Valida `input` contra `schema`, sem lançar exceção.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} input
 * @param {{ bracketIndexes?: boolean }} [options] `bracketIndexes`: o campo de um item de lista sai como
 *   `links[2].url`, em vez de `links.2.url` (o rodapé; Cap. 5 §5.10)
 * @returns {{ ok: true, data: T } | { ok: false, details: ValidationDetail[] }}
 */
export function validate(schema, input, { bracketIndexes = false } = {}) {
  const result = schema.safeParse(input, { error: errorMessage });
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    details: result.error.issues.map((issue) => ({
      field: bracketIndexes
        ? issue.path.reduce((text, part) => (typeof part === "number" ? `${text}[${part}]` : text === "" ? String(part) : `${text}.${String(part)}`), "")
        : issue.path.join("."),
      message: issue.message,
    })),
  };
}
