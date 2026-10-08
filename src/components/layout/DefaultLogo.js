// Logotipo embutido PROVISÓRIO do Vitrine (§11.1 do épico v1; ADR-037): o que aparece na barra do
// site, do espaço e do painel quando ninguém enviou um logo. SVG em linha, sem arquivo e sem upload,
// que usa só `currentColor` (o texto da barra, nos dois modos e com qualquer paleta, mantém o
// contraste que o texto do nome já tem). É um desenho genérico (uma vitrine com uma peça em
// exposição): o Engenheiro Chefe o trocará por um definitivo. Sempre existe um logo.

/**
 * @param {object} props
 * @param {string} [props.className] tamanho; o padrão é 36 px, como o logo enviado
 * @param {string} [props.label] nome acessível; sem ele o desenho é decorativo (o nome do site está
 *   ao lado, em texto)
 */
export function DefaultLogo({ className = "size-9 shrink-0", label }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
      data-testid="logo-padrao"
      className={className}
    >
      {label ? <title>{label}</title> : null}
      <rect x="4.5" y="5" width="27" height="26" rx="4" />
      <path d="M4.5 22h27" />
      <circle cx="18" cy="13.5" r="4" fill="currentColor" />
      <path d="M10 31v2.5" />
      <path d="M26 31v2.5" />
    </svg>
  );
}
