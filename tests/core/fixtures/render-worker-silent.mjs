// Worker de mentira: pronto, mas nunca responde (um laço que não termina).
import { parentPort } from "node:worker_threads";

parentPort.on("message", () => {
  for (;;);
});
parentPort.postMessage({ type: "ready" });
