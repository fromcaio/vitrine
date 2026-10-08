// Modelo do rodapé por ícones (RF24, RN17; ADR-035): a lista fechada de dezoito ícones, o teto de 8
// links, a regra de cada URL e o que o rodapé pode renderizar. Funções puras, sem React nem DOM. O
// servidor é a autoridade (RF21): estas regras repetem as da API (`PUT /api/footer-links`) só para
// avisar antes de enviar e, no `Footer`, para NUNCA transformar em `href` um valor que a regra recusa
// (defesa em profundidade: a `url` guardada é só texto).
//
// A lista de identificadores repete `FOOTER_ICONS` de `src/lib/footer-icons.js` (do Dados, módulo puro
// que o Core e a camada de dados importam); um teste compara as duas quando o módulo existe.

/** Ícones do rodapé, na ordem em que o seletor os oferece (ADR-035, item 3). */
export const FOOTER_ICONS = /** @type {const} */ ([
  "github",
  "linkedin",
  "instagram",
  "youtube",
  "x",
  "facebook",
  "bluesky",
  "mastodon",
  "telegram",
  "whatsapp",
  "twitch",
  "discord",
  "lattes",
  "orcid",
  "researchgate",
  "googlescholar",
  "website",
  "email",
]);

/** @typedef {typeof FOOTER_ICONS[number]} FooterIcon */
/** @typedef {{ icon: string, url: string }} FooterLink */

/** No máximo 8 links por dono, um por ícone (RN17). */
export const MAX_FOOTER_LINKS = 8;

/** @type {Record<FooterIcon, string>} o nome acessível de cada ícone (RN17) */
export const FOOTER_ICON_LABELS = Object.freeze({
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  facebook: "Facebook",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  twitch: "Twitch",
  discord: "Discord",
  lattes: "Currículo Lattes",
  orcid: "ORCID",
  researchgate: "ResearchGate",
  googlescholar: "Google Acadêmico",
  website: "Site",
  email: "E-mail",
});

export const EMAIL_ICON = "email";

export const MESSAGES = {
  required: "Informe o endereço.",
  https: "Use um endereço completo que comece com https://.",
  email: "Informe um e-mail válido, como nome@exemplo.com.",
  emailPublic: "O e-mail fica público: qualquer pessoa que abrir o rodapé poderá vê-lo.",
  duplicated: "Este ícone já está em outro link. Cada ícone aparece uma vez.",
  full: `O rodapé aceita no máximo ${MAX_FOOTER_LINKS} links.`,
};

/** @param {unknown} icon @returns {icon is FooterIcon} */
export const isFooterIcon = (icon) => typeof icon === "string" && /** @type {readonly string[]} */ (FOOTER_ICONS).includes(icon);

/**
 * E-mail simples: sem espaços nem `?` e `#` (nada de `mailto:` com parâmetros), uma arroba e um domínio
 * com ponto (o servidor decide o resto).
 */
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"?#]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;

/** @param {string} address */
export const isEmailAddress = (address) => address.length <= 254 && EMAIL_PATTERN.test(address);

/**
 * O que se digita no campo do ícone `email` vira o `mailto:` da API: aceita o endereço puro ou já
 * com o prefixo.
 * @param {string} text
 */
export function emailAddressOf(text) {
  return text.trim().replace(/^mailto:/i, "").trim();
}

/**
 * Confere a URL de um link do rodapé (RN17). `https://` em todos os ícones, exceto o `email`, que só
 * aceita `mailto:` com um e-mail válido. Devolve a mensagem do erro, ou `null` se vale.
 * @param {string} icon
 * @param {string} url a URL como será enviada (para o `email`, já com `mailto:`)
 * @returns {string | null}
 */
