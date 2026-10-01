// Comando `npm run admin:create` (scripts/create-admin.js) executado de verdade, com o tsx,
// contra o SQLite temporário deste arquivo: cria o administrador inicial de forma idempotente
// (RF22, D-03), sem imprimir a senha. O .env real não é lido: o dotenv é apontado para um
// arquivo inexistente e todas as variáveis são passadas explicitamente.
import "./env";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { projectRoot } from "../setup/prisma-cli.js";
import { ADMIN, resetDatabase, signIn } from "./helpers";

const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

/**
 * Executa o comando como o `npm run admin:create` faria.
 * @param {Record<string, string>} variables ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NAME
 */
function runCreateAdmin(variables) {
  const noEnvFile = path.join(projectRoot, "nao-existe.env");
  const result = spawnSync(process.execPath, [tsxCli, "--tsconfig", "jsconfig.json", "scripts/create-admin.js"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DOTENV_PATH: noEnvFile,
      DOTENV_CONFIG_PATH: noEnvFile,
      NODE_ENV: "production",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      ADMIN_NAME: "",
      ...variables,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const credentials = { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ADMIN_NAME: ADMIN.name };

beforeEach(async () => {
  await resetDatabase();
});

describe("npm run admin:create", () => {
  it("cria o administrador, que consegue entrar, e não imprime a senha", async () => {
    const { status, output } = runCreateAdmin(credentials);

    expect(output).toContain(`Administrador inicial criado: ${ADMIN.email}`);
    expect(status).toBe(0);
    expect(output).not.toContain(ADMIN.password);

    const users = await prisma.user.findMany({ include: { accounts: true } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: ADMIN.email, name: ADMIN.name, emailVerified: true });
    expect(users[0].accounts).toHaveLength(1);
    expect((await signIn(ADMIN)).response.status).toBe(200);
  });

  it("é idempotente: a segunda execução não altera nada e termina com sucesso", async () => {
    expect(runCreateAdmin(credentials).status).toBe(0);
    const before = await prisma.account.findFirstOrThrow();

    const second = runCreateAdmin({ ...credentials, ADMIN_PASSWORD: "outra-senha-ficticia-456" });

    expect(second.status).toBe(0);
    expect(second.output).toContain("já existe; nada foi alterado");
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.account.findFirstOrThrow()).password).toBe(before.password);
  });

  it("usa o nome padrão quando ADMIN_NAME não é definida", async () => {
    expect(runCreateAdmin({ ...credentials, ADMIN_NAME: "" }).status).toBe(0);
    expect((await prisma.user.findFirstOrThrow()).name).toBe("Administrador");
  });

  it("sem as variáveis, falha com instrução e não cria usuário", async () => {
    const { status, output } = runCreateAdmin({});

    expect(status).toBe(1);
    expect(output).toContain("Defina ADMIN_EMAIL.");
    expect(output).toContain("Defina ADMIN_PASSWORD.");
    expect(await prisma.user.count()).toBe(0);
  });

  it("recusa senha curta sem imprimi-la", async () => {
    const { status, output } = runCreateAdmin({ ...credentials, ADMIN_PASSWORD: "curta-1" });

    expect(status).toBe(1);
    expect(output).toContain("ADMIN_PASSWORD deve ter ao menos 8 caracteres.");
    expect(output).not.toContain("curta-1");
    expect(await prisma.user.count()).toBe(0);
  });

  it("não cria um segundo administrador com outro e-mail", async () => {
    expect(runCreateAdmin(credentials).status).toBe(0);

    const { status, output } = runCreateAdmin({ ...credentials, ADMIN_EMAIL: "outro@exemplo.test" });

    expect(status).toBe(1);
    expect(output).toContain("Já existe um usuário com outro e-mail");
    expect(await prisma.user.count()).toBe(1);
  });
});
