// Registros que as páginas de aparência e de configuração entregam aos formulários da UI (RF18, RF31):
// só os campos simples que o formulário usa, nunca o registro inteiro do banco (datas, `ownerId`,
// `persisted`...): o que vai a um Componente Cliente atravessa a rede, e o formulário ignora o resto.
// Pasta privada do App Router: não gera rota.

/**
 * Identidade, barra superior e as duas paletas: o que a aparência do usuário e a do sistema têm em comum.
 * Na aparência do usuário, o nome e as seis cores são `null` quando herdam o sistema (ADR-038).
 */
const SHARED_FIELDS = /** @type {const} */ ([
  "siteName",
  "siteDescription",
  "showLogo",
  "showName",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkSecondaryColor",
  "darkAccentColor",
]);

/** A configuração do sistema acrescenta o par de ícones do botão de modo, o texto do portal e o diretório (RN28). */
const SITE_ONLY_FIELDS = /** @type {const} */ (["modeIconPair", "homeBody", "directoryEnabled", "directoryTitle"]);

/** O que a aparência do usuário mostra do sistema, como referência da herança: o nome e as seis cores. */
const SYSTEM_REFERENCE_FIELDS = /** @type {const} */ ([
  "siteName",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkSecondaryColor",
  "darkAccentColor",
]);

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} fields
 */
function pick(record, fields) {
  return Object.fromEntries(fields.map((field) => [field, record[field] ?? null]));
}

/**
 * Valor inicial do `AppearanceForm`: a aparência do usuário, como `GET /api/appearance` a devolve (a
 * CRUA, com `null` no que herda).
 * @param {Record<string, unknown>} record `getAppearance(user.id)`
 */
export const appearanceInitial = (record) => pick(record, SHARED_FIELDS);

/**
 * Valor inicial do `SiteIdentityForm` e do `PortalSettingsForm`: a configuração do sistema, como
 * `GET /api/configuration` a devolve (cada formulário usa os campos dele).
 * @param {Record<string, unknown>} record `getConfiguration()`
 */
export const configurationInitial = (record) => pick(record, [...SHARED_FIELDS, ...SITE_ONLY_FIELDS]);

/**
 * A prop `system` do `AppearanceForm`: o nome e as seis cores do sistema, só para leitura.
 * @param {Record<string, unknown>} record `getConfiguration()`
 */
export const systemReference = (record) => pick(record, SYSTEM_REFERENCE_FIELDS);

/**
 * A prop `media` dos formulários de aparência (A-029): o logotipo e o favicon como `/media/<id>` (a UI exibe a
 * imagem atual e o envio), ou `null` quando não há imagem própria.
 * @param {Record<string, unknown>} record `getAppearance(user.id)` ou `getConfiguration()`
 */
export function mediaOf(record) {
  const url = (/** @type {unknown} */ id) => (typeof id === "string" && id !== "" ? `/media/${id}` : null);
  return { logoUrl: url(record.logoImageId), faviconUrl: url(record.faviconImageId) };
}

/**
 * A prop `footerLinks` dos formulários: só o ícone e a URL, na ordem (a mesma forma de `GET /api/footer-links`).
 * @param {Array<{ icon: string, url: string }>} links `listFooterLinks(ownerId)`
 */
export const footerLinksOf = (links) => links.map(({ icon, url }) => ({ icon, url }));
