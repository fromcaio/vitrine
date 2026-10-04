// Esquemas de entrada da API (Cap. 5 §5.10; D-11: Zod). Aqui fica a validação de FORMATO, que
// src/lib/db.js não faz: slug (RN03), cor #RRGGBB (RN09) e URL http(s) (RN17). As regras que
// dependem do estado do banco (unicidade, tipo do pai, ciclo) são de db.js e chegam como DataError.
// Módulo puro: não importa db.js nem o Next.js, de modo que a interface também pode reutilizá-lo.
import * as z from "zod";
// Só o módulo do português do Brasil, e não `z.locales` (todos os idiomas, ~37 kB a mais no pacote do
// navegador); `zod/v4/locales/pt.js` é o português de Portugal e dá mensagens diferentes (R-007).
import ptBRLocale from "zod/v4/locales/pt-BR.js";

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
/** Os seis links sociais do rodapé (RN17, ADR-013). */
export const SOCIAL_URL_FIELDS = /** @type {const} */ ([
  "discordUrl",
  "githubUrl",
  "youtubeUrl",
  "instagramUrl",
  "linkedinUrl",
  "twitchUrl",
]);
/** Limites de senha (os padrões do better-auth, repetidos em src/lib/auth.js). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** RN20: o handle tem de 3 a 30 caracteres [a-z0-9-], sem hífen nas pontas nem repetido. */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = SLUG_PATTERN;
/**
 * RN20: nomes que o handle não pode ter, porque colidem com rotas da aplicação: `admin`, `api`,
 * `login`, `logout` e `_next` (este, por segurança: a classe [a-z0-9-] já o recusa). É a ÚNICA fonte
 * em código: o plugin do better-auth, as rotas e o teste de colisão (tests/core/handles.test.js, que
 * falha quando uma pasta de `public/` ou uma rota estática nova colide) leem daqui.
 */
export const RESERVED_HANDLES = Object.freeze(["admin", "api", "login", "logout", "_next"]);

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

/**
 * RN17: URL absoluta com protocolo http ou https.
 * @param {string} value
 */
export function isHttpUrl(value) {
  // O prefixo é exigido porque `new URL("http:exemplo.com")` seria aceito pelo analisador.
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * D-10: logotipo e favicon são uma URL externa http(s) ou um arquivo de `public/` (caminho que
 * começa com uma única barra); não há envio de arquivos nesta versão.
 * @param {string} value
 */
export function isAssetUrl(value) {
  if (isHttpUrl(value)) return true;
  return /^\/(?![/\\])[^\s\\]*$/.test(value);
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

/** Link social: URL http(s) ou `null` (cadeia vazia vira `null`). */
export const socialUrlSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .refine(isHttpUrl, { error: "Informe uma URL absoluta com protocolo http ou https." })
    .nullable(),
);

/** Logotipo ou favicon: URL http(s), caminho de `public/` ou `null`. */
export const assetUrlSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .refine(isAssetUrl, {
      error: "Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).",
    })
    .nullable(),
);

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

/** Campos de identidade, paletas (clara e noturna, RN09, RN27) e links sociais (RN17), comuns ao site e à aparência. */
const appearanceFields = {
  siteName: z.string().trim().min(1, { error: "O nome do site é obrigatório." }).optional(),
  siteDescription: z.preprocess(emptyToNull, z.string().nullable()).optional(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  darkPrimaryColor: hexColorSchema.optional(),
  darkSecondaryColor: hexColorSchema.optional(),
  darkAccentColor: hexColorSchema.optional(),
  logoUrl: assetUrlSchema.optional(),
  faviconUrl: assetUrlSchema.optional(),
  discordUrl: socialUrlSchema.optional(),
  githubUrl: socialUrlSchema.optional(),
  youtubeUrl: socialUrlSchema.optional(),
  instagramUrl: socialUrlSchema.optional(),
  linkedinUrl: socialUrlSchema.optional(),
  twitchUrl: socialUrlSchema.optional(),
};

/**
 * PUT /api/configuration (só o administrador): a identidade e as paletas do site, o texto do portal
 * (`homeBody`, Markdown) e o diretório de espaços; campos ausentes não mudam. O tamanho do
 * `homeBody` em bytes (RN25) é conferido pela rota.
 */
export const configurationUpdateSchema = z
  .object({
    ...appearanceFields,
    homeBody: z.preprocess(emptyToNull, z.string().nullable()).optional(),
    directoryEnabled: z.boolean({ error: "O diretório deve ser verdadeiro ou falso." }).optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/** PUT /api/appearance (o próprio usuário): a identidade e as paletas do espaço; campos ausentes não mudam. */
export const appearanceUpdateSchema = z.object(appearanceFields).refine(hasAnyField, EMPTY_PATCH);

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
 * @returns {{ ok: true, data: T } | { ok: false, details: ValidationDetail[] }}
 */
export function validate(schema, input) {
  const result = schema.safeParse(input, { error: errorMessage });
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    details: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  };
}