export function linkUrlError(icon, url) {
  const text = String(url ?? "").trim();
  if (icon === EMAIL_ICON) {
    if (text === "") return MESSAGES.required;
    if (!/^mailto:/i.test(text)) return MESSAGES.email;
    return isEmailAddress(text.slice("mailto:".length)) ? null : MESSAGES.email;
  }
  if (text === "") return MESSAGES.required;
  if (!/^https:\/\//i.test(text) || /\s/.test(text)) return MESSAGES.https;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && parsed.hostname !== "" ? null : MESSAGES.https;
  } catch {
    return MESSAGES.https;
  }
}

/**
 * A URL que se envia, a partir do que está no campo: no `email`, o `mailto:` + o endereço; nos demais,
 * o texto aparado.
 * @param {string} icon
 * @param {string} fieldValue
 */
export function urlOfField(icon, fieldValue) {
  return icon === EMAIL_ICON ? `mailto:${emailAddressOf(fieldValue)}` : fieldValue.trim();
}

/**
 * O contrário: o que mostrar no campo para uma URL já guardada (o `email` sem o `mailto:`).
 * @param {string} icon
 * @param {string} url
 */
export const fieldOfUrl = (icon, url) => (icon === EMAIL_ICON ? emailAddressOf(url) : url);

/**
 * Os links que o rodapé renderiza: no máximo 8, um por ícone (o primeiro vale), só de ícones da lista
 * e de URLs que passam na regra do ícone. O resto é descartado em silêncio.
 * @param {unknown} links
 * @returns {FooterLink[]}
 */
export function renderableLinks(links) {
  if (!Array.isArray(links)) return [];
  /** @type {FooterLink[]} */
  const out = [];
  const seen = new Set();
  for (const item of links) {
    if (out.length >= MAX_FOOTER_LINKS) break;
    const icon = item?.icon;
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!isFooterIcon(icon) || seen.has(icon) || linkUrlError(icon, url) !== null) continue;
    seen.add(icon);
    out.push({ icon, url });
  }
  return out;
}

/**
 * Confere a lista inteira (o que o editor faz antes de enviar): o teto, um ícone por vez e a URL de
 * cada um. Devolve a mensagem por posição (`rows`) e a geral (`general`).
 * @param {{ icon: string, url: string }[]} links as URLs já como serão enviadas
 * @returns {{ rows: Record<number, string>, general: string }}
 */
export function validateLinks(links) {
  /** @type {Record<number, string>} */
  const rows = {};
  const seen = new Set();
  links.forEach((link, index) => {
    if (!isFooterIcon(link.icon)) rows[index] = MESSAGES.https;
    else if (seen.has(link.icon)) rows[index] = MESSAGES.duplicated;
    else {
      seen.add(link.icon);
      const error = linkUrlError(link.icon, link.url);
      if (error) rows[index] = error;
    }
  });
  return { rows, general: links.length > MAX_FOOTER_LINKS ? MESSAGES.full : "" };
}

/** Os seis campos do registro antigo e o ícone de cada um, na ordem em que o rodapé antigo os mostrava. */
const LEGACY_FIELDS = /** @type {const} */ ([
  ["discordUrl", "discord"],
  ["githubUrl", "github"],
  ["youtubeUrl", "youtube"],
  ["instagramUrl", "instagram"],
  ["linkedinUrl", "linkedin"],
  ["twitchUrl", "twitch"],
]);

/**
 * TRANSIÇÃO (até o Core ligar o rodapé novo, A-029; depois, apague): o registro antigo de aparência ou de
 * configuração, com os seis campos `*Url` (ADR-013), vira a lista de links do rodapé novo. Só passa o que o
 * rodapé aceita (`renderableLinks`): um `http://` antigo, que a RN17 nova recusa, fica de fora. Sem o
 * registro, lista vazia.
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {FooterLink[]}
 */
export function legacyFooterLinks(record) {
  if (!record) return [];
  return renderableLinks(LEGACY_FIELDS.map(([field, icon]) => ({ icon, url: record[field] })));
}
