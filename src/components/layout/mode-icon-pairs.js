// Pares de ícones do botão de modo de cor (D-35, ADR-037): o conjunto FECHADO que o administrador
// escolhe para o site inteiro (`modeIconPair` da configuração). Cada par tem o ícone do modo claro e
// o do modo escuro, SVG embutido do projeto. Módulo de apresentação, sem estado.
import {
  ContrastDarkIcon,
  ContrastLightIcon,
  LightbulbOffIcon,
  LightbulbOnIcon,
  MoonIcon,
  MoonOutlineIcon,
  SunIcon,
  SunOutlineIcon,
} from "@/components/ui/icons";
import { DEFAULT_MODE_ICON_PAIR, MODE_ICON_PAIRS, isModeIconPair } from "./mode-icon-names";

export { DEFAULT_MODE_ICON_PAIR, MODE_ICON_PAIRS, isModeIconPair };

/** @typedef {import("./mode-icon-names").ModeIconPair} ModeIconPair */

/**
 * Nome (para o seletor do administrador) e os dois ícones de cada par.
 * @type {Record<ModeIconPair, { label: string, Light: (props: { className?: string }) => import("react").ReactElement, Dark: (props: { className?: string }) => import("react").ReactElement }>}
 */
export const MODE_ICON_PAIR_OPTIONS = {
  sun_moon: { label: "Sol e lua", Light: SunIcon, Dark: MoonIcon },
  sun_moon_outline: { label: "Sol e lua, de contorno", Light: SunOutlineIcon, Dark: MoonOutlineIcon },
  lightbulb: { label: "Lâmpada acesa e apagada", Light: LightbulbOnIcon, Dark: LightbulbOffIcon },
  contrast_half: { label: "Círculo meio cheio", Light: ContrastLightIcon, Dark: ContrastDarkIcon },
};

/**
 * Os ícones do par; um valor desconhecido (ou ausente) cai no padrão.
 * @param {unknown} pair
 */
export function modeIconsOf(pair) {
  return MODE_ICON_PAIR_OPTIONS[isModeIconPair(pair) ? pair : DEFAULT_MODE_ICON_PAIR];
}
