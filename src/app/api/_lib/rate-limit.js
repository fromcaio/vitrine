// Limite de taxa das escritas por usuário (RN25, ADR-029, item 9; CT39): janela fixa de 60 s, em
// memória. Zera a cada reinício e vale por instância, o que a implantação de instância única
// (ADR-011) aceita. Os limites são constantes deste módulo, e não variáveis de ambiente. O limitador
// do better-auth só vale dentro do seu próprio handler: as chamadas diretas a `auth.api.*` das rotas
// de usuários não passam por ele, daí este.

/** Escritas por usuário em cada janela, por grupo de rotas. */
export const RATE_LIMITS = Object.freeze({
  /** Conteúdo, aparência e configuração do site. */
  content: 60,
  /** Contas: criar, editar, suspender, redefinir senha e excluir (rotas de /api/users). */
  users: 20,
  /** Troca e redefinição de senha (derrubam sessões e fazem hash caro). */
  password: 5,
});

/** Duração da janela, em milissegundos. */
export const RATE_WINDOW_MS = 60_000;

/** Acima deste número de chaves, as janelas vencidas são varridas, para o mapa não crescer sem fim. */
const SWEEP_THRESHOLD = 10_000;

const STORE_KEY = Symbol.for("vitrine.rateLimit");

/**
 * O mapa fica em `globalThis`: o Next.js pode carregar o módulo mais de uma vez (um pacote por rota,
 * recarga em desenvolvimento), e uma cópia por pacote daria a cada rota o seu próprio contador.
 * @returns {Map<string, { start: number, count: number }>}
 */
function store() {
  const holder = /** @type {any} */ (globalThis);
  holder[STORE_KEY] ??= new Map();
  return holder[STORE_KEY];
}

/**
 * Registra uma escrita do usuário no grupo e diz se ela cabe na janela.
 * @param {keyof typeof RATE_LIMITS} group
 * @param {string} userId
 * @param {number} [now] instante, em ms (os testes o controlam)
 * @returns {{ ok: true } | { ok: false, retryAfter: number }} `retryAfter` em segundos, no mínimo 1
 */
export function takeToken(group, userId, now = Date.now()) {
  const max = RATE_LIMITS[group];
  if (typeof max !== "number") throw new Error(`Grupo de limite de taxa desconhecido: ${String(group)}`);

  const entries = store();
  if (entries.size > SWEEP_THRESHOLD) {
    for (const [key, entry] of entries) if (now - entry.start >= RATE_WINDOW_MS) entries.delete(key);
  }

  const key = `${group}:${userId}`;
  const entry = entries.get(key);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    entries.set(key, { start: now, count: 1 });
    return { ok: true };
  }
  if (entry.count >= max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.start + RATE_WINDOW_MS - now) / 1000)) };
  }
  entry.count += 1;
  return { ok: true };
}

/** Zera todos os contadores (uso dos testes). */
export function resetRateLimits() {
  store().clear();
}
