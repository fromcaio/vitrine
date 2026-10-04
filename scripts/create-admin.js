// Cria o administrador inicial do Vitrine (RF22, D-03) e recupera o acesso quando não resta
// administrador ativo (RN22; ADR-029). O cadastro público é desabilitado: este comando, executado por
// quem instala o sistema, é o único caminho para criar o primeiro usuário.
//
//   Uso:     npm run admin:create
//   Docker:  docker compose run --rm vitrine npm run admin:create
//
// Lê do ambiente (ou do .env) ADMIN_EMAIL, ADMIN_PASSWORD e, opcionalmente, ADMIN_NAME e
// ADMIN_HANDLE (o handle do espaço público do administrador, RN20), além de DATABASE_URL e das
// variáveis do better-auth. É idempotente: se o administrador já existe, nada é alterado (nem a
// senha). Enquanto houver um administrador ativo, recusa outro e-mail (saída 1). A senha nunca é
// impressa. Requer as migrações aplicadas.
//
// Executado com tsx, como o seed: o cliente gerado do Prisma é TypeScript e os módulos de src/
// usam o alias @/ (jsconfig.json).
import "dotenv/config";
import { ensureInitialAdmin } from "../src/lib/auth.js";
import { adminBootstrapSchema, validate } from "../src/lib/validators.js";

async function main() {
  const input = validate(adminBootstrapSchema, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
    handle: process.env.ADMIN_HANDLE,
  });
  if (!input.ok) {
    console.error("Não foi possível criar o administrador inicial:");
    for (const detail of input.details) {
      console.error(`  - ${detail.field === "handle" ? "ADMIN_HANDLE: " : ""}${detail.message}`);
    }
    console.error("Defina as variáveis no ambiente ou no .env (nomes em .env.example).");
    return 1;
  }

  const { status, user, reason, message } = await ensureInitialAdmin(input.data);
  switch (status) {
    case "created":
      console.log(`Administrador inicial criado: ${user?.email}`);
      console.log("Remova ADMIN_PASSWORD do .env: ela só é usada por este comando.");
      return 0;
    case "recovered":
      console.log(`Acesso recuperado: ${user?.email} agora é administrador e está ativo.`);
      console.log("Se não souber a senha dele, use `npm run admin:reset-password`.");
      return 0;
    case "repaired":
      console.log(`Administrador ${user?.email} já existia sem credencial; a senha foi definida.`);
      return 0;
    case "exists":
      console.log(`Administrador ${user?.email} já existe; nada foi alterado.`);
      return 0;
    case "invalid":
      console.error(`ADMIN_HANDLE: ${message}`);
      return 1;
    default:
      if (reason === "handle-taken") {
        console.error("O ADMIN_HANDLE já é de outra conta; nada foi alterado.");
      } else if (reason === "not-admin") {
        console.error(
          `${user?.email} é de uma conta que não é administradora e já há um administrador ativo; nada foi alterado.`,
        );
      } else {
        console.error(
          "Já existe um administrador ativo com outro e-mail; nada foi alterado. " +
            "Novas contas são criadas pelo administrador, no painel.",
        );
      }
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("Falha ao criar o administrador inicial:", error?.message ?? error);
    process.exitCode = 1;
  });
