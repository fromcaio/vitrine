// ensaio-autorizacao.mjs -- ensaio adversarial HTTP do Arquiteto contra o BUILD DE PRODUÇÃO (84 verificações do M-013).
// Uso: bash doc/revisao/ensaio-http.sh <worktree-de-revisão>   (sobe o app com banco novo e roda este arquivo).
// Cobre: rotas brutas do better-auth, origem alheia, senha provisória, acesso cruzado entre dois usuários,
// authorId forjado, lote misto, RN18, corpo grande, suspensão, último administrador e taxa.
// Ao integrar mudanças de contrato (por exemplo, a Parte 2 da A-014: moderação, DELETE de usuário 200),
// ajuste as expectativas correspondentes AQUI, no mesmo commit docs/chore do Arquiteto.
const B = process.env.ENSAIO_URL ?? "http://127.0.0.1:3100";
class Jar { c = new Map(); set(res){ for (const l of res.headers.getSetCookie?.() ?? []) { const [kv]=l.split(";"); const i=kv.indexOf("="); this.c.set(kv.slice(0,i), kv.slice(i+1)); } } get h(){ return [...this.c].map(([k,v])=>`${k}=${v}`).join("; "); } }
async function call(jar, method, path, body, extra = {}) {
  const headers = { origin: B, ...(jar ? { cookie: jar.h } : {}), ...extra };
  if (body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetch(B + path, { method, headers, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)), redirect: "manual" });
  jar?.set(res);
  let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log((cond ? "OK   " : "FALHA") + " " + name + (cond ? "" : "  -> " + extra)); };
const code = (r) => r.json?.error?.code;

