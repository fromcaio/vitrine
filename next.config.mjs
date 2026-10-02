import { buildSecurityHeaders } from "./security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Não anuncia a tecnologia do servidor no cabeçalho X-Powered-By.
  poweredByHeader: false,
  // Cabeçalhos de segurança em todas as rotas (RNF03; Cap. 5 §5.12). A CSP só vale em produção
  // (`next build` e `next start`); no `next dev` o React exige 'unsafe-eval'.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders({ production: process.env.NODE_ENV === "production" }),
      },
    ];
  },
};

export default nextConfig;
