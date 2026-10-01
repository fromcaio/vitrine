// Esquemas de entrada da API (Cap. 5 §5.10; D-11: Zod). Aqui fica a validação de FORMATO, que
// src/lib/db.js não faz: slug (RN03), cor #RRGGBB (RN09) e URL http(s) (RN17). As regras que
// dependem do estado do banco (unicidade, tipo do pai, ciclo) são de db.js e chegam como DataError.
// Módulo puro: não importa db.js nem o Next.js, de modo que a interface também pode reutilizá-lo.
import * as z from "zod";

// --------------------------------------------------------
// Constantes das regras de negócio
// --------------------------------------------------------

/** RN03: letras minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** RN03: tamanho máximo do slug. */
export const SLUG_MAX_LENGTH = 80;
/** RN03 (D-05): slugs reservados no nível raiz, pois colidem com rotas da aplicação. */
export const RESERVED_ROOT_SLUGS = /** @type {const} */ (["admin", "api", "login", "_next"]);
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

// --------------------------------------------------------
// Funções puras
// --------------------------------------------------------

/**
 * RN03: o slug é reservado quando o conteúdo fica no nível raiz.
 * @param {string} slug
 * @param {string | null | undefined} parentId
 */
export function isReservedRootSlug(slug, parentId) {
  return (parentId ?? null) === null && RESERVED_ROOT_SLUGS.includes(/** @type {any} */ (slug));
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

// --------------------------------------------------------
// Esquemas das rotas
// --------------------------------------------------------

/**
 * POST /api/contents. O autor não é aceito na entrada: vem da sessão (RN13). Campos desconhecidos
 * são descartados.
 */
export const contentCreateSchema = z
  .object({
    title: titleSchema,
    slug: slugSchema,
    type: typeSchema,
    parentId: idSchema.nullable().optional(),
    body: z.string().nullable().optional(),
    order: orderSchema.optional(),
    status: statusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (isReservedRootSlug(value.slug, value.parentId)) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: reservedSlugMessage(value.slug) });
    }
  });

/**
 * PATCH /api/contents/:id (atualização parcial). O slug reservado na raiz depende do pai
 * resultante e é conferido pela rota com `isReservedRootSlug`.
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
  })
  .refine(hasAnyField, EMPTY_PATCH);

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

/** PUT /api/configuration: identidade, cores e os seis links sociais; campos ausentes não mudam. */
export const configurationUpdateSchema = z
  .object({
    siteName: z.string().trim().min(1, { error: "O nome do site é obrigatório." }).optional(),
    siteDescription: z.preprocess(emptyToNull, z.string().nullable()).optional(),
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    accentColor: hexColorSchema.optional(),
    logoUrl: assetUrlSchema.optional(),
    faviconUrl: assetUrlSchema.optional(),
    discordUrl: socialUrlSchema.optional(),
    githubUrl: socialUrlSchema.optional(),
    youtubeUrl: socialUrlSchema.optional(),
    instagramUrl: socialUrlSchema.optional(),
    linkedinUrl: socialUrlSchema.optional(),
    twitchUrl: socialUrlSchema.optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH);

/** Credenciais do administrador inicial (RF22), lidas do ambiente por `npm run admin:create`. */
export const adminBootstrapSchema = z.object({
  email: z.preprocess(
    blankToUndefined,
    z
      .string({ error: "Defina ADMIN_EMAIL." })
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "ADMIN_EMAIL não é um e-mail válido." })),
  ),
  password: z.preprocess(
    // A senha não é aparada: espaços podem fazer parte dela.
    (value) => (value === "" ? undefined : value),
    z
      .string({ error: "Defina ADMIN_PASSWORD." })
      .min(PASSWORD_MIN_LENGTH, { error: `ADMIN_PASSWORD deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.` })
      .max(PASSWORD_MAX_LENGTH, { error: `ADMIN_PASSWORD deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.` }),
  ),
  name: z.preprocess(blankToUndefined, z.string().trim().default("Administrador")),
});

// --------------------------------------------------------
// Execução
// --------------------------------------------------------

/** @param {string} slug */
export function reservedSlugMessage(slug) {
  return `O slug "${slug}" é reservado no nível raiz.`;
}

const ptBR = z.locales.ptBR().localeError;

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
