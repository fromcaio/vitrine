// Ícones das redes sociais do rodapé (RF24, RN17; ADR-013): só as redes com link preenchido, na
// ordem fixa abaixo, e todos com `rel="noopener noreferrer"`. Campo vazio, ausente ou que não seja
// uma URL absoluta http(s) equivale a link ausente (defesa em profundidade: o Core valida o
// protocolo na gravação). O ícone é decorativo e o link leva o nome da rede.
import {
  DiscordIcon,
  GithubIcon,
  InstagramIcon,
  LinkedinIcon,
  TwitchIcon,
  YoutubeIcon,
} from "@/components/ui/icons";

/**
 * Os seis links do registro de aparência (os nomes dos campos são os do banco).
 * @typedef {Partial<Record<"discordUrl" | "githubUrl" | "youtubeUrl" | "instagramUrl" | "linkedinUrl" | "twitchUrl", string | null | undefined>>} SocialLinksValue
 */

/** @type {{ field: keyof SocialLinksValue, label: string, Icon: (props: { className?: string }) => import("react").ReactElement }[]} */
const NETWORKS = [
  { field: "discordUrl", label: "Discord", Icon: DiscordIcon },
  { field: "githubUrl", label: "GitHub", Icon: GithubIcon },
  { field: "youtubeUrl", label: "YouTube", Icon: YoutubeIcon },
  { field: "instagramUrl", label: "Instagram", Icon: InstagramIcon },
  { field: "linkedinUrl", label: "LinkedIn", Icon: LinkedinIcon },
  { field: "twitchUrl", label: "Twitch", Icon: TwitchIcon },
];

/** @param {unknown} value */
const isWebUrl = (value) => typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());

/**
 * @param {object} props
 * @param {SocialLinksValue | null} [props.links] o registro de aparência (ou só os seis campos)
 */
export function SocialLinks({ links }) {
  const present = NETWORKS.filter(({ field }) => isWebUrl(links?.[field]));
  if (present.length === 0) return null;
  return (
    <nav aria-label="Redes sociais">
      <ul className="flex flex-wrap gap-2">
        {present.map(({ field, label, Icon }) => (
          <li key={field}>
            <a
              href={/** @type {string} */ (links?.[field]).trim()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} (abre em uma nova aba)`}
              className="inline-flex size-10 items-center justify-center rounded-md border border-border-strong hover:bg-border"
            >
              <Icon className="size-5" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
