// Configuração do site para os arquivos de rota (M11, parte do Core): leitura tolerante a falhas,
// variáveis CSS do tema e nome e descrição para os metadados e para o painel. Pasta privada do
// App Router: não gera rota. Sem JSX nem next/font, para poder ser importado por qualquer rota.
import { cache } from "react";
import { getConfiguration } from "@/lib/db";
import { readableTextOn } from "@/lib/theme";

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
 * mas o dado lido não é tratado como confiável: ele vai para o atributo style de <html>.
 * @param {unknown} value
 * @returns {string | null}
 */
function hexColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : null;
}

/**
 * Variáveis CSS do tema para o atributo `style` de `<html>` (Cap. 5 §5.9, "Injeção"). Só entram
 * cores válidas; as ausentes ficam com os padrões do globals.css, e sem configuração o objeto é
 * vazio. O texto sobre a primária acompanha a primária e é sempre calculado por `readableTextOn`
 * (ADR-020), nunca fixo. `--vitrine-on-secondary` não é definida: é branco fixo.
 * Função pura, sem imports do Next.js.
 * @param {{ primaryColor?: unknown, secondaryColor?: unknown, accentColor?: unknown } | null | undefined} configuration
 * @returns {Record<string, string>}
 */
export function buildThemeStyle(configuration) {
  /** @type {Record<string, string>} */
  const style = {};

  const primary = hexColor(configuration?.primaryColor);
  if (primary) {
    style["--vitrine-primary"] = primary;
    style["--vitrine-on-primary"] = readableTextOn(primary);
  }
  const secondary = hexColor(configuration?.secondaryColor);
  if (secondary) style["--vitrine-secondary"] = secondary;
  const accent = hexColor(configuration?.accentColor);
  if (accent) style["--vitrine-accent"] = accent;

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
