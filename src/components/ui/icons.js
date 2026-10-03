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
