// Cabeçalhos de segurança HTTP do Vitrine (RNF03; Cap. 5 §5.12), aplicados a todas as rotas pelo
// next.config.mjs. Módulo puro, sem imports, para ser testado sem o Next.js.
// HSTS e TLS ficam a cargo do proxy reverso, e não daqui.

/**
 * Diretivas da Content-Security-Policy, na ordem em que são enviadas. A política é sem nonce:
 * o nonce obrigaria a renderizar todas as páginas a cada requisição e desligaria a ISR (guia de
 * CSP do Next.js 16). Qualquer mudança aqui exige repetir a verificação no navegador, sobre o
 * build de produção: hidratação do formulário de login, login e tema vindos do banco.
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const CONTENT_SECURITY_POLICY = Object.freeze([
  ["default-src", "'self'"],
  // O Next.js emite scripts inline de hidratação. Sem 'unsafe-inline', a página não hidrata e o
  // formulário de login cai no envio nativo, por GET, com o e-mail e a senha na URL.
  ["script-src", "'self' 'unsafe-inline'"],
  // Folhas de estilo só do próprio site...
  ["style-src", "'self'"],
  // ...mas atributos style são permitidos: é por um deles, no <html>, que o tema do banco chega
  // (Cap. 5 §5.9), e as fórmulas do KaTeX também os usam. Sem isto, a paleta é ignorada em
  // silêncio.
  ["style-src-attr", "'unsafe-inline'"],
  // Logotipo e imagens do Markdown são URLs externas (D-10).
  ["img-src", "'self' data: https:"],
  ["font-src", "'self'"],
  ["connect-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  // Clickjacking: nenhuma página pode ser incorporada em iframe.
  ["frame-ancestors", "'none'"],
]);

/** Valor do cabeçalho Content-Security-Policy. */
export function buildContentSecurityPolicy() {
  return CONTENT_SECURITY_POLICY.map(([directive, value]) => `${directive} ${value}`).join("; ");
}

/**
 * Cabeçalhos de segurança de todas as respostas.
 * @param {{ production: boolean }} options a CSP só é enviada em produção: no `next dev`, o React
 *   precisa de 'unsafe-eval', que a política não concede
 * @returns {Array<{ key: string, value: string }>}
 */
export function buildSecurityHeaders({ production }) {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Para navegadores que não entendem frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
  if (production) {
    headers.push({ key: "Content-Security-Policy", value: buildContentSecurityPolicy() });
  }
  return headers;
}
