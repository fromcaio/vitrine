// Modelo dos formulários de aparência e de configuração do site (RF18, RF19, RF24, RF31, RN09,
// RN17, RN25, RN27; M18): o que os dois compartilham, em funções puras, sem React nem DOM, para a
// validação e o envio parcial poderem ser testados sem navegador. A validação é a do servidor, que
// continua a autoridade (RF21): estas funções só avisam antes do envio, e os mesmos esquemas e
// predicados de validators.js garantem que a mensagem seja a mesma.
//
// O rascunho (`Draft`) é um objeto de textos, um por campo da API, mais `directoryEnabled` na
// configuração. Textos e links vazios valem como ausentes (RN17): o servidor transforma "" em nulo.

// Primeiro de todos: configura o Zod antes de o validators.js criar os esquemas dele (ADR-022).
import "@/components/editor/zod-config";
import { colorError } from "@/components/ui/ColorField";
import { bodyBytes } from "@/lib/limits";
import { DEFAULT_PALETTES, contrastWarnings, themeStyleOf } from "@/lib/theme";
import { isAssetUrl, isHttpUrl } from "@/lib/validators";

/** @typedef {"appearance" | "configuration"} FormKind aparência do usuário ou configuração do site */
/** @typedef {import("@/lib/theme").ContrastWarning} ContrastWarning */
/** @typedef {import("@/lib/theme").ColorMode} ColorMode */

/** Os seis links sociais (RN17, ADR-013), na ordem do rodapé. */
export const SOCIAL_FIELDS = /** @type {const} */ ([
  { field: "discordUrl", label: "Discord" },
  { field: "githubUrl", label: "GitHub" },
  { field: "youtubeUrl", label: "YouTube" },
  { field: "instagramUrl", label: "Instagram" },
  { field: "linkedinUrl", label: "LinkedIn" },
  { field: "twitchUrl", label: "Twitch" },
]);

/** Logotipo e favicon (D-10, ADR-017): URL http(s) ou caminho de `public/`, sem envio de arquivo. */
export const ASSET_FIELDS = /** @type {const} */ ([
  { field: "logoUrl", label: "Logotipo" },
  { field: "faviconUrl", label: "Ícone da aba (favicon)" },
]);

/** As três cores de cada paleta. */
export const PALETTE_FIELDS = /** @type {const} */ ({
  light: [
    { field: "primaryColor", label: "Primária" },
    { field: "secondaryColor", label: "Secundária" },
    { field: "accentColor", label: "Destaque" },
  ],
  dark: [
    { field: "darkPrimaryColor", label: "Primária" },
    { field: "darkSecondaryColor", label: "Secundária" },
    { field: "darkAccentColor", label: "Destaque" },
  ],
});

/** @typedef {typeof PALETTE_FIELDS.light[number]["field"] | typeof PALETTE_FIELDS.dark[number]["field"]} ColorFieldName */
/** @typedef {typeof SOCIAL_FIELDS[number]["field"]} SocialFieldName */

const COLOR_NAMES = /** @type {ColorFieldName[]} */ ([...PALETTE_FIELDS.light, ...PALETTE_FIELDS.dark].map(({ field }) => field));
const SOCIAL_NAMES = /** @type {SocialFieldName[]} */ (SOCIAL_FIELDS.map(({ field }) => field));
const ASSET_NAMES = /** @type {("logoUrl" | "faviconUrl")[]} */ (ASSET_FIELDS.map(({ field }) => field));

/** Campos de texto do rascunho (os que o servidor trata como texto livre ou URL). */
const TEXT_NAMES = /** @type {const} */ (["siteName", "siteDescription", ...ASSET_NAMES, ...SOCIAL_NAMES, ...COLOR_NAMES]);

/**
 * Registro de aparência ou de configuração, como a API o devolve (`GET` ou `data` do `PUT`): os
 * campos que o formulário usa; os demais (`id`, datas, dono) são ignorados.
 * @typedef {Partial<Record<"siteName" | "siteDescription" | "logoUrl" | "faviconUrl" | SocialFieldName | ColorFieldName, string | null>> & { homeBody?: string | null, directoryEnabled?: boolean }} SiteRecord
 */

/**
 * Rascunho: um texto por campo (vazio = ausente) e, na configuração, o texto do portal e o diretório.
 * @typedef {Record<string, string> & { directoryEnabled?: boolean }} Draft
 */

/**
 * Mensagens por campo e uma mensagem geral.
 * @typedef {{ fields: Record<string, string>, general: string }} Failure
 */

