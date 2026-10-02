// Remove, em segundo plano, o diretório temporário de uma rodada e2e que não pôde ser apagado no
// `globalTeardown`: o Playwright só encerra o `next start` DEPOIS do teardown e, no Windows, um
// banco SQLite aberto não pode ser removido. Lançado por `removeRunDirectory` (database.js), solto
// do processo do Playwright; tenta por até um minuto e desiste em silêncio (o diretório fica no
// diretório temporário do sistema).
//
//   node e2e/support/remove-later.mjs <diretório>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.argv[2];
const tmp = path.resolve(os.tmpdir());
// Salvaguarda: só apaga diretórios vitrine-e2e-* diretamente dentro do diretório temporário.
if (!target || path.dirname(path.resolve(target)) !== tmp || !path.basename(target).startsWith("vitrine-e2e-")) {
  process.exit(1);
}

for (let attempt = 0; attempt < 120; attempt++) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    process.exit(0);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
