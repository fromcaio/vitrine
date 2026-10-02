// Implantação (M13): cabeçalhos de segurança e os arquivos da imagem Docker (CT29, parte que se
// verifica sem Docker). Os arquivos são lidos como texto; não há construção de imagem aqui.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config.mjs";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "../../security-headers.mjs";
import { projectRoot } from "../setup/prisma-cli.js";

const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8").replaceAll("\r\n", "\n");

/** Linhas úteis de um arquivo de configuração: sem comentários de linha inteira e sem vazias. */
const instructions = (text) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));

afterEach(() => {
  vi.unstubAllEnvs();
});

// --------------------------------------------------------
// Cabeçalhos de segurança
// --------------------------------------------------------

/** Cabeçalhos como objeto, com os nomes em minúsculas. */
const byName = (headers) => Object.fromEntries(headers.map(({ key, value }) => [key.toLowerCase(), value]));

/** Diretivas de uma CSP: { "script-src": ["'self'", "'unsafe-inline'"], ... }. */
function parseCsp(value) {
  return Object.fromEntries(
    value
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe("buildSecurityHeaders em produção", () => {
  const headers = buildSecurityHeaders({ production: true });
  const csp = parseCsp(byName(headers)["content-security-policy"]);

  it("a CSP tem exatamente as diretivas aprovadas, conferidas uma a uma", () => {
    expect(csp).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'"],
      "style-src-attr": ["'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("os scripts de hidratação do Next.js são permitidos, sem eval e sem nonce", () => {
    expect(csp["script-src"]).toContain("'unsafe-inline'");
    const sources = Object.values(csp).flat();
    expect(sources).not.toContain("'unsafe-eval'");
    expect(sources.filter((source) => source.startsWith("'nonce-"))).toEqual([]);
    expect(sources).not.toContain("*");
  });

  it("o atributo style é permitido (tema no <html>), mas folhas de estilo inline não", () => {
    expect(csp["style-src-attr"]).toEqual(["'unsafe-inline'"]);
    expect(csp["style-src"]).not.toContain("'unsafe-inline'");
  });

  it("nenhuma página pode ser incorporada em iframe nem carregar plugins", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(byName(headers)["x-frame-options"]).toBe("DENY");
  });

  it("envia os outros quatro cabeçalhos", () => {
    expect(byName(headers)).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
    expect(headers).toHaveLength(5);
    expect(new Set(headers.map(({ key }) => key.toLowerCase())).size).toBe(5);
  });

  it("não define HSTS nem upgrade-insecure-requests (TLS é do proxy reverso)", () => {
    expect(Object.keys(byName(headers))).not.toContain("strict-transport-security");
    expect(Object.keys(csp)).not.toContain("upgrade-insecure-requests");
  });

  it("o valor do cabeçalho é uma única linha, com as diretivas separadas por ponto e vírgula", () => {
    const value = buildContentSecurityPolicy();
    expect(value).toBe(byName(headers)["content-security-policy"]);
    expect(value).not.toMatch(/[\r\n]/);
    expect(value.split("; ")).toHaveLength(11);
  });
});

describe("buildSecurityHeaders fora de produção", () => {
  it("não envia a CSP (o next dev precisa de eval) e mantém os outros quatro", () => {
    const headers = byName(buildSecurityHeaders({ production: false }));

    expect(Object.keys(headers).sort()).toEqual([
      "permissions-policy",
      "referrer-policy",
      "x-content-type-options",
      "x-frame-options",
    ]);
  });
});

describe("next.config.mjs", () => {
  it("aplica os cabeçalhos a todas as rotas, com a CSP quando NODE_ENV é production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const rules = await nextConfig.headers();

    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/(.*)");
    expect(rules[0].headers).toEqual(buildSecurityHeaders({ production: true }));
  });

  it("fora de produção, não envia a CSP", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const [{ headers }] = await nextConfig.headers();

    expect(Object.keys(byName(headers))).not.toContain("content-security-policy");
    expect(headers).toHaveLength(4);
  });

  it("não anuncia X-Powered-By e não usa a saída standalone", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig).not.toHaveProperty("output");
  });
});

// --------------------------------------------------------
// .dockerignore
// --------------------------------------------------------

// Expressão regular de um padrão do .dockerignore. Cobre só o que este arquivo usa: nomes na
// raiz do contexto, um asterisco dentro de um segmento e dois asteriscos seguidos de barra para
// qualquer profundidade. Um padrão que casa com um diretório exclui tudo o que está dentro dele.
function ignorePattern(pattern) {
  const source = pattern
    .split("**/")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join("(?:.*/)?");
  return new RegExp(`^${source}(?:/.*)?$`);
}