export const MESSAGES = {
  nameRequired: "O nome do site é obrigatório.",
  assetUrl: "Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).",
  httpUrl: "Informe uma URL absoluta com protocolo http ou https.",
  unauthenticated: "Sua sessão expirou. Entre de novo para salvar. As suas alterações continuam nesta tela.",
  forbiddenAppearance: "Você não tem permissão para alterar esta aparência.",
  forbiddenConfiguration: "Só o administrador pode alterar a configuração do site.",
  rateLimited: "Muitas alterações em pouco tempo. Aguarde um instante e tente novamente.",
  rejected: "O servidor não aceitou os dados enviados. Confira os campos e tente de novo.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
  nothingToSave: "Nenhuma alteração para salvar.",
};

/** @param {number} bytes @param {number} max */
export function bodyTooLong(bytes, max) {
  return `O texto do portal tem ${bytes} bytes; o máximo é ${max} (${Math.floor(max / 1024)} KiB).`;
}

/**
 * Valor de um campo na forma em que é comparado e enviado: textos sem espaços nas pontas (o
 * servidor também os apara) e cores em minúsculas.
 * @param {string} field
 * @param {unknown} value
 */
export function normalizeValue(field, value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /** @type {string[]} */ (COLOR_NAMES).includes(field) ? trimmed.toLowerCase() : trimmed;
}

/**
 * Rascunho inicial a partir do registro. Cores ausentes ficam com o padrão da ADR-031.
 * @param {SiteRecord} record
 * @param {FormKind} kind
 * @returns {Draft}
 */
export function draftOf(record, kind) {
  /** @type {Draft} */
  const draft = {};
  for (const field of TEXT_NAMES) {
    const value = record[/** @type {keyof SiteRecord} */ (field)];
    const fallback = /** @type {Record<string, string>} */ ({ ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark })[field] ?? "";
    draft[field] = typeof value === "string" ? value : fallback;
  }
  if (kind === "configuration") {
    draft.homeBody = typeof record.homeBody === "string" ? record.homeBody : "";
    draft.directoryEnabled = record.directoryEnabled !== false;
  }
  return draft;
}

/**
 * Campos do rascunho que diferem da base (o que já está gravado).
 * @param {Draft} draft
 * @param {Draft} base
 * @returns {string[]}
 */
export function changedFields(draft, base) {
  return Object.keys(draft).filter((field) => normalizeValue(field, draft[field]) !== normalizeValue(field, base[field]));
}

/**
 * Corpo do `PUT` (parcial): só o que mudou. Um link ou texto esvaziado vai como "", que o servidor
 * grava como ausente; as cores vão em minúsculas.
 * @param {Draft} draft
 * @param {Draft} base
 * @returns {Record<string, string | boolean>}
 */
export function patchOf(draft, base) {
  /** @type {Record<string, string | boolean>} */
  const patch = {};
  for (const field of changedFields(draft, base)) patch[field] = /** @type {string | boolean} */ (normalizeValue(field, draft[field]));
  return patch;
}

/**
 * Erros do rascunho, por campo, antes de enviar (as regras do servidor; RN09, RN17, D-10, RN25).
 * @param {Draft} draft
 * @param {{ kind: FormKind, maxBodyBytes: number }} options
 * @returns {Record<string, string>}
 */
export function validateDraft(draft, { kind, maxBodyBytes }) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (String(draft.siteName ?? "").trim() === "") errors.siteName = MESSAGES.nameRequired;
  for (const field of ASSET_NAMES) {
    const value = String(draft[field] ?? "").trim();
    if (value !== "" && !isAssetUrl(value)) errors[field] = MESSAGES.assetUrl;
  }
  for (const field of SOCIAL_NAMES) {
    const value = String(draft[field] ?? "").trim();
    if (value !== "" && !isHttpUrl(value)) errors[field] = MESSAGES.httpUrl;
  }
  for (const field of COLOR_NAMES) {
    const message = colorError(String(draft[field] ?? "").trim());
    if (message) errors[field] = message;
  }
  if (kind === "configuration") {
    const bytes = bodyBytes(String(draft.homeBody ?? "").trim());
    if (bytes > maxBodyBytes) errors.homeBody = bodyTooLong(bytes, maxBodyBytes);
  }
  return errors;
}

/**
 * As três cores de um modo, já normalizadas, ou `null` se alguma ainda não é uma cor válida.
 * @param {Draft} draft
 * @param {ColorMode} mode
 * @returns {Record<string, string> | null}
 */
