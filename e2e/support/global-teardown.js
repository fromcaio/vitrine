// Depois de todos os testes: remove o banco temporário da rodada.
import { removeRunDirectory } from "./database.js";

export default function globalTeardown() {
  removeRunDirectory();
}
