// Proposta 9: cotas (conteúdos e bytes), leitura limitada do corpo e custo do hash de senha.
import { PASSWORD, boot, log, request, signIn } from "./lib/poc.mjs";

const { auth, prisma } = await boot("e9", { plugins: ({ admin }) => [admin({ defaultRole: "user", adminRoles: ["admin"] })] });
const ana = (await auth.api.createUser({ body: { email: "ana@exemplo.test", name: "Ana", password: PASSWORD } })).user;
const MAX = 10;

// ---------- 9.1 cota de conteúdos: contar e inserir em transação interativa, 30 tentativas simultâneas ----------
let seq = 0;
const attemptTx = async () => {
  const slug = `t-${++seq}`;
  try {
    await prisma.$transaction(async (tx) => {
      const n = await tx.content.count({ where: { authorId: ana.id } });
      if (n >= MAX) throw new Error("QUOTA");
      await tx.content.create({ data: { title: slug, slug, type: "DOCUMENT", authorId: ana.id } });
    });
    return "ok";
  } catch (e) {
    return e.message === "QUOTA" ? "cota" : `erro:${String(e.message).slice(0, 40)}`;
  }
};
const tx = await Promise.all(Array.from({ length: 30 }, attemptTx));
log(`9.1 30 criações simultâneas, cota ${MAX}, contagem + criação na MESMA transação interativa`, { criados: tx.filter((r) => r === "ok").length, recusados: tx.filter((r) => r === "cota").length, outros: tx.filter((r) => r.startsWith("erro")).length, linhasNoBanco: await prisma.content.count({ where: { authorId: ana.id } }) });

await prisma.content.deleteMany();
const attemptSql = async () => {
  const slug = `s-${++seq}`;
  const n = await prisma.$executeRaw`INSERT INTO contents (id, title, slug, type, status, "order", authorId, createdAt, updatedAt)
    SELECT ${`id-${slug}`}, ${slug}, ${slug}, 'DOCUMENT', 'PUBLISHED', 0, ${ana.id}, strftime('%s','now') * 1000, strftime('%s','now') * 1000
    WHERE (SELECT count(*) FROM contents WHERE authorId = ${ana.id}) < ${MAX}`;
  return n === 1 ? "ok" : "cota";
};
const sql = await Promise.all(Array.from({ length: 30 }, attemptSql));
log("9.1b o mesmo, com INSERT ... SELECT ... WHERE (contagem) < cota, em um único comando", { criados: sql.filter((r) => r === "ok").length, recusados: sql.filter((r) => r === "cota").length, linhasNoBanco: await prisma.content.count({ where: { authorId: ana.id } }) });

// ---------- 9.2 bytes: length() conta caracteres, o limite é em bytes ----------
const kib = 256 * 1024;
const samples = { "ASCII 256 KiB": "a".repeat(kib), "'é' 131072 vezes (256 KiB em UTF-8, 131072 caracteres)": "é".repeat(kib / 2), "emoji de 4 bytes 65536 vezes": "😀".repeat(kib / 4), "ASCII 256 KiB + 1": "a".repeat(kib + 1) };
const counts = {};
for (const [label, text] of Object.entries(samples)) counts[label] = { caracteres: text.length, codePoints: [...text].length, bytes: Buffer.byteLength(text, "utf8"), excede: Buffer.byteLength(text, "utf8") > kib };
log("9.2 tamanho do corpo: String.length × Buffer.byteLength (limite 256 KiB)", counts);
await prisma.content.create({ data: { title: "acentos", slug: "acentos", type: "DOCUMENT", authorId: ana.id, body: "é".repeat(1000) } });
log("9.2b SQLite length() × bytes", (await prisma.$queryRaw`SELECT length(body) AS caracteres, length(CAST(body AS BLOB)) AS bytes FROM contents WHERE slug = 'acentos'`));

// ---------- 9.3 leitura do corpo com limite (antes de analisar o JSON) ----------
async function readJsonLimited(req, maxBytes) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { status: 413, motivo: "Content-Length acima do limite" };
  const reader = req.body?.getReader();
  if (!reader) return { status: 400, motivo: "sem corpo" };
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { status: 413, motivo: `corpo acima do limite (lido até ${total} bytes)` };
    }
    chunks.push(value);
  }
  try {
    return { status: 200, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { status: 400, motivo: "JSON malformado" };
  }
}
const LIMIT = 2 * kib + 64 * 1024; // corpo máximo + metadados: 2 vezes, porque o JSON escapa caracteres
const mk = (body, headers = {}, stream = false) => {
  const init = { method: "POST", headers: { "content-type": "application/json", ...headers } };
  if (stream) {
    init.body = new ReadableStream({ start(c) { for (let i = 0; i < body.chunks; i++) c.enqueue(new Uint8Array(body.size).fill(97)); c.close(); } });
    init.duplex = "half";
  } else init.body = body;
  return new Request("http://localhost:3000/api/contents", init);
};
const big = JSON.stringify({ body: "a".repeat(5 * 1024 * 1024) });
const out = {};
out["corpo pequeno válido"] = (await readJsonLimited(mk(JSON.stringify({ body: "ok" })), LIMIT)).status;
out["5 MiB com Content-Length (recusado sem ler)"] = JSON.stringify(await readJsonLimited(mk(big, { "content-length": String(Buffer.byteLength(big)) }), LIMIT));
out["50 MiB em pedaços, SEM Content-Length (recusado ao passar do limite)"] = JSON.stringify(await readJsonLimited(mk({ chunks: 50, size: 1024 * 1024 }, {}, true), LIMIT));
out["JSON malformado pequeno"] = (await readJsonLimited(mk("{ body: "), LIMIT)).status;
log("9.3 readJsonLimited (limite de transporte ≈ 2×256 KiB + 64 KiB)", out);

// ---------- 9.4 custo do hash de senha e efeito sobre o resto do servidor ----------
const time = async (fn) => { const t = performance.now(); await fn(); return Math.round(performance.now() - t); };
const hashMs = [];
for (let i = 0; i < 3; i++) hashMs.push(await time(() => signIn(auth, "ana@exemplo.test", "senha-errada-123", { ip: `10.20.0.${i + 1}` })));
log("9.4 uma tentativa de login com senha errada (ms; cada IP distinto)", hashMs);
const sAna = await signIn(auth, "ana@exemplo.test");
const quick = async () => time(() => request(auth, "/get-session", { method: "GET", cookie: sAna.cookie }));
const idle = [await quick(), await quick(), await quick()];
const heavy = Array.from({ length: 8 }, (_, i) => signIn(auth, "ana@exemplo.test", "senha-errada-123", { ip: `10.21.0.${i + 1}` }));
const during = [];
const probe = (async () => { for (let i = 0; i < 6; i++) { during.push(await quick()); } })();
const t0 = performance.now();
await Promise.all([...heavy, probe]);
log("9.4b get-session (ms) com o servidor ocioso × durante 8 tentativas de login de IPs diferentes", { ocioso: idle, durante: during, totalDasOitoTentativasMs: Math.round(performance.now() - t0) });
process.exit(0);
