// Aparência do painel (D-40, ADR-038; Cap. 5 §5.9.2): o painel do ADMINISTRADOR usa só a do sistema (ele
// gerencia o sistema, e mudar a cor do sistema muda o painel dele); o do usuário comum usa a EFETIVA,
// a dele sobre a do sistema (paleta de cada modo, nome, barra superior). O par de ícones do botão de
// modo é só do sistema. O painel é dinâmico, então a mescla é feita a cada requisição. Pasta privada do
// App Router: não gera rota.
import { getEffectiveAppearance } from "@/lib/db";
import { siteNameOf } from "../../_lib/site";

/**
 * @typedef {object} PanelAppearance
 * @property {Record<string, unknown> | null} theme o registro de que `buildThemeStyle` tira as paletas
 *   (`null`: valem as paletas padrão do globals.css)
 * @property {string} siteName
 * @property {boolean} showLogo
 * @property {boolean} showName
 * @property {string | undefined} modeIconPair
 */

/**
 * @param {{ role: "admin" | "user", userId: string, configuration: Record<string, any> | null }} input
 *   `configuration` é a do sistema, como `getSiteConfiguration` a devolve (`null` sem configuração)
 * @returns {Promise<PanelAppearance>}
 */
export async function panelAppearance({ role, userId, configuration }) {
  const modeIconPair = configuration?.modeIconPair ?? undefined;
  const effective = role === "admin" ? null : await getEffectiveAppearance(userId);
  if (!effective) {
    return {
      theme: configuration,
      siteName: siteNameOf(configuration),
      showLogo: configuration?.showLogo ?? true,
      showName: configuration?.showName ?? true,
      modeIconPair,
    };
  }
  return { theme: effective, siteName: effective.siteName, showLogo: effective.showLogo, showName: effective.showName, modeIconPair };
}
