// Apoio às rotas de /api/users (Cap. 5 §5.10, ADR-029): a forma pública de um usuário, a senha
// provisória (RN21) e a tradução dos erros do better-auth para o envelope da ADR-018. A pasta `_lib`
// é privada: não gera rota.
import { randomInt } from "node:crypto";
import { isSuspended } from "@/lib/authz";
import { TEMPORARY_PASSWORD_LENGTH } from "@/lib/validators";
import { ApiError } from "./http";

/**
 * Usuário como a API o devolve: nunca a senha, as contas nem as sessões. `suspended` é a suspensão
 * VIGENTE (prazo vencido não conta, RN23); `banExpires` e `banReason` descrevem a gravada.
 * @param {import("@/lib/auth").SessionUser & { createdAt?: Date, updatedAt?: Date, emailVerified?: boolean }} user
 */
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    handle: user.handle ?? null,
    role: user.role,
    suspended: isSuspended(user),
    banReason: user.banned ? (user.banReason ?? null) : null,
    banExpires: user.banned ? (user.banExpires ?? null) : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

// Sem I, O, l, 0 e 1: a senha é lida e repassada pelo administrador por um canal próprio.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Senha provisória de 16 caracteres aleatórios (RN21), sorteados com `crypto.randomInt` (sem viés).
 * Nunca é registrada em log: devolvida uma única vez pela rota que a criou.
 */
export function generateTemporaryPassword() {
  let password = "";
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return password;
}

/**
 * Traduz um erro lançado por `auth.api.*` (ou pelos ganchos do handle) para o envelope da API; devolve
 * `null` para um erro que não é do better-auth (o chamador o repassa e vira 500).
 * @param {unknown} error
 * @returns {ApiError | null}
 */
export function translateAuthError(error) {
  const e = /** @type {any} */ (error);
  const code = e?.body?.code ?? e?.code;
  const message = e?.body?.message ?? e?.message;
  const status = e?.statusCode ?? e?.status;

  // Violação de unicidade que escapou da pré-verificação (corrida entre duas requisições).
  if (e?.code === "P2002" || /Unique constraint/i.test(String(e?.message ?? ""))) {
    const meta = JSON.stringify(e?.meta ?? e?.cause ?? "");
    const field = /handle/i.test(meta) ? "handle" : "email";
    return new ApiError(409, "USER_CONFLICT", `Já existe um usuário com este ${field}.`, [{ field }]);
  }
  if (code === "INVALID_HANDLE") {
    return new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [{ field: "handle", message }]);
  }
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || code === "USER_ALREADY_EXISTS") {
    return new ApiError(409, "USER_CONFLICT", "Já existe um usuário com este e-mail.", [{ field: "email" }]);
  }
  if (code === "USER_NOT_FOUND") return new ApiError(404, "NOT_FOUND", "Usuário não encontrado.");
  if (code === "INVALID_PASSWORD") {
    return new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [{ field: "current", message: "A senha atual está incorreta." }]);
  }
  if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
    return new ApiError(422, "VALIDATION_ERROR", "Dados inválidos.", [{ field: "password", message: "A senha deve ter de 8 a 128 caracteres." }]);
  }
  // A autorização é do Vitrine e vem antes; uma recusa do plugin aqui é defesa em profundidade.
  if (status === 403 || status === "FORBIDDEN") return new ApiError(403, "FORBIDDEN", "Você não tem permissão para esta operação.");
  if (status === 401 || status === "UNAUTHORIZED") return new ApiError(401, "UNAUTHENTICATED", "Autenticação necessária.");
  return null;
}

/**
 * Executa uma chamada ao better-auth e traduz o erro conhecido.
 * @template T
 * @param {() => Promise<T>} call
 * @returns {Promise<T>}
 */
export async function authCall(call) {
  try {
    return await call();
  } catch (error) {
    throw translateAuthError(error) ?? error;
  }
}
