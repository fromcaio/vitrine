// Registros que as páginas de aparência e de configuração entregam aos formulários da UI (RF18, RF31):
// só os campos simples que o formulário usa, nunca o registro inteiro do banco (datas, `ownerId`,
// `persisted`...): o que vai a um Componente Cliente atravessa a rede, e o formulário ignora o resto.
// Pasta privada do App Router: não gera rota.

/** Identidade, os seis links e as duas paletas: o que a aparência do usuário e a do site têm em comum. */
const SHARED_FIELDS = /** @type {const} */ ([
  "siteName",
  "siteDescription",
  "logoUrl",
  "faviconUrl",
  "discordUrl",
  "githubUrl",
  "youtubeUrl",
  "instagramUrl",
  "linkedinUrl",
  "twitchUrl",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkSecondaryColor",
  "darkAccentColor",
]);

/** A configuração do site acrescenta o texto do portal e o diretório (RN28). */
const SITE_ONLY_FIELDS = /** @type {const} */ (["homeBody", "directoryEnabled"]);

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} fields
 */
function pick(record, fields) {
  return Object.fromEntries(fields.map((field) => [field, record[field] ?? null]));
}

/**
 * Valor inicial do `AppearanceForm`: a aparência do usuário, como `GET /api/appearance` a devolve.
 * @param {Record<string, unknown>} record `getAppearance(user.id)`
 */
export const appearanceInitial = (record) => pick(record, SHARED_FIELDS);

/**
 * Valor inicial do `ConfigurationForm`: a configuração do site, como `GET /api/configuration` a devolve.
 * @param {Record<string, unknown>} record `getConfiguration()`
 */
export const configurationInitial = (record) => pick(record, [...SHARED_FIELDS, ...SITE_ONLY_FIELDS]);
