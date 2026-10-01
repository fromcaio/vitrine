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
