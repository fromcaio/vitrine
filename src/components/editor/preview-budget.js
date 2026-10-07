// Orçamento da pré-visualização do editor (A-023; risco residual 5 do Cap. 5 §5.12; ADR-033).
//
// O problema: o editor roda no navegador o MESMO pipeline que o servidor (`markdown-pipeline.js`), a cada
// digitação, e um texto hostil o congela: 12 KB de `![` aninhado levam 3,3 s, e 64 KiB de `*` em torre, mais
// de 40 s, na aba do PRÓPRIO autor (o servidor recusa o envio em 2 s, mas a aba só volta depois do parse).
//
// A solução tem duas metades (a outra é o gancho `usePreviewBudget` e o `Preview`):
//   1. NÃO se renderiza o que está oculto, e o que é visível só depois de uma pausa na digitação;
//   2. antes de a thread principal renderizar, um *Web Worker* roda o mesmo processador (o de
//      `render-processor.mjs`, montado com as listas de `markdown-pipeline.js`, a fonte única; o servidor
//      usa o mesmo módulo no `worker_threads` da gravação) com um ORÇAMENTO CURTO. Se o texto estoura o
//      orçamento (ou o processamento falha, por exemplo com a pilha estourada por um aninhamento
//      profundo), o worker é ENCERRADO (`terminate` para até um laço síncrono) e a pré-visualização diz
//      que o texto é complexo demais. A thread principal só renderiza o texto aprovado.
//
// O módulo não tem React e não conhece o DOM: `createWorker` é injetável, e os testes usam um worker de
// mentira (que responde, que não responde, que falha). O texto digitado nunca passa por aqui para ser
// guardado: este módulo só olha e não altera nem mantém o texto.

/** Pausa, em ms, depois da última digitação, antes de checar e renderizar a pré-visualização. */
export const PREVIEW_DELAY_MS = 400;

/** Orçamento, em ms, que o worker tem para processar o texto (cerca de 1 s; o servidor dá 2 s na gravação). */
export const PREVIEW_BUDGET_MS = 1000;

/** Quanto se espera o worker subir (carregar o pacote do pipeline) antes de desistir dele. */
export const PREVIEW_STARTUP_MS = 15_000;

/** O que a pré-visualização diz no lugar do texto renderizado quando o texto estoura o orçamento. */
export const TOO_COMPLEX_PREVIEW_MESSAGE = "A pré-visualização não está disponível: o texto é complexo demais.";

/** O que ela diz quando o navegador não consegue criar o worker (a política de segurança, por exemplo). */
export const UNAVAILABLE_PREVIEW_MESSAGE = "A pré-visualização não está disponível neste navegador.";

/**
 * O worker real: o mesmo módulo em todo navegador. O endereço é literal (`new URL(..., import.meta.url)`)
 * para o empacotador do Next.js o enxergar e gerar um arquivo próprio em `/_next/static/`, do MESMO site:
 * a CSP (`script-src 'self'`, sem `worker-src`, que herda dele) o aceita, sem `blob:`.
 * @returns {Worker}
 */
export function createPreviewWorker() {
  return new Worker(new URL("./preview-worker.js", import.meta.url));
}

/** O navegador tem `Worker`? (Não tem no jsdom dos testes nem em navegadores muito antigos.) */
export function workersSupported() {
  return typeof Worker !== "undefined";
}

/**
 * @typedef {"ok" | "too-complex" | "unavailable" | "superseded"} CheckStatus
 * @typedef {object} WorkerLike
 * @property {(message: unknown) => void} postMessage
 * @property {() => void} terminate
 * @property {((event: { data: any }) => void) | null} onmessage
 * @property {((event: unknown) => void) | null} onerror
 * @property {((event: unknown) => void) | null} [onmessageerror]
 */

