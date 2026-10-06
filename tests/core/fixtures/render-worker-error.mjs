// Worker de mentira: responde que o texto NÃO renderizou (como uma exceção do renderizador, uma pilha estourada).
import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ id }) => parentPort.postMessage({ id, ok: false, error: "RangeError" }));
parentPort.postMessage({ type: "ready" });
