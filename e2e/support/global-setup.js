// Antes de todos os testes (com o servidor já no ar, banco migrado): estado inicial conhecido,
// com o administrador criado pelo `npm run admin:create`.
import { createAdmin } from "./auth.js";
import { clearDatabase } from "./database.js";

export default function globalSetup() {
  clearDatabase();
  createAdmin();
}
