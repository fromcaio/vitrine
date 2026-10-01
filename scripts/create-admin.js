// Cria o administrador inicial do Vitrine (RF22, D-03). O cadastro público é desabilitado: este
// comando, executado por quem instala o sistema, é o único caminho para criar o primeiro usuário.
//
//   Uso:     npm run admin:create
//   Docker:  docker compose run --rm vitrine npm run admin:create
//
// Lê do ambiente (ou do .env) ADMIN_EMAIL, ADMIN_PASSWORD e, opcionalmente, ADMIN_NAME, além de
// DATABASE_URL e das variáveis do better-auth. É idempotente: se o administrador já existe,
// nada é alterado (nem a senha). A senha nunca é impressa. Requer as migrações aplicadas.
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
  });
  if (!input.ok) {
    console.error("Não foi possível criar o administrador inicial:");
    for (const detail of input.details) console.error(`  - ${detail.message}`);
    console.error("Defina as variáveis no ambiente ou no .env (nomes em .env.example).");
    return 1;
  }

  const { status, user } = await ensureInitialAdmin(input.data);
  switch (status) {
    case "created":
      console.log(`Administrador inicial criado: ${user?.email}`);
      console.log("Remova ADMIN_PASSWORD do .env: ela só é usada por este comando.");
      return 0;
    case "repaired":
      console.log(`Administrador ${user?.email} já existia sem credencial; a senha foi definida.`);
      return 0;
    case "exists":
      console.log(`Administrador ${user?.email} já existe; nada foi alterado.`);
      return 0;
    default:
      console.error(
        "Já existe um usuário com outro e-mail. Nesta versão há um único administrador; nada foi alterado.",
      );
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
