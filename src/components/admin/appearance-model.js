// Modelo dos formulários de aparência e de configuração do site (RF18, RF19, RF24, RF31, RN09,
// RN17, RN25, RN27, D-34, D-38, D-40, D-41; M18, A-027): o que os formulários compartilham, em funções
// puras, sem React nem DOM, para a validação e o envio parcial poderem ser testados sem navegador. A
// validação é a do servidor, que continua a autoridade (RF21): estas funções só avisam antes do
// envio, e os mesmos esquemas e predicados de validators.js garantem que a mensagem seja a mesma.
//
// Há três formulários, um `FormKind` cada:
//   - `appearance`: a página do PRÓPRIO usuário (`PUT /api/appearance`). A paleta de cada modo é
//     ANULÁVEL (nulo = herda a do sistema, D-40) e o nome também; o rascunho tem um interruptor por
//     modo (`inheritLight`, `inheritDark`);
//   - `site`: a identidade visual do SISTEMA (`PUT /api/configuration`): nome, descrição, paletas
//     sempre completas, `showLogo`, `showName` e o par de ícones do botão de modo;
//   - `portal`: o texto do portal, o diretório e o título dele (`PUT /api/configuration`).
//
// O rascunho (`Draft`) é um objeto de textos, um por campo da API, mais os interruptores
// (`showLogo`, `showName`, `directoryEnabled`, `inheritLight`, `inheritDark`). Textos e links vazios
// valem como ausentes (RN17): o servidor transforma "" em nulo.

// Primeiro de todos: configura o Zod antes de o validators.js criar os esquemas dele (ADR-022).
import "@/components/editor/zod-config";
import { colorError } from "@/components/ui/ColorField";
import { TOO_COMPLEX_MESSAGE, busyMessage } from "@/components/ui/render-errors";
import { DEFAULT_MODE_ICON_PAIR, isModeIconPair } from "@/components/layout/mode-icon-names";
import { bodyBytes } from "@/lib/limits";
import { DEFAULT_PALETTES, contrastWarnings, themeStyleOf } from "@/lib/theme";
import { isAssetUrl, isHttpUrl } from "@/lib/validators";

/** @typedef {"appearance" | "site" | "portal"} FormKind aparência do usuário, identidade do sistema ou portal */
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

/** O interruptor de herança de cada paleta, só no rascunho da aparência do usuário (D-40). */
export const INHERIT_FLAG = /** @type {const} */ ({ light: "inheritLight", dark: "inheritDark" });

/** O título do diretório do portal (D-38): 1 a 40 caracteres; o padrão é "Espaços". */
export const DIRECTORY_TITLE_MAX = 40;
export const DEFAULT_DIRECTORY_TITLE = "Espaços";

/** @typedef {typeof PALETTE_FIELDS.light[number]["field"] | typeof PALETTE_FIELDS.dark[number]["field"]} ColorFieldName */
/** @typedef {typeof SOCIAL_FIELDS[number]["field"]} SocialFieldName */

const COLOR_NAMES = /** @type {ColorFieldName[]} */ ([...PALETTE_FIELDS.light, ...PALETTE_FIELDS.dark].map(({ field }) => field));
const SOCIAL_NAMES = /** @type {SocialFieldName[]} */ (SOCIAL_FIELDS.map(({ field }) => field));
const ASSET_NAMES = /** @type {("logoUrl" | "faviconUrl")[]} */ (ASSET_FIELDS.map(({ field }) => field));
const MODES = /** @type {const} */ (["light", "dark"]);

/** Campos de texto da identidade (os que o servidor trata como texto livre, URL ou cor). */
const TEXT_NAMES = /** @type {const} */ (["siteName", "siteDescription", ...ASSET_NAMES, ...SOCIAL_NAMES, ...COLOR_NAMES]);

/** Campos a que o servidor pode ligar uma mensagem de erro (`details[].field`). */
const DETAIL_FIELDS = /** @type {string[]} */ ([...TEXT_NAMES, "homeBody", "directoryTitle", "showLogo", "showName", "modeIconPair"]);

/**
 * Registro de aparência ou de configuração, como a API o devolve (`GET` ou `data` do `PUT`): os
 * campos que o formulário usa; os demais (`id`, datas, dono) são ignorados. Na aparência do usuário,
 * `siteName` e as seis cores podem ser nulos (herdam o sistema).
 * @typedef {Partial<Record<"siteName" | "siteDescription" | "logoUrl" | "faviconUrl" | SocialFieldName | ColorFieldName, string | null>> & {
 *   homeBody?: string | null, directoryEnabled?: boolean, directoryTitle?: string | null,
 *   showLogo?: boolean, showName?: boolean, modeIconPair?: string | null }} SiteRecord
 */

