// Cotas por usuário lidas do ambiente (RN25, ADR-023, item 7): MAX_CONTENTS_PER_USER (padrão 500) e
// MAX_BODY_BYTES (padrão 65536, em bytes UTF-8). src/lib/db.js nunca lê variáveis de ambiente: a
// rota as lê aqui e as passa em `{ limits }`. Um valor ausente ou malformado (não inteiro positivo)
// é ignorado e vale o padrão, para que um erro de digitação nunca desligue a cota.
import { resolveLimits } from "@/lib/limits";

/**
 * Cotas vigentes, lidas do ambiente a cada chamada (barato; os testes mudam as variáveis).
 * @returns {import("@/lib/limits").Limits}
 */
export function currentLimits() {
  return resolveLimits({
    maxContentsPerUser: Number(process.env.MAX_CONTENTS_PER_USER),
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES),
  });
}
