// Concorrência do processamento de imagens (A-029, ADR-034, item 4; Cap. 5 §5.12): no máximo UM
// processamento por usuário e DOIS no servidor ao mesmo tempo. Decodificar e reencodar uma imagem de até 25
// megapixels custa memória e CPU, e o servidor é um só processo: sem o teto, um usuário com várias abas (ou
// vários usuários) encheria o pool de threads e deixaria o resto das requisições esperando. É o molde da
// fila de validação de texto (ADR-033), sem fila: o excedente recebe 503 `BUSY` com `Retry-After`, e repetir
// é seguro. Em memória e por instância (ADR-011). A pasta `_lib` é privada: não gera rota.
import { imageBusy } from "./http";

/** Processamentos simultâneos por usuário. */
export const MAX_PER_USER = 1;
/** Processamentos simultâneos no servidor. */
export const MAX_TOTAL = 2;
/** Segundos sugeridos em `Retry-After` (um processamento leva algumas centenas de milissegundos). */
export const RETRY_AFTER_SECONDS = 2;

const STORE_KEY = Symbol.for("vitrine.imageSlots");

/**
 * O estado fica em `globalThis`: o Next.js pode carregar o módulo mais de uma vez (um pacote por rota), e uma
 * cópia por pacote daria a cada rota o seu próprio contador.
 * @returns {{ perUser: Map<string, number>, total: number }}
 */
function state() {
  const holder = /** @type {any} */ (globalThis);
  holder[STORE_KEY] ??= { perUser: new Map(), total: 0 };
  return holder[STORE_KEY];
}

/**
 * Reserva uma vaga de processamento para o usuário, ou lança 503 `BUSY`. Quem a reserva DEVE chamar a função
 * devolvida (em um `finally`), qualquer que seja o resultado.
 * @param {string} userId
 * @returns {() => void} libera a vaga (idempotente)
 */
export function acquireImageSlot(userId) {
  const slots = state();
  if ((slots.perUser.get(userId) ?? 0) >= MAX_PER_USER || slots.total >= MAX_TOTAL) throw imageBusy(RETRY_AFTER_SECONDS);
  slots.perUser.set(userId, (slots.perUser.get(userId) ?? 0) + 1);
  slots.total += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (slots.perUser.get(userId) ?? 1) - 1;
    if (count <= 0) slots.perUser.delete(userId);
    else slots.perUser.set(userId, count);
    slots.total = Math.max(0, slots.total - 1);
  };
}

/** Zera os contadores (uso dos testes). */
export function resetImageSlots() {
  const slots = state();
  slots.perUser.clear();
  slots.total = 0;
}