/**
 * Rascunho: um texto por campo (vazio = ausente) e os interruptores.
 * @typedef {Record<string, string | boolean>} Draft
 */

/**
 * Mensagens por campo e uma mensagem geral.
 * @typedef {{ fields: Record<string, string>, general: string }} Failure
 */

export const MESSAGES = {
  nameRequired: "O nome do site é obrigatório.",
  assetUrl: "Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).",
  httpUrl: "Informe uma URL absoluta com protocolo http ou https.",
  topbar: "Deixe pelo menos um ligado: o logotipo ou o nome.",
  directoryTitle: `O título do diretório precisa ter de 1 a ${DIRECTORY_TITLE_MAX} caracteres.`,
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
 * A paleta de um modo está herdada no registro? Só quando as TRÊS cores são nulas (D-40: a paleta é
 * completa quando definida). Campo ausente não é nulo: o registro antigo (sem herança) tem cores.
 * @param {SiteRecord} record
 * @param {ColorMode} mode
 */
export function isPaletteInherited(record, mode) {
  return PALETTE_FIELDS[mode].every(({ field }) => record[field] === null);
}

/**
 * Rascunho inicial a partir do registro. Cores ausentes ficam com o padrão da ADR-031; as de uma
 * paleta herdada ficam com as do sistema (`system`), que é o que a tela mostra (e envia, se o autor
 * resolver personalizar a paleta).
 * @param {SiteRecord} record
 * @param {FormKind} kind
 * @param {SiteRecord | null} [system] a configuração do sistema, só para a aparência do usuário
 * @returns {Draft}
 */
export function draftOf(record, kind, system = null) {
  /** @type {Draft} */
  const draft = {};
  if (kind === "portal") {
    draft.homeBody = typeof record.homeBody === "string" ? record.homeBody : "";
    draft.directoryEnabled = record.directoryEnabled !== false;
    draft.directoryTitle =
      typeof record.directoryTitle === "string" && record.directoryTitle.trim() !== "" ? record.directoryTitle : DEFAULT_DIRECTORY_TITLE;
    return draft;
  }
  const reference = /** @type {Record<string, string>} */ ({ ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark });
  for (const field of COLOR_NAMES) {
    const value = system?.[field];
    if (typeof value === "string" && !colorError(value.trim())) reference[field] = value;
  }
  for (const field of TEXT_NAMES) {
    const value = record[/** @type {keyof SiteRecord} */ (field)];
    draft[field] = typeof value === "string" ? value : (reference[field] ?? "");
  }
  draft.showLogo = record.showLogo !== false;
  draft.showName = record.showName !== false;
  if (kind === "site") draft.modeIconPair = isModeIconPair(record.modeIconPair) ? record.modeIconPair : DEFAULT_MODE_ICON_PAIR;
  if (kind === "appearance") for (const mode of MODES) draft[INHERIT_FLAG[mode]] = isPaletteInherited(record, mode);
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
 * grava como ausente; as cores vão em minúsculas. Na aparência do usuário (D-40): o nome esvaziado
 * vai como `null` (herda o do sistema); uma paleta que passa a HERDAR vai como as três cores `null`;
 * uma que passa a ser PRÓPRIA vai com as três cores (a paleta é completa quando definida); uma
 * herdada que continua herdada não vai.
 * @param {Draft} draft
 * @param {Draft} base
 * @returns {Record<string, string | boolean | null>}
 */
export function patchOf(draft, base) {
  const changed = new Set(changedFields(draft, base));
  /** @type {Record<string, string | boolean | null>} */
  const patch = {};
  for (const mode of MODES) {
    const flag = INHERIT_FLAG[mode];
    if (!(flag in draft)) continue;
    const names = PALETTE_FIELDS[mode].map(({ field }) => field);
    for (const field of names) {
      if (draft[flag]) {
        if (!base[flag]) patch[field] = null;
      } else if (base[flag] || changed.has(field)) {
        patch[field] = /** @type {string} */ (normalizeValue(field, draft[field]));
      }
      changed.delete(field);
    }
    changed.delete(flag);
  }
  for (const field of changed) {
    const value = normalizeValue(field, draft[field]);
    patch[field] = field === "siteName" && INHERIT_FLAG.light in draft && value === "" ? null : /** @type {string | boolean} */ (value);
  }
  return patch;
}

/**
 * Erros do rascunho, por campo, antes de enviar (as regras do servidor; RN09, RN17, D-10, D-34, D-38,
 * RN25). A paleta herdada não é verificada (é a do sistema).
 * @param {Draft} draft
 * @param {{ kind: FormKind, maxBodyBytes: number }} options
 * @returns {Record<string, string>}
 */
export function validateDraft(draft, { kind, maxBodyBytes }) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (kind === "portal") {
    const bytes = bodyBytes(String(draft.homeBody ?? "").trim());
    if (bytes > maxBodyBytes) errors.homeBody = bodyTooLong(bytes, maxBodyBytes);
    const title = String(draft.directoryTitle ?? "").trim();
    const length = [...title].length;
    if (length < 1 || length > DIRECTORY_TITLE_MAX) errors.directoryTitle = MESSAGES.directoryTitle;
    return errors;
  }
  if (kind === "site" && String(draft.siteName ?? "").trim() === "") errors.siteName = MESSAGES.nameRequired;
  for (const field of ASSET_NAMES) {
    const value = String(draft[field] ?? "").trim();
    if (value !== "" && !isAssetUrl(value)) errors[field] = MESSAGES.assetUrl;
  }
  for (const field of SOCIAL_NAMES) {
    const value = String(draft[field] ?? "").trim();
    if (value !== "" && !isHttpUrl(value)) errors[field] = MESSAGES.httpUrl;
  }
  for (const mode of MODES) {
    if (draft[INHERIT_FLAG[mode]] === true) continue;
    for (const { field } of PALETTE_FIELDS[mode]) {
      const message = colorError(String(draft[field] ?? "").trim());
      if (message) errors[field] = message;
    }
  }
  if (draft.showLogo === false && draft.showName === false) errors.showName = MESSAGES.topbar;
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
 * incompleta, ou com a paleta herdada do sistema (o contraste dela é do formulário do sistema), fica
 * sem avisos (o erro de formato já aparece no campo). Não bloqueiam o envio.
 * @param {Draft} draft
 * @returns {Record<ColorMode, ContrastWarning[]>}
 */
export function warningsByMode(draft) {
  const light = draft[INHERIT_FLAG.light] === true ? null : validColors(draft, "light");
  const dark = draft[INHERIT_FLAG.dark] === true ? null : validColors(draft, "dark");
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
 * cai para a gravada (a pré-visualização nunca quebra com um texto incompleto). Numa paleta
 * herdada, o rascunho já traz as cores do sistema: a pré-visualização mostra a paleta EFETIVA.
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
 * Passa a paleta de um modo a HERDAR o sistema: liga o interruptor e repõe as três cores com as do
 * sistema (o que a tela mostra e a pré-visualização usa).
 * @param {Draft} draft
 * @param {ColorMode} mode
 * @param {Draft} systemColors as cores do sistema, no formato do rascunho (`draftOf(system, "site")`)
 * @returns {Draft}
 */
export function inheritPalette(draft, mode, systemColors) {
  /** @type {Draft} */
  const next = { ...draft, [INHERIT_FLAG[mode]]: true };
  for (const { field } of PALETTE_FIELDS[mode]) next[field] = String(systemColors[field] ?? DEFAULT_PALETTES[mode][/** @type {keyof typeof DEFAULT_PALETTES.light} */ (field)] ?? "");
  return next;
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
    return { fields: {}, general: kind === "appearance" ? MESSAGES.forbiddenAppearance : MESSAGES.forbiddenConfiguration };
  }
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return { fields: {}, general: `${MESSAGES.rateLimited}${wait}` };
  }
  if (status === 413) {
    return kind === "portal"
      ? { fields: { homeBody: "O texto do portal é grande demais para ser enviado." }, general: "" }
      : { fields: {}, general: MESSAGES.rejected };
  }
  // ADR-033: o texto do portal não renderiza a tempo (junto do campo) ou a fila de validação está cheia.
  if (status === 422 && body?.error?.code === "CONTENT_TOO_COMPLEX") return { fields: { homeBody: TOO_COMPLEX_MESSAGE }, general: "" };
  if (status === 503 && body?.error?.code === "BUSY") return { fields: {}, general: busyMessage(response.headers.get("Retry-After")) };
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
      if (typeof detail.field === "string" && DETAIL_FIELDS.includes(detail.field)) {
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
