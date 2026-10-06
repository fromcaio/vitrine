// Orçamento de renderização na gravação (A-021, ADR-033; RN25; Cap. 5 §5.12): decide, ANTES de gravar,
// se um texto Markdown do usuário renderiza dentro de um orçamento de tempo. O renderizador (o pipeline do
// `MarkdownRenderer`) tem custo superlinear em entrada hostil (30 s com 256 KiB de `[a](`; `> ` repetido
// estoura a pilha), e o servidor é um só processo Node: o texto é validado em um `worker_threads`, que é
// ENCERRADO (`terminate`) quando o tempo acaba, e o laço de eventos do servidor nunca bloqueia.
//
// - Qualquer falha de renderização (tempo, `RangeError` da pilha, exceção do KaTeX, morte do worker) é
//   "complexo demais". Falha ao SUBIR o worker não é do autor: lança (500), não vira "complexo demais".
// - Uma validação por vez, em um worker que DURA entre as chamadas (medido: subir um custa ~1 s de carga
//   dos módulos, contra ~1 ms de um worker quente) e é recriado depois de um encerramento ou de uma morte.
//   Até `MAX_WAITING` esperam; com a fila cheia, `RenderBusyError` (503 `BUSY` com `Retry-After`).
// - O orçamento conta só a partir do envio do texto ao worker já pronto: a carga dos módulos de um worker
//   recém-criado não é do autor.
// - O worker é `unref`: não segura o processo (testes, `next build`); sem uso por `IDLE_MS`, é encerrado.
//
// `createRenderBudget` existe para os testes (um worker de mentira que falha, morre ou não sobe); a
// instância padrão, usada pelas rotas, é a exportada no fim.
import path from "node:path";
import { Worker } from "node:worker_threads";

/** Orçamento de tempo de uma renderização, em ms (ADR-033). */
export const RENDER_BUDGET_MS = 2000;

/** Quantas validações esperam, além da que está rodando (ADR-033); a seguinte recebe `RenderBusyError`. */
export const MAX_WAITING = 3;

/** Segundos sugeridos em `Retry-After` quando a fila está cheia (uma validação leva até o orçamento). */
export const RETRY_AFTER_SECONDS = 3;

/** Tempo máximo para um worker novo carregar os módulos (não conta no orçamento do autor). */
const STARTUP_TIMEOUT_MS = 20_000;

/** Sem uso por este tempo, o worker é encerrado (libera a memória dos módulos carregados). */
const IDLE_MS = 5 * 60_000;

/** Teto de memória do worker: um texto patológico encerra o worker, e não derruba o servidor. */
const RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 512, stackSizeMb: 4 });

/** A fila de validações está cheia: tente de novo daqui a pouco (503 `BUSY`). */
export class RenderBusyError extends Error {
  /** @param {number} [retryAfter] segundos */
  constructor(retryAfter = RETRY_AFTER_SECONDS) {
    super("Há validações de texto demais em andamento. Tente de novo em instantes.");
    this.name = "RenderBusyError";
    this.retryAfter = retryAfter;
  }
}

/**
 * @typedef {object} RenderCheck
 * @property {boolean} renderable `true`: renderiza dentro do orçamento
 * @property {"timeout" | "error"} [reason] por que não (`timeout`: estourou o tempo; `error`: exceção, pilha, morte)
 * @property {number} ms quanto a validação durou
 */

/**
 * @typedef {object} Job
 * @property {string} markdown
 * @property {number} budgetMs
 * @property {(check: RenderCheck) => void} resolve
 * @property {(error: unknown) => void} reject
 */

/** Caminho do worker, a partir da raiz do projeto: o `next start` (e a imagem) roda com `cwd` na raiz. */
const defaultWorkerFile = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "lib", "render-worker.mjs");

/**
 * @param {{ workerFile?: () => string, startupTimeoutMs?: number, idleMs?: number, maxWaiting?: number }} [config]
 */
