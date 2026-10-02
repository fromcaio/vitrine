// Proposta 7 / risco 10: 404 guardados em cache e a mitigação por Proxy (mini-aplicativo com E7_PROXY=1).
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3221";
const APP_DIR = path.resolve(import.meta.dirname, "e7-app", ".next", "server", "app");
const get = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  await res.text();
  return { status: res.status, cache: res.headers.get("x-nextjs-cache") ?? "-" };
};
function treeStats(dir) {
  let files = 0, bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { files++; bytes += fs.statSync(f).size; }
    }
  };
  walk(dir);
  return { files, kB: Math.round(bytes / 1024) };
}
const s0 = treeStats(APP_DIR);
const seen = new Map();
for (let i = 0; i < 200; i++) {
  const r = await get(`/lixo-${i}`);
  seen.set(`${r.status} ${r.cache}`, (seen.get(`${r.status} ${r.cache}`) ?? 0) + 1);
}
const s1 = treeStats(APP_DIR);
console.log("### 7b.1 com o Proxy: 200 URLs /lixo-N (handle inexistente)");
console.log(`  respostas: ${[...seen].map(([k, v]) => `${v}× ${k}`).join(", ")}`);
console.log(`  disco antes ${JSON.stringify(s0)} | depois ${JSON.stringify(s1)}`);

console.log("### 7b.2 o que continua funcionando");
for (const p of ["/", "/a", "/a/x", "/b/x", "/api/rv?x=1"]) console.log(`  ${p.padEnd(14)} ${JSON.stringify(await get(p))} ${JSON.stringify(await get(p))}`);

// a criação de um handle novo não precisa mais invalidar um 404 que nunca foi guardado
await fetch(`${BASE}/api/rv?add=novo`);
console.log("### 7b.3 handle criado depois de visitado como inexistente (sem revalidar nada)");
console.log(`  /novo ${JSON.stringify(await get("/novo"))} ${JSON.stringify(await get("/novo"))}`);

// o caso que o Proxy não cobre: documento inexistente dentro de um espaço que existe
const t0 = treeStats(APP_DIR);
for (let i = 0; i < 200; i++) await get(`/a/inexistente-${i}`);
console.log("### 7b.4 200 documentos inexistentes dentro de /a (handle existente): o Proxy não os impede");
console.log(`  disco antes ${JSON.stringify(t0)} | depois ${JSON.stringify(treeStats(APP_DIR))}`);