/**
 * Um verificador: mantém UM worker vivo (subir custa cerca de meio segundo, e um por texto somaria isso à
 * digitação) e o encerra e recria quando o orçamento acaba, quando ele falha ou quando uma checagem
 * nova passa na frente de uma que ainda corre. Uma checagem por vez.
 * @param {object} [options]
 * @param {() => WorkerLike} [options.createWorker] fábrica do worker (injetável nos testes)
 * @param {number} [options.budgetMs] o orçamento do processamento (não conta a subida do worker)
 * @param {number} [options.startupMs] quanto esperar a subida
 */
export function createBudgetChecker({ createWorker = createPreviewWorker, budgetMs = PREVIEW_BUDGET_MS, startupMs = PREVIEW_STARTUP_MS } = {}) {
  /** @type {{ worker: WorkerLike, ready: Promise<boolean> } | null} */
  let current = null;
  /** @type {null | ((status: CheckStatus) => void)} */
  let settle = null;
  let serial = 0;

  /** Encerra o worker e descarta a checagem em andamento. */
  function discard() {
    const worker = current?.worker;
    current = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        worker.terminate();
      } catch {
        // um worker que não se encerra já não responde a nada
      }
    }
  }

  /** @returns {{ worker: WorkerLike, ready: Promise<boolean> } | null} `null` se o navegador recusou o worker */
  function ensureWorker() {
    if (current) return current;
    /** @type {WorkerLike} */
    let worker;
    try {
      worker = createWorker();
    } catch {
      return null;
    }
    /** @type {(value: boolean) => void} */
    let resolveReady = () => {};
    const ready = new Promise((resolve) => (resolveReady = resolve));
    const startup = setTimeout(() => resolveReady(false), startupMs);
    worker.onmessage = (event) => {
      if (event.data?.type === "ready") {
        clearTimeout(startup);
        resolveReady(true);
      }
    };
    worker.onerror = () => {
      clearTimeout(startup);
      resolveReady(false);
    };
    current = { worker, ready };
    return current;
  }

  /**
   * Checa se o texto cabe no orçamento.
   * @param {string} markdown
   * @returns {Promise<CheckStatus>} `ok`; `too-complex` (estourou o orçamento ou o processamento falhou);
   *   `unavailable` (não foi possível criar o worker); `superseded` (uma checagem mais nova passou na frente)
   */
  async function check(markdown) {
    // Uma checagem nova passa na frente da que corre: o worker ocupado com o texto velho é descartado.
    if (settle) {
      const previous = settle;
      settle = null;
      discard();
      previous("superseded");
    }
    const mine = ++serial;
    const started = ensureWorker();
    if (!started) return "unavailable";
    const { worker, ready } = started;
    if (!(await ready)) {
      if (current?.worker === worker) discard();
      return mine === serial ? "unavailable" : "superseded";
    }
    if (mine !== serial || current?.worker !== worker) return "superseded";

    return new Promise((resolve) => {
      /** @param {CheckStatus} status */
      const done = (status) => {
        clearTimeout(timer);
        if (settle === done) settle = null;
        resolve(status);
      };
      settle = done;
      // O orçamento só começa quando o texto é entregue ao worker, já de pé.
      const timer = setTimeout(() => {
        if (settle !== done) return;
        discard(); // `terminate` encerra até um laço síncrono
        done("too-complex");
      }, budgetMs);
      worker.onmessage = (event) => {
        if (event.data?.id !== mine) return;
        done(event.data.ok === true ? "ok" : "too-complex");
      };
      // Uma exceção solta do worker (a pilha estourada, uma falha de carga) é "complexo demais".
      worker.onerror = () => {
        if (settle !== done) return;
        discard();
        done("too-complex");
      };
      worker.postMessage({ id: mine, markdown });
    });
  }

  /** Encerra o worker (ao sair da tela). O verificador continua usável: o worker sobe de novo no próximo `check`. */
  function dispose() {
    if (settle) {
      const previous = settle;
      settle = null;
      previous("superseded");
    }
    discard();
  }

  return { check, dispose };
}
