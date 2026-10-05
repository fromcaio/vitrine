// Antes de todos os testes (com o servidor já no ar, banco migrado): estado inicial conhecido,
// com o administrador criado pelo `npm run admin:create`, e uma fotografia do HTML que o `next build`
// pré-renderizou para `/`: o servidor regenera esse arquivo (ISR) na primeira visita depois de uma
// revalidação, e só aqui, antes de qualquer requisição a `/`, ele ainda é o do build (a sonda do
// servidor é `/login`, dinâmico). O spec do tema prova com ela que o build não consulta o banco.
import { copyFileSync } from "node:fs";
import path from "node:path";
import { createAdmin } from "./auth.js";
import { clearDatabase } from "./database.js";
import { e2eEnvironment, projectRoot } from "./env.js";

/** Nome da cópia do `index.html` do build, dentro do diretório temporário da rodada. */
export const BUILD_INDEX_COPY = "build-index.html";

export default function globalSetup() {
  clearDatabase();
  createAdmin();
  const { dir } = e2eEnvironment();
  copyFileSync(path.join(projectRoot, ".next", "server", "app", "index.html"), path.join(dir, BUILD_INDEX_COPY));
}
