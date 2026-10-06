// Worker de mentira: morre com uma exceção não tratada ao receber um texto.
import { parentPort } from "node:worker_threads";

parentPort.on("message", () => {
  throw new Error("o worker morreu");
});
parentPort.postMessage({ type: "ready" });
