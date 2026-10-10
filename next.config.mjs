import { buildSecurityHeaders } from "./security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Não anuncia a tecnologia do servidor no cabeçalho X-Powered-By.
  poweredByHeader: false,
  // O projeto não usa `next/image`: o otimizador de imagens (`/_next/image`) fica desligado e responde 404 (RNF03).
  images: { unoptimized: true },
  // O `CLAUDE.md` é versionado e mantido à mão: o `next dev` não deve criar o `AGENTS.md` (Next.js 16.4).
  agentRules: false,
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
