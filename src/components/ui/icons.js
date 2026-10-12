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

/** Página inicial (casa). @param {{ className?: string }} props */
export function HomeIcon(props) {
  return (
    <Icon {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

/** Abrir em outra aba (seta para fora de um quadro). @param {{ className?: string }} props */
export function ExternalLinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
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

// Glifos neutros do rodapé (RF24, RN17; ADR-035): os ícones que não são uma marca do Simple Icons (o
// site e o e-mail) ou que o pacote não tem (`lattes`, `linkedin`). São desenhos próprios do projeto, de
// traço, no mesmo estilo dos demais; não imitam nenhuma marca. Decorativos: o link leva o nome.

/** Site (globo). @param {{ className?: string }} props */
export function GlobeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </Icon>
  );
}

/** E-mail (envelope). @param {{ className?: string }} props */
export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Icon>
  );
}

/** Currículo (livro aberto). @param {{ className?: string }} props */
export function BookOpenIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" />
      <path d="M12 6.5v13" />
    </Icon>
  );
}

/** Perfil profissional (cartão de contato). @param {{ className?: string }} props */
export function ContactCardIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2" />
      <path d="M14.5 10H18" />
      <path d="M14.5 14H18" />
    </Icon>
  );
}

// Notificações e menu do painel (A-015, etapa 4): o sino, a gravidade (informação, aviso, crítico)
// e os ícones das seções. Sempre acompanham um texto visível.

/** @param {{ className?: string }} props */
export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icon>
  );
}

/** Gravidade INFO. @param {{ className?: string }} props */
export function InfoIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

/** Gravidade WARNING. @param {{ className?: string }} props */
export function WarningIcon(props) {
  return (
    <Icon {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

/** Gravidade CRITICAL. @param {{ className?: string }} props */
export function CriticalIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 16h.01" />
      <path d="M12 8v4" />
      <path d="M15.3 2a2 2 0 0 1 1.4.6l4.7 4.7A2 2 0 0 1 22 8.7v6.6a2 2 0 0 1-.6 1.4l-4.7 4.7a2 2 0 0 1-1.4.6H8.7a2 2 0 0 1-1.4-.6l-4.7-4.7A2 2 0 0 1 2 15.3V8.7a2 2 0 0 1 .6-1.4l4.7-4.7A2 2 0 0 1 8.7 2z" />
    </Icon>
  );
}

/** Aparência. @param {{ className?: string }} props */
export function PaletteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <path d="M13.5 6.5h.01" />
      <path d="M17.5 10.5h.01" />
      <path d="M8.5 7.5h.01" />
      <path d="M6.5 12.5h.01" />
    </Icon>
  );
}

/** Perfil. @param {{ className?: string }} props */
export function UserIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  );
}

/** Usuários. @param {{ className?: string }} props */
export function UsersIcon(props) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

/** Trocar a senha. @param {{ className?: string }} props */
export function KeyIcon(props) {
  return (
    <Icon {...props}>
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </Icon>
  );
}

// Árvore do conteúdo (A-015, etapa 5a): tipo do nó e ações de cada linha. Sempre acompanham um
// texto visível ou um nome acessível no botão que os contém.

/** Subir entre os irmãos. @param {{ className?: string }} props */
export function ArrowUpIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </Icon>
  );
}

/** Descer entre os irmãos. @param {{ className?: string }} props */
export function ArrowDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </Icon>
  );
}

/** Coleção. @param {{ className?: string }} props */
export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

/** Mover para outra coleção. @param {{ className?: string }} props */
export function MoveIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m15 8 4 4-4 4" />
      <path d="M5 5v14" />
    </Icon>
  );
}

/** Excluir. @param {{ className?: string }} props */
export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Icon>
  );
}

/** Criar. @param {{ className?: string }} props */
export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Oculto pelo pai (o olho riscado). @param {{ className?: string }} props */
export function EyeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6a12 12 0 0 1-2.6 3.2" />
      <path d="M6.6 7.6A12 12 0 0 0 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-1" />
      <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
    </Icon>
  );
}

// Pares de ícones do botão de modo de cor (D-35, ADR-037): o administrador escolhe um dos quatro
// para o site inteiro. Cada par tem o ícone do modo CLARO e o do modo ESCURO. São decorativos: o
// botão que os contém leva o nome do modo.

/** Sol cheio (modo claro do par `sun_moon`). @param {{ className?: string }} props */
export function SunIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m5.3 5.3 1.4 1.4" />
      <path d="m17.3 17.3 1.4 1.4" />
      <path d="m5.3 18.7 1.4-1.4" />
      <path d="m17.3 6.7 1.4-1.4" />
    </Icon>
  );
}

/** Lua cheia (modo escuro do par `sun_moon`). @param {{ className?: string }} props */
export function MoonIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor" />
    </Icon>
  );
}

/** Sol de contorno (modo claro do par `sun_moon_outline`). @param {{ className?: string }} props */
export function SunOutlineIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m5.3 5.3 1.4 1.4" />
      <path d="m17.3 17.3 1.4 1.4" />
      <path d="m5.3 18.7 1.4-1.4" />
      <path d="m17.3 6.7 1.4-1.4" />
    </Icon>
  );
}

/** Lua de contorno (modo escuro do par `sun_moon_outline`). @param {{ className?: string }} props */
export function MoonOutlineIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

/** Lâmpada acesa (modo claro do par `lightbulb`). @param {{ className?: string }} props */
export function LightbulbOnIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="currentColor" />
    </Icon>
  );
}

/** Lâmpada apagada (modo escuro do par `lightbulb`). @param {{ className?: string }} props */
export function LightbulbOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </Icon>
  );
}

/** Círculo com a metade esquerda cheia (modo claro do par `contrast_half`). @param {{ className?: string }} props */
export function ContrastLightIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </Icon>
  );
}

/** Círculo com a metade direita cheia (modo escuro do par `contrast_half`). @param {{ className?: string }} props */
export function ContrastDarkIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </Icon>
  );
}