const admin = new Jar(), bob = new Jar(), anon = null;
let r = await call(admin, "POST", "/api/auth/sign-in/email", { email: "admin@exemplo.test", password: "senha-admin-ficticia-1" });
check("admin entra", r.status === 200, r.text);
// --- catch-all: rotas brutas fechadas
for (const [m, p] of [["POST","/api/auth/sign-up/email"],["GET","/api/auth/admin/list-users"],["POST","/api/auth/admin/set-role"],["POST","/api/auth/admin/create-user"],["POST","/api/auth/admin/remove-user"],["POST","/api/auth/change-password"],["GET","/api/auth/list-sessions"],["POST","/api/auth/update-user"],["POST","/api/auth/admin/impersonate-user"],["GET","/api/auth/get-session/"],["POST","/api/auth/sign-in/email/"],["GET","/api/auth//get-session"],["GET","/api/auth/GET-SESSION"],["POST","/api/auth/sign-out;x"]]) {
  r = await call(admin, m, p, m === "POST" ? {} : undefined);
  check(`rota bruta ${m} ${p} -> 404 (ou 308 para a rota canônica)`, r.status === 404 || r.status === 308, `${r.status} ${r.text.slice(0,80)}`);
}
r = await call(admin, "GET", "/api/auth/get-session"); check("get-session permitido", r.status === 200 && r.json?.user?.email === "admin@exemplo.test", r.text.slice(0,100));
// --- origem
r = await call(admin, "POST", "/api/contents", { title: "x", slug: "x", type: "DOCUMENT" }, { origin: "https://evil.example" }); check("mutação de outra origem -> 401", r.status === 401, r.status);
r = await call(null, "GET", "/api/contents"); check("sem sessão -> 401", r.status === 401);
// --- admin cria conta
r = await call(admin, "POST", "/api/users", { email: "bob@exemplo.test", name: "Bob", handle: "bob", role: "user" });
check("admin cria usuário (201)", r.status === 201, r.text.slice(0,200));
const bobId = r.json?.data?.id ?? r.json?.data?.user?.id; const temp = r.json?.data?.temporaryPassword ?? r.json?.data?.password ?? r.json?.temporaryPassword;
console.log("   resposta da criação (chaves):", Object.keys(r.json?.data ?? {}).join(","), "| senha provisória:", temp ? `${temp.length} caracteres` : "AUSENTE");
check("senha provisória de 16 caracteres", typeof temp === "string" && temp.length === 16, String(temp));
r = await call(admin, "POST", "/api/users", { email: "bob@exemplo.test", name: "Bob2", handle: "bob2", role: "user" }); check("e-mail repetido -> 409 USER_CONFLICT", r.status === 409 && code(r) === "USER_CONFLICT", r.text.slice(0,150));
for (const h of ["admin","api","login","logout","Bob","a","x-","a--b"]) { r = await call(admin, "POST", "/api/users", { email: `h${Math.random().toString(36).slice(2)}@exemplo.test`, name: "H", handle: h, role: "user" }); check(`handle inválido/reservado "${h}" recusado`, r.status === 422 || r.status === 409, `${r.status} ${r.text.slice(0,100)}`); }
// --- Bob com senha provisória
r = await call(bob, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: temp }); check("Bob entra com a provisória", r.status === 200, r.text.slice(0,100));
r = await call(bob, "GET", "/api/contents"); check("provisória bloqueia /api/contents (403 PASSWORD_CHANGE_REQUIRED)", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED", `${r.status} ${r.text.slice(0,100)}`);
r = await call(bob, "POST", "/api/contents", { title: "x", slug: "x", type: "DOCUMENT" }); check("provisória bloqueia criar conteúdo", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED");
r = await call(bob, "GET", "/api/users/me"); check("provisória permite ler o perfil", r.status === 200, r.text.slice(0,100));
r = await call(bob, "PUT", "/api/appearance", { siteName: "z" }); check("provisória bloqueia aparência", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED");
r = await call(bob, "POST", "/api/users/me/password", { current: temp, next: temp }); check("troca recusa senha igual", r.status >= 400, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "POST", "/api/users/me/password", { current: temp, next: "senha-bob-definitiva-9" }); check("Bob troca a senha", r.status === 200 || r.status === 204, `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "GET", "/api/contents"); check("depois da troca, libera", r.status === 200, `${r.status} ${r.text.slice(0,100)}`);
// --- conteúdo e dono
r = await call(admin, "POST", "/api/contents", { title: "Do admin", slug: "do-admin", type: "COLLECTION" }); check("admin cria coleção", r.status === 201, r.text.slice(0,150)); const aId = r.json?.data?.id;
r = await call(admin, "POST", "/api/contents", { title: "Doc admin", slug: "doc", type: "DOCUMENT", parentId: aId, body: "oi" }); const aDoc = r.json?.data?.id;
r = await call(bob, "POST", "/api/contents", { title: "Do Bob", slug: "do-admin", type: "DOCUMENT", body: "texto do bob" }); check("mesmo slug na raiz de outro dono é permitido", r.status === 201, r.text.slice(0,150)); const bId = r.json?.data?.id; const bVer = r.json?.data?.updatedAt;
r = await call(bob, "POST", "/api/contents", { title: "Filho", slug: "f", type: "DOCUMENT", parentId: aId }); check("pai de outro dono -> 422 INVALID_PARENT", r.status === 422 && code(r) === "INVALID_PARENT", `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "POST", "/api/contents", { title: "Forjado", slug: "forj", type: "DOCUMENT", authorId: "u1" }); check("authorId no corpo não vale (dono = sessão)", r.status === 201 || r.status === 422, `${r.status}`); if (r.status === 201) { const own = (await call(bob, "GET", `/api/contents/${r.json.data.id}`)).json?.data?.authorId; check("  e o dono gravado é o Bob", own === bobId, own); }
for (const [m, p, b, nome] of [["GET", `/api/contents/${aId}`, undefined, "Bob lê conteúdo do admin"], ["PATCH", `/api/contents/${aId}`, { title: "hack" }, "Bob altera conteúdo do admin"], ["DELETE", `/api/contents/${aId}`, undefined, "Bob exclui conteúdo do admin"], ["PATCH", `/api/contents/${aDoc}`, { body: "x", version: "2026-01-01T00:00:00.000Z" }, "Bob altera corpo do admin"]]) { r = await call(bob, m, p, b); check(`${nome} -> 403`, r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${r.text.slice(0,100)}`); }
r = await call(bob, "PATCH", "/api/contents/reorder", [{ id: bId, order: 5 }, { id: aId, order: 9 }]); check("lote misto -> recusado por inteiro", r.status === 403 || r.status === 404 || r.status === 422, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "GET", "/api/contents"); check("Bob lista só a árvore dele", r.status === 200 && JSON.stringify(r.json).indexOf(aId) === -1, r.text.slice(0,200));
// moderação (Parte 1): admin lê, não escreve no alheio
r = await call(admin, "GET", `/api/contents/${bId}`); check("admin lê conteúdo do Bob", r.status === 200, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" }); check("admin altera conteúdo do Bob -> 403 (moderação é da Parte 2)", r.status === 403, `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "DELETE", `/api/contents/${bId}`); check("admin exclui conteúdo do Bob -> 403 (Parte 2)", r.status === 403, `${r.status}`);
r = await call(admin, "GET", `/api/contents?ownerId=${bobId}`); check("admin lista a árvore do Bob (?ownerId)", r.status === 200 && JSON.stringify(r.json).includes(bId), `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "GET", `/api/contents?ownerId=${bobId}`); check("usuário comum não usa ?ownerId alheio", r.status === 200 || r.status === 403, `${r.status}`);
r = await call(bob, "GET", `/api/contents?ownerId=${(await call(admin,"GET","/api/users/me")).json?.data?.id}`); check("Bob com ?ownerId do admin não vê a árvore do admin", r.status === 403 || JSON.stringify(r.json).indexOf(aId) === -1, `${r.status} ${r.text.slice(0,150)}`);
// RN18
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo" }); check("PATCH do corpo sem version -> 422", r.status === 422, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo", version: "2020-01-01T00:00:00.000Z" }); check("version desatualizada -> 409 VERSION_CONFLICT", r.status === 409 && code(r) === "VERSION_CONFLICT" && !!r.json?.error?.details?.[0]?.value, `${r.status} ${r.text.slice(0,200)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo", version: bVer }); check("version correta -> 200", r.status === 200, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "outra", version: bVer }); check("reuso da versão antiga -> 409", r.status === 409, `${r.status}`);
// cotas e corpo
r = await call(bob, "POST", "/api/contents", { title: "Grande", slug: "grande", type: "DOCUMENT", body: "a".repeat(300 * 1024) }); check("corpo > 256 KiB -> 413 ou 422", r.status === 413 || r.status === 422, `${r.status}`);
r = await call(bob, "POST", "/api/contents", "x".repeat(2 * 1024 * 1024), { "content-type": "application/json" }); check("corpo de 2 MiB -> 413", r.status === 413, `${r.status}`);
const adminIdEarly = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
// usuários: comum
for (const [m, p, b, nome] of [["GET","/api/users",undefined,"Bob lista usuários"],["POST","/api/users",{ email: "e@exemplo.test", name: "E", handle: "eee", role: "admin" },"Bob cria conta admin"],["GET",`/api/users/${adminIdEarly}`,undefined,"Bob lê o usuário do admin"],["PATCH",`/api/users/${bobId}`,{ role: "admin" },"Bob se promove a admin"],["PUT",`/api/users/${bobId}/password`,{ password: "x".repeat(10) },"Bob redefine senha"],["POST",`/api/users/${bobId}/ban`,{ reason: "x" },"Bob suspende alguém"],["DELETE",`/api/users/${bobId}`,undefined,"Bob exclui usuário"],["PUT","/api/configuration",{ siteName: "hack" },"Bob altera o site"],["GET","/api/configuration",undefined,"Bob lê o site"]]) { r = await call(bob, m, p, b); check(`${nome} -> 403`, r.status === 403, `${r.status} ${r.text.slice(0,100)}`); }
r = await call(bob, "GET", "/api/users/idinexistente123"); check("Bob consulta usuário inexistente -> 403 (sem enumerar)", r.status === 403, `${r.status}`);
r = await call(bob, "PATCH", "/api/users/me", { role: "admin", name: "Bob B" }); check("PATCH /me ignora role ou recusa", r.status === 200 || r.status === 422, `${r.status}`);
const me = (await call(bob, "GET", "/api/users/me")).json?.data; check("Bob continua 'user'", me?.role === "user", JSON.stringify(me));
// aparência
r = await call(bob, "PUT", "/api/appearance", { siteName: "Espaço do Bob", primaryColor: "#112233" }); check("Bob grava a própria aparência", r.status === 200, `${r.status} ${r.text.slice(0,150)}`);
r = await call(admin, "GET", "/api/appearance"); check("admin lê a própria aparência (não a do Bob)", r.status === 200 && r.json?.data?.siteName !== "Espaço do Bob", r.text.slice(0,150));
// suspensão
r = await call(admin, "POST", `/api/users/${bobId}/ban`, {}); check("suspender sem motivo -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "POST", `/api/users/${bobId}/ban`, { reason: "Violação das diretrizes" }); check("admin suspende o Bob", r.status === 200 || r.status === 204, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "GET", "/api/contents"); check("sessão do Bob revogada/suspensa -> 401", r.status === 401, `${r.status}`);
r = await call(null, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: "senha-bob-definitiva-9" }); check("login suspenso -> 403 BANNED_USER com motivo", r.status === 403 && /BANNED/.test(JSON.stringify(r.json)) && /Viola/.test(r.text), `${r.status} ${r.text.slice(0,200)}`);
r = await call(admin, "DELETE", `/api/users/${bobId}/ban`); check("admin reativa", r.status === 200 || r.status === 204, `${r.status}`);
// último administrador
const adminId = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
r = await call(admin, "POST", `/api/users/${adminId}/ban`, { reason: "auto" }); check("admin não suspende a si (único)", r.status === 409 || r.status === 403, `${r.status} ${code(r)}`);
r = await call(admin, "DELETE", `/api/users/${adminId}`); check("admin não exclui a si (único)", r.status === 409 || r.status === 403, `${r.status} ${code(r)}`);
r = await call(admin, "PATCH", `/api/users/${adminId}`, { role: "user" }); check("admin não se rebaixa (único)", r.status === 409 || r.status === 403, `${r.status} ${code(r)}`);
// excluir usuário com conteúdo
r = await call(admin, "DELETE", `/api/users/${bobId}`); check("excluir usuário com conteúdo sem escolha -> 409 USER_HAS_CONTENT", r.status === 409 && code(r) === "USER_HAS_CONTENT", `${r.status} ${r.text.slice(0,120)}`);
// taxa
let limited = 0, retry = null; for (let i = 0; i < 75; i++) { r = await call(admin, "POST", "/api/contents", { title: "t"+i, slug: "t"+i, type: "DOCUMENT" }); if (r.status === 429) { limited++; retry = r.headers.get("retry-after"); } }
check("limite de taxa de escrita (429 + Retry-After)", limited > 0 && !!retry, `limitadas=${limited} retry=${retry}`);
console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas`);