describe(".dockerignore", () => {
  const patterns = instructions(read(".dockerignore"));
  const isIgnored = (file) => patterns.some((pattern) => ignorePattern(pattern).test(file));

  it("não tem padrão de exceção que traga algo de volta", () => {
    expect(patterns.filter((pattern) => pattern.startsWith("!"))).toEqual([]);
  });

  it.each([
    ".env",
    ".env.local",
    ".env.production",
    ".env.example",
    "prisma/.env",
    "dev.db",
    "dev.db-journal",
    "prisma/dev.db",
    "data/vitrine.db",
    "data/vitrine.db-wal",
    "data/vitrine.db-shm",
    "node_modules/next/package.json",
    ".next/server/app/index.html",
    ".git/config",
    "src/generated/prisma/client.ts",
    "doc/tex/main.tex",
    ".claude/settings.json",
    "coverage/index.html",
  ])("deixa %s fora da imagem", (file) => {
    expect(isIgnored(file)).toBe(true);
  });

  it.each([
    "package.json",
    "package-lock.json",
    "jsconfig.json",
    "next.config.mjs",
    "security-headers.mjs",
    "postcss.config.mjs",
    "prisma.config.ts",
    "prisma/schema.prisma",
    "prisma/seed.js",
    "prisma/migrations/20261001034824_init/migration.sql",
    "scripts/create-admin.js",
    "src/lib/db.js",
    "src/lib/auth.js",
    "src/app/layout.js",
    "src/app/globals.css",
    "public/file.svg",
  ])("mantém %s, de que a imagem precisa", (file) => {
    expect(fs.existsSync(path.join(projectRoot, file))).toBe(true);
    expect(isIgnored(file)).toBe(false);
  });
});

// --------------------------------------------------------
// Dockerfile
// --------------------------------------------------------

describe("Dockerfile", () => {
  const text = read("Dockerfile");
  const lines = instructions(text);
  const body = lines.join("\n");
  const indexOf = (fragment) => body.indexOf(fragment);
  // Tudo a partir do segundo FROM é o estágio de execução.
  const runtime = body.slice(body.lastIndexOf("FROM "));
  const build = body.slice(body.indexOf("FROM "), body.lastIndexOf("FROM "));

  it("não contém segredo, nem em comentário: nada de segredo do better-auth nem de ADMIN_*", () => {
    expect(text).not.toContain("BETTER_AUTH_SECRET");
    expect(text).not.toContain("ADMIN_");
    expect(text).not.toMatch(/^\s*(ARG|ENV)\b.*(SECRET|PASSWORD|TOKEN|KEY)/im);
  });

  it("não copia nenhum arquivo .env", () => {
    expect(lines.filter((line) => /^\s*(COPY|ADD)\b/.test(line) && line.includes(".env"))).toEqual([]);
  });

  it("tem dois estágios sobre a mesma imagem-base, fixada em um ARG", () => {
    expect(lines.filter((line) => line.startsWith("ARG "))).toEqual(["ARG NODE_IMAGE=node:24-bookworm-slim"]);
    expect(lines.filter((line) => line.startsWith("FROM "))).toEqual([
      "FROM ${NODE_IMAGE} AS build",
      "FROM ${NODE_IMAGE} AS runtime",
    ]);
  });

  it("instala as dependências completas antes de copiar o código (cache de camadas)", () => {
    expect(indexOf("COPY package.json package-lock.json ./")).toBeGreaterThan(-1);
    expect(indexOf("COPY package.json package-lock.json ./")).toBeLessThan(indexOf("RUN npm ci"));
    expect(indexOf("RUN npm ci")).toBeLessThan(indexOf("COPY . ."));
    // As dependências de desenvolvimento ficam: o seed e o admin:create rodam com o tsx.
    expect(lines.filter((line) => line.includes("npm ci"))).toEqual(["RUN npm ci"]);
    expect(body).not.toMatch(/--omit|--production|--only|npm prune/);
  });

  it("define DATABASE_URL antes do build e gera o cliente do Prisma antes de compilar", () => {
    const env = indexOf("DATABASE_URL=file:/data/vitrine.db");
    const run = indexOf("RUN npx prisma generate && npm run build");

    expect(env).toBeGreaterThan(indexOf("COPY . ."));
    expect(run).toBeGreaterThan(env);
    expect(build).toContain("DATABASE_URL=file:/data/vitrine.db");
  });

  it("as ferramentas de compilação ficam só no estágio de build", () => {
    expect(build).toMatch(/apt-get install .*python3 make g\+\+/);
    expect(runtime).not.toMatch(/python3|\bmake\b|g\+\+/);
  });

  it("o estágio de execução roda em produção, como usuário sem privilégios", () => {
    expect(runtime).toContain("NODE_ENV=production");
    expect(runtime).toContain("COPY --from=build --chown=node:node /app ./");
    expect(runtime).toContain("EXPOSE 3000");
    // USER node vem depois de tudo que exige root e antes da partida.
    expect(runtime.indexOf("USER node")).toBeGreaterThan(runtime.indexOf("chown node:node /data"));
    expect(runtime.indexOf("USER node")).toBeLessThan(runtime.indexOf("CMD "));
    expect(lines.filter((line) => line.startsWith("USER "))).toEqual(["USER node"]);
    expect(body).not.toMatch(/chown -R/);
  });

  it("parte com o next start, sem o npm como intermediário", () => {
    expect(lines.filter((line) => line.startsWith("CMD "))).toEqual(['CMD ["node_modules/.bin/next", "start"]']);
    expect(lines.filter((line) => line.startsWith("ENTRYPOINT "))).toEqual([]);
  });

  it("não menciona a saída standalone", () => {
    expect(text).not.toMatch(/standalone/i);
  });

  it("o tsx, de que o seed e o admin:create dependem, continua declarado no package.json", () => {
    const pkg = JSON.parse(read("package.json"));

    expect({ ...pkg.dependencies, ...pkg.devDependencies }).toHaveProperty("tsx");
    expect(pkg.scripts["admin:create"]).toContain("tsx");
    expect(read("prisma.config.ts")).toContain("tsx prisma/seed.js");
  });
});

