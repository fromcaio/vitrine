// Avisos de contraste devolvidos pelos `PUT` de configuração e de aparência (Cap. 5 §5.9.1, RN09,
// RN26, RN27) e as notificações `CONTRAST` que eles geram (ADR-026). A verificação é de
// `contrastWarnings` (src/lib/theme.js, da UI), que confere uma paleta por vez: a clara contra o
// branco e a noturna contra o fundo noturno. O aviso não traz o modo: ele está no prefixo `dark` do
// `field` (`darkPrimaryColor`...).
import { notify, resolveNotification } from "@/lib/db";
import { COLOR_MODES, contrastWarnings } from "@/lib/theme";

/** @typedef {import("@/lib/theme").ColorMode} ColorMode */

/**
 * Onde a paleta mora: a do SITE (administrador: portal, login e painel) ou a APARÊNCIA de um usuário.
 * As chaves de deduplicação diferem para que o administrador, que tem os dois registros, não as
 * misture (`contrast-site:{modo}` e `contrast:{modo}`).
 * @typedef {"site" | "appearance"} ContrastScope
 */

/** Campos das duas paletas do registro gravado (aparência ou configuração). */
const PALETTE_FIELDS = /** @type {const} */ ([
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkSecondaryColor",
  "darkAccentColor",
]);

/** Os campos de cada modo: a unidade de herança (as três cores juntas). */
const PALETTE_BY_MODE = {
  light: { primary: "primaryColor", secondary: "secondaryColor", accent: "accentColor" },
  dark: { primary: "darkPrimaryColor", secondary: "darkSecondaryColor", accent: "darkAccentColor" },
};

/**
 * @param {ContrastScope} scope
 * @param {ColorMode} mode
 */
export function contrastKey(scope, mode) {
  return `${scope === "site" ? "contrast-site" : "contrast"}:${mode}`;
}

/**
 * Avisos de cada modo, calculados sobre o registro GRAVADO (e não sobre o corpo do `PUT`, que é
 * parcial) e só sobre as paletas que o DONO definiu (ADR-038, item 7): a paleta de um modo nula (a
 * aparência que herda o sistema) não gera aviso, porque a herdada é responsabilidade de quem a
 * definiu; o modo sem aviso resolve a notificação dele em `syncContrastNotifications`. `warnings` é a
 * lista única dos dois modos, na ordem clara e noturna.
 * @param {Partial<Record<(typeof PALETTE_FIELDS)[number], string | null>>} record registro gravado
 */
export function contrastReport(record) {
  const palette = Object.fromEntries(PALETTE_FIELDS.map((field) => [field, record[field]]));
  const byMode = COLOR_MODES.map((mode) => {
    const defined = Object.values(PALETTE_BY_MODE[mode]).every((field) => typeof record[field] === "string");
    return /** @type {const} */ ([mode, defined ? contrastWarnings(/** @type {any} */ (palette), mode) : []]);
  });
  return { byMode, warnings: byMode.flatMap(([, warnings]) => warnings) };
}

/**
 * Uma notificação `CONTRAST` por modo com aviso, ao DONO do registro gravado (o usuário, na
 * aparência; o administrador, na configuração do site), reaberta a cada ocorrência pela chave de
 * deduplicação; e a resolução da que existia quando o modo passa a atender (RN26).
 * @param {{ userId: string, scope: ContrastScope, byMode: ReturnType<typeof contrastReport>["byMode"] }} input
 */
export async function syncContrastNotifications({ userId, scope, byMode }) {
  for (const [mode, warnings] of byMode) {
    const dedupeKey = contrastKey(scope, mode);
    if (warnings.length === 0) {
      await resolveNotification(userId, dedupeKey);
      continue;
    }
    await notify({
      userId,
      type: "CONTRAST",
      severity: "WARNING",
      dedupeKey,
      data: {
        mode,
        scope,
        warnings: warnings.map(({ field, ratio, minimum }) => ({ field, ratio, minimum })),
      },
    });
  }
}
