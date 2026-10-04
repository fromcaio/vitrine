// Redefine a senha de uma conta pelo terminal (RN21; ADR-029, item 8): para quem perdeu a senha do
// administrador, já que não há e-mail de recuperação. Define a nova senha, REVOGA todas as sessões da
// conta e liga a troca obrigatória: no próximo acesso, a conta só consegue trocar a própria senha.
//
//   Uso:     npm run admin:reset-password
//   Docker:  docker compose run --rm vitrine npm run admin:reset-password
//
// Lê do ambiente (ou do .env) ADMIN_EMAIL (o e-mail da conta, de qualquer papel) e ADMIN_PASSWORD (a
// senha provisória, de 8 a 128 caracteres). Não altera a suspensão: avisa se a conta segue suspensa.
// A senha nunca é impressa. Prefira definir ADMIN_PASSWORD no .env (removendo-a depois) a passá-la na
// linha de comando, que fica no histórico do shell.
import "dotenv/config";
import { resetUserPassword } from "../src/lib/auth.js";
import { passwordResetCommandSchema, validate } from "../src/lib/validators.js";

async function main() {
  const input = validate(passwordResetCommandSchema, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  if (!input.ok) {
    console.error("Não foi possível redefinir a senha:");
    for (const detail of input.details) console.error(`  - ${detail.message}`);
    console.error("Defina as variáveis no ambiente ou no .env (nomes em .env.example).");
    return 1;
  }

  const result = await resetUserPassword(input.data);
  if (result.status === "not-found") {
    console.error(`Não existe conta com o e-mail ${input.data.email}; nada foi alterado.`);
    return 1;
  }
  console.log(`Senha de ${result.user.email} redefinida; ${result.sessionsRevoked} sessão(ões) revogada(s).`);
  console.log("Na próxima entrada, a conta terá de trocar a senha em /admin/senha.");
  if (result.suspended) console.log("Atenção: a conta segue suspensa e não consegue entrar até a suspensão acabar.");
  console.log("Remova ADMIN_PASSWORD do .env: ela só é usada por este comando.");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("Falha ao redefinir a senha:", error?.message ?? error);
    process.exitCode = 1;
  });