export function createRenderBudget({
  workerFile = defaultWorkerFile,
  startupTimeoutMs = STARTUP_TIMEOUT_MS,
  idleMs = IDLE_MS,
  maxWaiting = MAX_WAITING,
} = {}) {
  /** Contadores para o relato e os testes. */
  const stats = { started: 0, terminated: 0, checks: 0 };
  /** @type {{ worker: Worker, ready: Promise<void> } | null} */
  let current = null;
  let running = false;
  /** @type {Job[]} */
  const waiting = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;
  let nextId = 0;

  /** Sobe um worker e espera a mensagem `ready`. */
  function startWorker() {
    const worker = new Worker(workerFile(), {
      resourceLimits: { ...RESOURCE_LIMITS },
      // O pipeline é ESM em um pacote sem `type`: o Node avisa (inofensivo) a cada worker novo.
      execArgv: ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"],
    });
    worker.unref();
    stats.started += 1;
    const record = { worker, ready: Promise.resolve() };
    record.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("O worker de renderização não ficou pronto a tempo."));
        worker.terminate().catch(() => {});
      }, startupTimeoutMs);
      timer.unref();
      const fail = (/** @type {unknown} */ error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("O worker de renderização falhou ao subir."));
      };
      const failExit = () => fail(new Error("O worker de renderização terminou ao subir."));
      worker.once("error", fail);
      worker.once("exit", failExit);
      worker.on("message", function onReady(/** @type {{ type?: string }} */ message) {
        if (message?.type !== "ready") return;
        clearTimeout(timer);
        worker.off("message", onReady);
        worker.off("error", fail);
        worker.off("exit", failExit);
        resolve();
      });
    });
    // Um worker que morre (memória, erro) sai de cena: o próximo texto sobe outro.
    worker.once("exit", () => {
      if (current?.worker === worker) current = null;
    });
    return record;
  }

  function armIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!running && current) {
        const { worker } = current;
        current = null;
        worker.terminate().catch(() => {});
      }
    }, idleMs);
    idleTimer.unref();
  }

  /** @param {Job} job */
  async function run(job) {
    if (!current) current = startWorker();
    const record = current;
    try {
      await record.ready;
    } catch (error) {
      if (current === record) current = null;
      record.worker.terminate().catch(() => {});
      throw error;
    }

    const { worker } = record;
    const id = (nextId += 1);
    const started = performance.now();
    return /** @type {Promise<RenderCheck>} */ (
      new Promise((resolve) => {
        const elapsed = () => Math.round(performance.now() - started);
        /** @param {RenderCheck} check */
        const finish = (check) => {
          clearTimeout(timer);
          worker.off("message", onMessage);
          worker.off("error", onError);
          worker.off("exit", onError);
          resolve(check);
        };
        const onMessage = (/** @type {{ id?: number, ok?: boolean }} */ message) => {
          if (message?.id !== id) return;
          finish(message.ok ? { renderable: true, ms: elapsed() } : { renderable: false, reason: "error", ms: elapsed() });
        };
        // Uma exceção que escapa do worker, ou a morte dele (memória), também é "complexo demais". O worker
        // sai de cena NA HORA (e não só no evento `exit`): o texto seguinte não pode cair em um worker morto.
        const onError = () => {
          if (current === record) current = null;
          worker.terminate().catch(() => {});
          finish({ renderable: false, reason: "error", ms: elapsed() });
        };
        const timer = setTimeout(() => {
          // O tempo acabou: encerra o worker (o laço dele pode demorar minutos) e o próximo texto sobe outro.
          if (current === record) current = null;
          stats.terminated += 1;
          worker.off("exit", onError);
          worker.terminate().catch(() => {});
          finish({ renderable: false, reason: "timeout", ms: elapsed() });
        }, job.budgetMs);
        worker.on("message", onMessage);
        worker.once("error", onError);
        worker.once("exit", onError);
        worker.postMessage({ id, markdown: job.markdown });
      })
    );
  }

  function pump() {
    if (running) return;
    const job = waiting.shift();
    if (!job) return;
    running = true;
    if (idleTimer) clearTimeout(idleTimer);
    run(job)
      .then(job.resolve, job.reject)
      .finally(() => {
        running = false;
        armIdleTimer();
        pump();
      });
  }

  /**
   * O texto renderiza dentro do orçamento? Executa o pipeline do `MarkdownRenderer` em um worker, com
   * uma validação por vez. Lança `RenderBusyError` com a fila cheia; qualquer falha de RENDERIZAÇÃO vira
   * `{ renderable: false }`, nunca uma exceção.
   * @param {string} markdown
   * @param {{ budgetMs?: number }} [options]
   * @returns {Promise<RenderCheck>}
   */
  function checkRenderable(markdown, { budgetMs = RENDER_BUDGET_MS } = {}) {
    if (running && waiting.length >= maxWaiting) return Promise.reject(new RenderBusyError());
    stats.checks += 1;
    return new Promise((resolve, reject) => {
      waiting.push({ markdown: typeof markdown === "string" ? markdown : "", budgetMs, resolve, reject });
      pump();
    });
  }

  /** Encerra o worker (testes e desligamento). */
  async function shutdownRenderWorker() {
    if (idleTimer) clearTimeout(idleTimer);
    const record = current;
    current = null;
    if (record) await record.worker.terminate().catch(() => {});
  }

  return { checkRenderable, shutdownRenderWorker, stats };
}

const instance = createRenderBudget();

/** A instância das rotas. */
export const checkRenderable = instance.checkRenderable;
export const shutdownRenderWorker = instance.shutdownRenderWorker;
export const stats = instance.stats;
