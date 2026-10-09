// Configuração do site para os arquivos de rota (M11, parte do Core): leitura tolerante a falhas,
// variáveis CSS do tema e nome e descrição para os metadados e para o painel. Pasta privada do
// App Router: não gera rota. Sem JSX nem next/font, para poder ser importado por qualquer rota.
import { cache } from "react";
import { getConfiguration } from "@/lib/db";
import { COLOR_MODES, readableTextOn, textColorsOf } from "@/lib/theme";

/** Nome padrão do site (RN08). */
export const DEFAULT_SITE_NAME = "Vitrine";

/** Descrição padrão, derivada da definição do produto (Cap. 5 §5.11, "Layout Raiz"). */
export const DEFAULT_SITE_DESCRIPTION =
  "Plataforma de código aberto para blogs e portfólios acadêmicos, com editor Markdown, fórmulas em LaTeX e estrutura hierárquica de conteúdo.";

/** RN09: cor no formato #RRGGBB. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Configuração vigente, ou `null` quando não deve ou não pode ser lida. Com o `cache` do React, o
 * layout raiz, o `generateMetadata` e o layout do painel compartilham uma única consulta por
 * requisição.
 * - No `next build` não há consulta: o banco pode não existir (o estágio de build da imagem
 *   Docker só define DATABASE_URL; Cap. 5 §5.13). As páginas estáticas saem com os padrões do
 *   globals.css e assumem a configuração do banco na primeira revalidação.
 * - Se a consulta falhar (banco indisponível ou sem as tabelas), o erro é registrado e valem os
 *   padrões: o site nunca cai por causa da configuração.
 * @returns {Promise<import("@/generated/prisma/client").Configuration | null>}
 */
export const getSiteConfiguration = cache(async () => {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    return await getConfiguration();
  } catch (error) {
    console.error("[site] não foi possível ler a configuração; valem os valores padrão:", error);
    return null;
  }
});

/**
 * Cor do banco, se estiver no formato #RRGGBB. A API já valida o formato antes de gravar (RN09),
 * mas o dado lido não é tratado como confiável: ele vai para o atributo style do envoltório do tema.
 * @param {unknown} value
 * @returns {string | null}
 */
function hexColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : null;
}

/** Colunas de cada paleta no registro (configuração do site ou aparência de um usuário). */
const PALETTE_FIELDS = Object.freeze({
  light: { primary: "primaryColor", secondary: "secondaryColor", accent: "accentColor" },
  dark: { primary: "darkPrimaryColor", secondary: "darkSecondaryColor", accent: "darkAccentColor" },
});

/**
 * Variáveis CSS do tema para o atributo `style` do envoltório `.vitrine-tema` (Cap. 5 §5.9, ADR-030,
 * ADR-025): as DUAS paletas, `--vitrine-light-*` e `--vitrine-dark-*` (primária, secundária, destaque e
 * o texto sobre as duas), e as regras do globals.css escolhem o conjunto do modo. Só entram cores
 * válidas (#RRGGBB); as ausentes ficam com os padrões do globals.css, e sem registro o objeto é
 * vazio. O texto sobre a primária e sobre a secundária é calculado POR MODO, com `textColorsOf`
 * (ADR-020), nunca fixo. Serve ao site (portal, login e painel) e, na Parte 3b, à aparência de um
 * usuário (mesmas colunas). Função pura, sem imports do Next.js.
 * @param {Record<string, unknown> | null | undefined} record configuração do site ou aparência
 * @returns {Record<string, string>}
 */
export function buildThemeStyle(record) {
  /** @type {Record<string, string>} */
  const style = {};

  for (const mode of COLOR_MODES) {
    const fields = PALETTE_FIELDS[mode];
    const primary = hexColor(record?.[fields.primary]);
    const secondary = hexColor(record?.[fields.secondary]);
    const accent = hexColor(record?.[fields.accent]);

    if (primary) style[`--vitrine-${mode}-primary`] = primary;
    if (secondary) style[`--vitrine-${mode}-secondary`] = secondary;
    if (accent) style[`--vitrine-${mode}-accent`] = accent;

    if (primary && secondary) {
      const { onPrimary, onSecondary } = textColorsOf({ [fields.primary]: primary, [fields.secondary]: secondary }, mode);
      style[`--vitrine-${mode}-on-primary`] = onPrimary;
      style[`--vitrine-${mode}-on-secondary`] = onSecondary;
    } else {
      if (primary) style[`--vitrine-${mode}-on-primary`] = readableTextOn(primary);
      if (secondary) style[`--vitrine-${mode}-on-secondary`] = readableTextOn(secondary);
    }
  }

  return style;
}

/**
 * Texto de um campo da configuração, sem espaços nas pontas, ou `fallback` se ausente ou vazio.
 * @param {unknown} value
 * @param {string} fallback
 */
function textOr(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? fallback : text;
}

/**
 * Nome do site (RF18), ou "Vitrine" (RN08) sem configuração ou com o nome vazio.
 * @param {{ siteName?: unknown } | null | undefined} configuration
 */
export function siteNameOf(configuration) {
  return textOr(configuration?.siteName, DEFAULT_SITE_NAME);
}

/**
 * Descrição do site (RF18), ou a descrição padrão sem configuração ou com o campo vazio.
 * @param {{ siteDescription?: unknown } | null | undefined} configuration
 */
export function siteDescriptionOf(configuration) {
  return textOr(configuration?.siteDescription, DEFAULT_SITE_DESCRIPTION);
}

/**
 * O endereço público de uma imagem (`GET /media/<id>`; A-029), ou `null` sem imagem. O identificador é opaco e
 * vem do banco: só entra na URL se tiver a forma de um id (letras, dígitos, hífen e sublinhado).
 * @param {unknown} imageId
 * @returns {string | null}
 */
export function mediaUrlOf(imageId) {
  return typeof imageId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(imageId) ? `/media/${imageId}` : null;
}

/**
 * O `icons` dos metadados para o favicon ENVIADO (`/media/<id>`, PNG 64x64; RF35). Sem favicon enviado, vale o
 * `public/favicon.ico` pequeno, que o `icons` do layout raiz declara (a reserva).
 * @param {unknown} imageId
 */
export function faviconMetadata(imageId) {
  const url = mediaUrlOf(imageId);
  return url ? { icons: { icon: [{ url, type: "image/png", sizes: "64x64" }] } } : {};
}

/**
 * Metadados de uma página do site (portal, login): o nome vira o título (`absolute`: ignora o modelo
 * do layout raiz, que faria "Vitrine | Vitrine") e o modelo dos segmentos filhos que definem o
 * próprio título (`Entrar` aparece como "Entrar | nome"), e a descrição vem da configuração (RF18).
 * Sem configuração, valem "Vitrine" (RN08) e a descrição padrão. O favicon enviado do sistema entra em `icons`.
 * @param {{ siteName?: unknown, siteDescription?: unknown, faviconImageId?: unknown } | null | undefined} configuration
 */
export function siteMetadata(configuration) {
  const siteName = siteNameOf(configuration);
  return {
    title: { absolute: siteName, template: `%s | ${siteName}` },
    description: siteDescriptionOf(configuration),
    ...faviconMetadata(configuration?.faviconImageId),
  };
}
