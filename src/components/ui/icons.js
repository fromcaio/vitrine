// Ícones do Vitrine em SVG embutido (sem dependência de biblioteca de ícones). São decorativos:
// ficam ocultos das tecnologias assistivas e acompanham sempre um texto visível. A cor é a do
// texto ao redor (currentColor), de modo que seguem os tokens de tema.

/**
 * @param {{ className?: string, children: import("react").ReactNode }} props
 */
function Icon({ className = "size-5 shrink-0", children }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** @param {{ className?: string }} props */
export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5v.01" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function MenuIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function OverviewIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function DocumentIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function SettingsIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h8" />
      <path d="M16 6h4" />
      <circle cx="14" cy="6" r="2" />
      <path d="M4 12h2" />
      <path d="M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h10" />
      <path d="M18 18h2" />
      <circle cx="16" cy="18" r="2" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function SignOutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 4H5v16h5" />
      <path d="m15 8 4 4-4 4" />
      <path d="M19 12H9" />
    </Icon>
  );
}

// Ícones da barra de ferramentas do editor e do selo de estado de publicação (M09).

/** @param {{ className?: string }} props */
export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function ImageIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13.5 6-3 12" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function CodeBlockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m9.5 10-2.5 2 2.5 2" />
      <path d="m14.5 10 2.5 2-2.5 2" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function QuoteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 8c-2 0-3 1.2-3 3v4h4v-4H6.5" />
      <path d="M17 8c-2 0-3 1.2-3 3v4h4v-4h-1.5" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function ListIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 6h.01" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function ListOrderedIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 6h10" />
      <path d="M10 12h10" />
      <path d="M10 18h10" />
      <path d="m4 6 1.5-1v4" />
      <path d="M4 13.5h3L4 17h3" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function TaskListIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="5" height="5" rx="1" />
      <path d="m4.5 7 1.2 1.2L7.6 6" />
      <path d="M12 7h8" />
      <rect x="3.5" y="14.5" width="5" height="5" rx="1" />
      <path d="M12 17h8" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function TableIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
      <path d="M10 4v16" />
    </Icon>
  );
}

/** Fórmula em linha: a letra sigma. @param {{ className?: string }} props */
export function MathIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 6H7l6 6-6 6h11" />
    </Icon>
  );
}

/** Fórmula em bloco: a letra sigma sobre uma linha própria. @param {{ className?: string }} props */
export function MathBlockIcon(props) {
  return (
    <Icon {...props}>
      <path d="M17 4H8l5 7-5 7h9" />
      <path d="M4 21h16" />
    </Icon>
  );
}

/** Rascunho: lápis. @param {{ className?: string }} props */
export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m13.5 6.5 3 3" />
    </Icon>
  );
}

/** Publicado: marca de verificação. @param {{ className?: string }} props */
export function CheckCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </Icon>
  );
}

/** Nível recolhível da árvore: seta para a direita (gira com `aria-expanded`). @param {{ className?: string }} props */
export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

/** Documento anterior. @param {{ className?: string }} props */
export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

/** Próximo documento. @param {{ className?: string }} props */
export function ArrowRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

// Redes sociais do rodapé (RF24): glifos simples de traço, no mesmo estilo dos demais ícones. São
// decorativos; o link que os contém leva o nome da rede.

/** @param {{ className?: string }} props */
export function DiscordIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.4-4.9A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M9 11.5h.01" />
      <path d="M15 11.5h.01" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function GithubIcon(props) {
  return (
    <Icon {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function YoutubeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function InstagramIcon(props) {
  return (
    <Icon {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z" />
      <path d="M17.5 6.5h.01" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function LinkedinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </Icon>
  );
}

/** @param {{ className?: string }} props */
export function TwitchIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 2H3v16h5v4l4-4h5l4-4z" />
      <path d="M11 11V7" />
      <path d="M16 11V7" />
    </Icon>
  );
}