function validColors(draft, mode) {
  /** @type {Record<string, string>} */
  const colors = {};
  for (const { field } of PALETTE_FIELDS[mode]) {
    const value = String(draft[field] ?? "").trim();
    if (colorError(value)) return null;
    colors[field] = value.toLowerCase();
  }
  return colors;
}

/**
 * Avisos de contraste do rascunho por modo (RN09, RN27), calculados no navegador enquanto o autor
 * edita: `contrastWarnings(registro, modo)` sobre as cores já válidas. Um modo com alguma cor ainda
 * incompleta fica sem avisos (o erro de formato já aparece no campo). Não bloqueiam o envio.
 * @param {Draft} draft
 * @returns {Record<ColorMode, ContrastWarning[]>}
 */
export function warningsByMode(draft) {
  const light = validColors(draft, "light");
  const dark = validColors(draft, "dark");
  return {
    light: light ? contrastWarnings(light, "light") : [],
    dark: dark ? contrastWarnings(dark, "dark") : [],
  };
}

/**
 * Agrupa os avisos que o servidor devolveu por modo: o modo está no prefixo `dark` do `field`.
 * @param {ContrastWarning[]} warnings
 * @returns {Record<ColorMode, ContrastWarning[]>}
 */
export function groupWarnings(warnings) {
  return {
    light: warnings.filter((warning) => !warning.field.startsWith("dark")),
    dark: warnings.filter((warning) => warning.field.startsWith("dark")),
  };
}

/**
 * Variáveis do envoltório para a pré-visualização: as cores do rascunho; uma cor ainda inválida
 * cai para a gravada (a pré-visualização nunca quebra com um texto incompleto).
 * @param {Draft} draft
 * @param {Draft} base
 */
export function previewStyle(draft, base) {
  /** @type {Record<string, string>} */
  const palette = {};
  for (const field of COLOR_NAMES) {
    const own = String(draft[field] ?? "").trim();
    palette[field] = colorError(own) ? String(base[field]).trim().toLowerCase() : own.toLowerCase();
  }
  return themeStyleOf(palette);
}

/**
 * Os links preenchidos e válidos, para o rodapé da pré-visualização.
 * @param {Draft} draft
 * @returns {Partial<Record<SocialFieldName, string>>}
 */
export function previewLinks(draft) {
  /** @type {Partial<Record<SocialFieldName, string>>} */
  const links = {};
  for (const field of SOCIAL_NAMES) {
    const value = String(draft[field] ?? "").trim();
    if (value !== "" && isHttpUrl(value)) links[field] = value;
  }
  return links;
}

/**
 * Traduz a resposta de erro da API em mensagens por campo e uma geral (401, 403, 413, 422, 429...).
 * @param {Response} response
 * @param {FormKind} kind
 * @returns {Promise<Failure>}
 */
export async function interpretFailure(response, kind) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const status = response.status;
  if (status === 401) return { fields: {}, general: MESSAGES.unauthenticated };
  if (status === 403) {
    return { fields: {}, general: kind === "configuration" ? MESSAGES.forbiddenConfiguration : MESSAGES.forbiddenAppearance };
  }
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return { fields: {}, general: `${MESSAGES.rateLimited}${wait}` };
  }
  if (status === 413) return { fields: { homeBody: "O texto do portal é grande demais para ser enviado." }, general: "" };
  if (status === 422 || status === 400) {
    /** @type {Record<string, string>} */
    const fields = {};
    /** @type {string[]} */
    const others = [];
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    for (const detail of details) {
      if (body?.error?.code === "QUOTA_EXCEEDED" && detail?.field === "body") {
        fields.homeBody ??= bodyTooLong(Number(detail.bytes), Number(detail.max));
        continue;
      }
      const text = typeof detail?.message === "string" ? detail.message : null;
      if (!text) continue;
      if (typeof detail.field === "string" && (/** @type {string[]} */ (TEXT_NAMES).includes(detail.field) || detail.field === "homeBody")) {
        fields[detail.field] ??= text;
      } else {
        others.push(text);
      }
    }
    if (Object.keys(fields).length === 0 && others.length === 0) {
      const quota = body?.error?.code === "QUOTA_EXCEEDED" && typeof body.error.message === "string" ? body.error.message : null;
      return { fields: {}, general: quota ?? MESSAGES.rejected };
    }
    return { fields, general: others.join(" ") };
  }
  return { fields: {}, general: MESSAGES.server };
}
