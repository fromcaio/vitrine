// Proposta 7: revalidação por espaço (/a e /b), medida pelo cabeçalho x-nextjs-cache e pelos carimbos.
// Pré-requisito: o mini-aplicativo (.rfc-tmp/e7-app) compilado e em execução na porta 3221.
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3221";
const APP_DIR = path.resolve(import.meta.dirname, "e7-app", ".next", "server", "app");

async function get(p) {
  const res = await fetch(`${BASE}${p}`);
  const html = (await res.text()).replaceAll("<!-- -->", "");
  const stamps = Object.fromEntries([...html.matchAll(/\[\[(root|portal|layout|home|doc|tagged):([^\]]*?):?(\d+)\]\]/g)].map((m) => [`${m[1]}:${m[2]}`, Number(m[3])]));
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
  return { status: res.status, cache: res.headers.get("x-nextjs-cache") ?? "-", stamps, title };
}
const rv = async (query) => (await fetch(`${BASE}/api/rv?${query}`)).json();
const PAGES = ["/", "/a", "/a/x", "/a/y/z", "/b", "/b/x"];
const snapshot = async () => Object.fromEntries(await Promise.all(PAGES.map(async (p) => [p, await get(p)])));

/** Chama a revalidação e compara dois instantâneos sucessivos: o que foi regenerado e o que não. */
async function trial(label, query) {
  const before = await snapshot(); // garante páginas em cache e carimbos conhecidos
  const before2 = await snapshot();
  await rv(query);
  const after = await snapshot();
  const changed = [], same = [];
  for (const p of PAGES) {
    const novo = JSON.stringify(before2[p].stamps) !== JSON.stringify(after[p].stamps);
    (novo ? changed : same).push(`${p}`);
  }
  console.log(`\n### ${label}\n  regeneradas: ${changed.join(" ") || "(nenhuma)"}\n  intactas:    ${same.join(" ") || "(nenhuma)"}\n  cabeçalho:   ${PAGES.map((p) => `${p}=${after[p].cache}`).join(" ")}`);
  return { before2, after };
}

console.log("### 7.0 primeira visita a cada página (geradas sob demanda; generateStaticParams devolve [])");
for (const p of PAGES) {
  const r = await get(p);
  console.log(`  ${p.padEnd(8)} ${r.status} cache=${r.cache}`);
}

await trial('7.1 revalidatePath("/a", "layout")', "path=/a&type=layout");
await trial('7.1b revalidatePath("/a/[...slug]", "page")  [padrão misto]', "path=/a/%5B...slug%5D&type=page");
await trial('7.1c revalidatePath("/[handle]/[...slug]", "page")  [documentos de TODOS os espaços]', "path=/%5Bhandle%5D/%5B...slug%5D&type=page");
await trial('7.2 revalidatePath("/a/x")  [caminho literal, sem tipo]', "path=/a/x");
await trial('7.3 revalidatePath("/a", "page")  [literal com tipo page]', "path=/a&type=page");
await trial('7.3b revalidatePath("/a")  [literal sem tipo]', "path=/a");
await trial('7.4 revalidatePath("/[handle]", "layout")  [padrão dinâmico: todos os espaços]', "path=/%5Bhandle%5D&type=layout");
await trial('7.5 revalidatePath("/", "page")  [só o portal]', "path=/&type=page");
await trial('7.6 revalidatePath("/", "layout")  [layout raiz]', "path=/&type=layout");
await trial('7.8 revalidateTag("space:a", "max")  [dados com etiqueta via unstable_cache]', "tag=space:a&profile=max");
await trial('7.8b revalidateTag("space:a", { expire: 0 })', "tag=space:a&profile=now");

// 7.7 404 em cache: um handle que ainda não existe
const z1 = await get("/zeta"), z2 = await get("/zeta"), z3 = await get("/zeta/doc");
console.log(`\n### 7.7 handle inexistente /zeta: 1ª=${z1.status} ${z1.cache} | 2ª=${z2.status} ${z2.cache} | /zeta/doc=${z3.status} ${z3.cache}`);
await rv("add=zeta");
console.log(`  criado no "banco", SEM revalidar: /zeta=${(await get("/zeta")).status} (${(await get("/zeta")).cache})`);
await rv("path=/zeta&type=layout");
console.log(`  revalidatePath("/zeta","layout"): /zeta=${(await get("/zeta")).status} (${(await get("/zeta")).cache})`);
await rv("path=/zeta");
const z5 = await get("/zeta");
console.log(`  revalidatePath("/zeta")  [literal]: /zeta=${z5.status} ${z5.cache} -> ${(await get("/zeta")).status} ${(await get("/zeta")).cache} | /zeta/doc ainda ${(await get("/zeta/doc")).status} ${(await get("/zeta/doc")).cache}`);
await rv("path=/zeta/doc");
console.log(`  revalidatePath("/zeta/doc")  [literal]: /zeta/doc=${(await get("/zeta/doc")).status} ${(await get("/zeta/doc")).cache}`);

// 7.11 custo de invalidar um espaço inteiro por caminhos literais
const costs = {};
for (const n of [100, 500, 2000]) costs[`${n} chamadas`] = `${(await rv(`loop=${n}&base=/a/p`)).ms} ms`;
console.log("\n### 7.11 custo de N chamadas de revalidatePath literal (num Route Handler)", JSON.stringify(costs));

// 7.12 404 em cache: crescimento em disco por URLs aleatórias
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
const hdrs = new Set();
for (let i = 0; i < 200; i++) hdrs.add((await get(`/lixo-${i}`)).cache);
const s1 = treeStats(APP_DIR);
for (let i = 0; i < 200; i++) hdrs.add("dyn:" + (await get(`/dyn-${i}`)).cache);
const s2 = treeStats(APP_DIR);
console.log("\n### 7.12 200 URLs inexistentes em /lixo-N (404 com notFound() no layout) e 200 em /dyn-N (connection() antes do notFound)");
console.log(`  antes ${JSON.stringify(s0)} | depois dos /lixo-N ${JSON.stringify(s1)} | depois dos /dyn-N ${JSON.stringify(s2)}`);
console.log(`  cabeçalhos vistos: ${[...hdrs].join(", ")}`);
const l1 = await get("/lixo-5"), l2 = await get("/dyn-5");
console.log(`  /lixo-5 de novo: ${l1.status} ${l1.cache} | /dyn-5 de novo: ${l2.status} ${l2.cache}`);

// 7.9 títulos
console.log("\n### 7.9 títulos (generateMetadata em [handle]/layout)", JSON.stringify({ "/a": (await get("/a")).title, "/b": (await get("/b")).title }));

// 7.10 o caminho que o Route Handler recebe
console.log("\n### 7.10 caminho entregue ao Route Handler /api/echo/[...all]");
for (const p of ["/api/echo/a/b", "/api/echo/a/../b", "/api/echo/a/%2e%2e/b", "/api/echo//a//b", "/api/echo/a%2fb", "/api/echo/A/B", "/api/echo/a/b/", "/api/echo/a/./b"]) {
  const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
  let body;
  try { body = JSON.stringify((await res.json()).pathname); } catch { body = `redireciona para ${res.headers.get("location")}`; }
  console.log(`  ${p.padEnd(26)} -> ${res.status} ${body}`);
}
