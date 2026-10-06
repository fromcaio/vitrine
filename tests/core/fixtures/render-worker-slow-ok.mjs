// Worker de mentira: aceita o texto depois de 150 ms (para as provas de fila, sem custo real de renderização).
import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ id }) => setTimeout(() => parentPort.postMessage({ id, ok: true }), 150));
parentPort.postMessage({ type: "ready" });