// --------------------------------------------------------
// docker-compose.yml
// --------------------------------------------------------

/** Itens de uma lista YAML simples (`chave:` seguida de linhas `- valor`), sem as aspas. */
function yamlList(lines, key) {
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return null;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.trim().match(/^-\s+"?([^"#]+?)"?\s*(#.*)?$/);
    if (!item) break;
    items.push(item[1]);
  }
  return items;
}

describe("docker-compose.yml", () => {
  const text = read("docker-compose.yml");
  // Os comentários do YAML ficam fora: inclusive os que vêm no fim de uma linha.
  const lines = instructions(text);
  const body = lines.join("\n");

  it("publica a porta só em 127.0.0.1", () => {
    expect(yamlList(lines, "ports")).toEqual(["127.0.0.1:3000:3000"]);
    expect(body).not.toMatch(/0\.0\.0\.0/);
  });

  it("monta o volume do SQLite em /data e aponta DATABASE_URL para ele", () => {
    expect(yamlList(lines, "volumes")).toEqual(["./data:/data"]);
    expect(body).toMatch(/^\s+DATABASE_URL: "file:\/data\/vitrine\.db"$/m);
  });

  it("recebe os segredos por env_file, sem nenhum valor no arquivo", () => {
    expect(body).toMatch(/^\s+env_file: \.env$/m);
    expect(text).not.toContain("BETTER_AUTH_SECRET");
    expect(text).not.toContain("ADMIN_");
  });

  it("tem um único serviço, construído do Dockerfile, com reinício e init", () => {
    const services = lines.filter((line) => /^ {2}\S.*:$/.test(line)).map((line) => line.trim());

    expect(lines[0]).toBe("services:");
    expect(services).toEqual(["vitrine:"]);
    expect(body).toMatch(/^\s+build: \.$/m);
    expect(body).toMatch(/^\s+image: vitrine:latest$/m);
    expect(body).toMatch(/^\s+restart: unless-stopped$/m);
    expect(body).toMatch(/^\s+init: true$/m);
    // Instância única (Cap. 5 §5.7): sem réplicas.
    expect(body).not.toMatch(/replicas|deploy:|scale/);
  });
});

// --------------------------------------------------------
// .gitignore
// --------------------------------------------------------

describe(".gitignore", () => {
  const patterns = instructions(read(".gitignore"));

  it("ignora o volume do banco, os bancos e os .env, mas versiona o .env.example", () => {
    expect(patterns).toEqual(expect.arrayContaining(["/data/", "*.db", ".env*", "!.env.example"]));
  });
});
