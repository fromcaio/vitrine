// ensaio-autorizacao.mjs -- ensaio adversarial HTTP do Arquiteto contra o BUILD DE PRODUÇÃO (M-013 a M-024: autorização, moderação, notificações, contraste, layouts, editor, espaços públicos, Proxy e senha provisória).
// Uso: bash doc/revisao/ensaio-http.sh <worktree-de-revisão>   (sobe o app com banco novo e roda este arquivo).
// Cobre: rotas brutas do better-auth, origem alheia, senha provisória, acesso cruzado entre dois usuários,
// authorId forjado, lote misto, RN18, corpo grande, suspensão, último administrador e taxa.
// Ao integrar mudanças de contrato, ajuste as expectativas correspondentes AQUI, no mesmo ciclo do Arquiteto.
// M-015 (A-014 Parte 2): moderação com motivo, notificações, auto-ações 403, DELETE de usuário 200 com resumo.
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Espera o ESTADO (uma leitura pública logo depois de uma escrita pode ser a versão em cache enquanto a página regenera).
const until = async (fn, ok, tries = 25) => { let last; for (let i = 0; i < tries; i++) { last = await fn(); if (ok(last)) return last; await sleep(200); } return last; };
// Escrita que respeita o limite de taxa (429, RN25): espera o Retry-After e repete. Sem isso, a leitura seguinte a um PATCH recusado mostra o estado antigo e parece um defeito do cache.
let esperasDoLimite = 0;
// Login que espera o limite do better-auth (5 por minuto por IP em /sign-in/email, RNF03) em vez de seguir sem sessão.
const login = async (jar, email, password) => { for (;;) { const x = await call(jar, "POST", "/api/auth/sign-in/email", { email, password }); if (x.status !== 429) return x; esperasDoLimite++; await sleep((Number(x.headers.get("retry-after")) || 1) * 1000 + 300); } };
const write = async (jar, method, path, body) => { for (;;) { const x = await call(jar, method, path, body); if (x.status !== 429) return x; esperasDoLimite++; await sleep((Number(x.headers.get("retry-after")) || 1) * 1000 + 200); } };
// Primeira leitura depois de uma escrita ACEITA (200): se vier a versão velha (a revalidação chega alguns ms depois), espera o estado e registra o atraso (info no fim; achado do M-043: 33 a 249 ms, nos dois sentidos).
const atrasos = [];
const settled = async (path, ok, rotulo) => { const t0 = Date.now(); let x = await call(null, "GET", path); if (ok(x)) return x; const c0 = x.headers.get("x-nextjs-cache"); x = await until(() => call(null, "GET", path), ok, 50); atrasos.push({ rotulo, ms: Date.now() - t0, cache: c0, ok: ok(x) }); return x; };

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
r = await write(admin, "POST", "/api/users", { email: "bob@exemplo.test", name: "Bob", handle: "bob", role: "user" });
check("admin cria usuário (201)", r.status === 201, r.text.slice(0,200));
const bobId = r.json?.data?.id ?? r.json?.data?.user?.id; const temp = r.json?.data?.temporaryPassword ?? r.json?.data?.password ?? r.json?.temporaryPassword;
console.log("   resposta da criação (chaves):", Object.keys(r.json?.data ?? {}).join(","), "| senha provisória:", temp ? `${temp.length} caracteres` : "AUSENTE");
check("senha provisória de 16 caracteres", typeof temp === "string" && temp.length === 16, String(temp));
r = await write(admin, "POST", "/api/users", { email: "bob@exemplo.test", name: "Bob2", handle: "bob2", role: "user" }); check("e-mail repetido -> 409 USER_CONFLICT", r.status === 409 && code(r) === "USER_CONFLICT", r.text.slice(0,150));
for (const h of ["admin","api","login","logout","Bob","a","x-","a--b"]) { r = await write(admin, "POST", "/api/users", { email: `h${Math.random().toString(36).slice(2)}@exemplo.test`, name: "H", handle: h, role: "user" }); check(`handle inválido/reservado "${h}" recusado`, r.status === 422 || r.status === 409, `${r.status} ${r.text.slice(0,100)}`); }
// --- Bob com senha provisória
r = await call(bob, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: temp }); check("Bob entra com a provisória", r.status === 200, r.text.slice(0,100));
r = await call(bob, "GET", "/api/contents"); check("provisória bloqueia /api/contents (403 PASSWORD_CHANGE_REQUIRED)", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED", `${r.status} ${r.text.slice(0,100)}`);
r = await call(bob, "POST", "/api/contents", { title: "x", slug: "x", type: "DOCUMENT" }); check("provisória bloqueia criar conteúdo", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED");
r = await call(bob, "GET", "/api/users/me"); check("provisória permite ler o perfil", r.status === 200, r.text.slice(0,100));
r = await call(bob, "GET", "/admin"); check("senha provisória: /admin redireciona a /admin/senha (sem laço)", (r.status === 307 || r.status === 302 || r.status === 308) && /\/admin\/senha/.test(r.headers.get("location") ?? ""), `${r.status} ${r.headers.get("location")}`);
r = await call(bob, "GET", "/admin/conteudo/novo"); check("senha provisória: o editor também leva à troca, com o destino", (r.status === 307 || r.status === 302 || r.status === 308) && /\/admin\/senha\?redirectTo=/.test(r.headers.get("location") ?? ""), `${r.status} ${r.headers.get("location")}`);
r = await call(bob, "GET", "/admin/senha"); check("senha provisória: /admin/senha abre (200)", r.status === 200, `${r.status}`);
r = await call(bob, "GET", "/admin/senha?redirectTo=https://evil.example/"); check("senha provisória: redirectTo de outro site não chega ao formulário (a propriedade do cliente é /admin)", r.status === 200 && /redirectTo\\":\\"\/admin\\"/.test(r.text), `${r.status}`);
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
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" }); check("moderação sem reason -> 422 VALIDATION_ERROR (campo reason)", r.status === 422 && code(r) === "VALIDATION_ERROR" && JSON.stringify(r.json).includes("reason"), `${r.status} ${r.text.slice(0,120)}`);
r = await call(admin, "DELETE", `/api/contents/${bId}`); check("exclusão alheia sem ?reason -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "GET", `/api/contents?ownerId=${bobId}`); check("admin lista a árvore do Bob (?ownerId)", r.status === 200 && JSON.stringify(r.json).includes(bId), `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "GET", `/api/contents?ownerId=${bobId}`); check("usuário comum não usa ?ownerId alheio", r.status === 200 || r.status === 403, `${r.status}`);
r = await call(bob, "GET", `/api/contents?ownerId=${(await call(admin,"GET","/api/users/me")).json?.data?.id}`); check("Bob com ?ownerId do admin não vê a árvore do admin", r.status === 403 || JSON.stringify(r.json).indexOf(aId) === -1, `${r.status} ${r.text.slice(0,150)}`);
// RN18
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo" }); check("PATCH do corpo sem version -> 422", r.status === 422, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo", version: "2020-01-01T00:00:00.000Z" }); check("version desatualizada -> 409 VERSION_CONFLICT", r.status === 409 && code(r) === "VERSION_CONFLICT" && !!r.json?.error?.details?.[0]?.value, `${r.status} ${r.text.slice(0,200)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "novo", version: bVer }); check("version correta -> 200", r.status === 200, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: "outra", version: bVer }); check("reuso da versão antiga -> 409", r.status === 409, `${r.status}`);
// --- moderação (M-015): o administrador age no conteúdo do Bob, com motivo; o dono é avisado
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT", reason: "   " }); check("moderar com reason só de espaços -> 422", r.status === 422, `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT", reason: "" }); check("moderar com reason vazio -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT", reason: "x".repeat(501) }); check("moderar com reason de 501 caracteres -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { reason: "só o motivo" }); check("PATCH só com reason (sem campo) -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { order: 3, reason: "mover" }); check("moderação não reordena o alheio (order) -> 403", r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { parentId: aId, reason: "mover" }); check("moderação não move o alheio (parentId) -> 403", r.status === 403, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { parentId: null, order: 1, status: "DRAFT", reason: "misto" }); check("misto (status + order) com order alheio -> 403 e nada muda", r.status === 403, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { body: "moderado", reason: "limpeza" }); check("moderar o corpo sem version -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { body: "moderado", reason: "limpeza", version: "2020-01-01T00:00:00.000Z" }); check("moderar o corpo com version velha -> 409 VERSION_CONFLICT", r.status === 409 && code(r) === "VERSION_CONFLICT", `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "GET", `/api/contents/${bId}`); check("nenhuma tentativa recusada alterou o conteúdo (continua PUBLISHED)", r.json?.data?.status === "PUBLISHED" && r.json?.data?.body === "novo", r.text.slice(0,150));
r = await call(bob, "GET", "/api/notifications"); check("nenhuma notificação saiu das tentativas recusadas", r.status === 200 && (r.json?.data ?? []).every((n) => n.type !== "MODERATION"), r.text.slice(0,200));
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "DRAFT", reason: "Conteúdo fora das diretrizes" }); check("admin despublica conteúdo do Bob com reason -> 200", r.status === 200 && r.json?.data?.status === "DRAFT", `${r.status} ${r.text.slice(0,120)}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { title: "Do Bob (revisado)", reason: "Título ajustado" }); check("admin edita o título do Bob com reason -> 200", r.status === 200, `${r.status} ${r.text.slice(0,120)}`);
r = await call(admin, "PATCH", `/api/contents/${bId}`, { status: "PUBLISHED", reason: "Revisado e republicado" }); check("admin republica -> 200", r.status === 200, `${r.status}`);
r = await call(bob, "PATCH", `/api/contents/${aDoc}`, { title: "hack", reason: "tentativa" }); check("usuário comum com reason no conteúdo alheio -> 403", r.status === 403, `${r.status}`);
r = await call(bob, "DELETE", `/api/contents/${aDoc}?reason=tentativa`); check("usuário comum exclui alheio com ?reason -> 403", r.status === 403, `${r.status}`);
r = await call(admin, "PATCH", "/api/contents/reorder", [{ id: bId, order: 7 }]); check("administrador não reordena o conteúdo alheio -> 403", r.status === 403, `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "PATCH", `/api/contents/${aId}`, { title: "Do admin (próprio)" }); check("admin edita o próprio conteúdo sem reason -> 200", r.status === 200, `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "GET", "/api/notifications"); check("admin: sem notificação de moderação (a do Bob não é dele)", r.status === 200 && (r.json?.data ?? []).every((n) => n.type !== "MODERATION"), r.text.slice(0,200));
// --- notificações (M-015)
r = await call(bob, "GET", "/api/notifications"); const nAll = r.json?.data ?? [];
check("Bob recebe 3 avisos de moderação, com title e text em português", r.status === 200 && nAll.filter((n) => n.type === "MODERATION").length === 3 && nAll.every((n) => n.title && n.text), `${r.status} ${r.text.slice(0,300)}`);
check("o texto traz o motivo da moderação e a forma pública não expõe userId nem dedupeKey", nAll.some((n) => /fora das diretrizes/.test(n.text)) && nAll.every((n) => !("userId" in n) && !("dedupeKey" in n)), JSON.stringify(nAll[0]));
check("unreadCount = 3", r.json?.unreadCount === 3, String(r.json?.unreadCount));
r = await call(bob, "GET", "/api/notifications?limit=2"); const p1 = r.json?.data ?? [];
check("?limit=2 -> 2 itens e nextCursor", r.status === 200 && p1.length === 2 && typeof r.json?.nextCursor === "string", `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "GET", `/api/notifications?limit=2&cursor=${r.json?.nextCursor}`); const p2 = r.json?.data ?? [];
check("?cursor -> o restante, sem repetir, e nextCursor nulo", r.status === 200 && p2.length === 1 && !p1.some((n) => n.id === p2[0].id) && r.json?.nextCursor === null, `${r.status} ${r.text.slice(0,150)}`);
for (const q of ["limit=0", "limit=101", "limit=abc", "unread=2"]) { r = await call(bob, "GET", `/api/notifications?${q}`); check(`?${q} -> 422`, r.status === 422, `${r.status}`); }
r = await call(admin, "GET", `/api/notifications?cursor=${nAll[0].id}`); check("cursor de notificação ALHEIA -> 422 (A-017) e não vaza as do Bob", r.status === 422 && (r.json?.data ?? []).every((n) => !nAll.some((m) => m.id === n.id)), `${r.status} ${r.text.slice(0,200)}`);
console.log("   cursor alheio ->", r.status, "| itens do admin:", (r.json?.data ?? []).length);
r = await call(bob, "GET", "/api/notifications?cursor=naoexiste123"); check("cursor inexistente -> 422 (A-017)", r.status === 422, `${r.status} ${r.text.slice(0,150)}`);
console.log("   cursor inexistente ->", r.status);
r = await call(null, "GET", "/api/notifications"); check("notificações sem sessão -> 401", r.status === 401, `${r.status}`);
r = await call(bob, "PATCH", `/api/notifications/${nAll[0].id}`, { read: true }, { origin: "https://evil.example" }); check("PATCH de notificação de outra origem -> 401", r.status === 401, `${r.status}`);
r = await call(admin, "PATCH", `/api/notifications/${nAll[0].id}`, { read: true }); check("admin marca como lida a notificação do Bob -> 404", r.status === 404, `${r.status} ${r.text.slice(0,100)}`);
r = await call(admin, "PATCH", `/api/notifications/${nAll[0].id}`, { dismissed: true }); check("admin dispensa a notificação do Bob -> 404", r.status === 404, `${r.status}`);
r = await call(admin, "PATCH", "/api/notifications/idinexistente123", { read: true }); check("notificação inexistente -> 404 (igual à alheia)", r.status === 404, `${r.status}`);
r = await call(admin, "POST", "/api/notifications/read-all"); check("admin read-all: só as dele", r.status === 200, `${r.status} ${r.text.slice(0,100)}`);
r = await call(bob, "GET", "/api/notifications?unread=1"); check("o read-all do admin não leu as do Bob (3 não lidas)", r.json?.data?.length === 3 && r.json?.unreadCount === 3, `${r.status} ${r.text.slice(0,150)}`);
for (const b of [{}, { read: false }, { read: true, dismissed: true }, { lida: true }]) { r = await call(bob, "PATCH", `/api/notifications/${nAll[0].id}`, b); check(`PATCH de notificação com ${JSON.stringify(b)} -> 422`, r.status === 422, `${r.status}`); }
r = await call(bob, "PATCH", `/api/notifications/${nAll[0].id}`, { read: true }); check("Bob marca como lida -> 200 e unreadCount 2", r.status === 200 && r.json?.unreadCount === 2 && r.json?.data?.read === true, `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "PATCH", `/api/notifications/${nAll[0].id}`, { read: true }); check("marcar de novo é idempotente (200)", r.status === 200, `${r.status}`);
r = await call(bob, "PATCH", `/api/notifications/${nAll[1].id}`, { dismissed: true }); check("Bob dispensa -> 200", r.status === 200 && r.json?.data?.dismissed === true, `${r.status} ${r.text.slice(0,150)}`);
r = await call(bob, "GET", "/api/notifications"); check("a dispensada some da lista (restam 2)", (r.json?.data ?? []).length === 2 && !(r.json.data).some((n) => n.id === nAll[1].id), r.text.slice(0,150));
r = await call(bob, "POST", "/api/notifications/read-all"); check("Bob read-all -> 200 e unreadCount 0", r.status === 200 && r.json?.unreadCount === 0, `${r.status} ${r.text.slice(0,120)}`);
r = await call(bob, "GET", "/api/notifications?unread=1"); check("?unread=1 vazio depois do read-all", r.status === 200 && (r.json?.data ?? []).length === 0, r.text.slice(0,120));
// exclusão alheia com motivo (o conteúdo de teste é criado só para isso)
r = await call(bob, "POST", "/api/contents", { title: "Para excluir", slug: "para-excluir", type: "DOCUMENT", body: "x" }); const xId = r.json?.data?.id;
r = await call(admin, "DELETE", `/api/contents/${xId}?reason=%20%20%20`); check("excluir alheio com ?reason só de espaços -> 422", r.status === 422, `${r.status}`);
r = await call(admin, "DELETE", `/api/contents/${xId}?reason=${"x".repeat(501)}`); check("excluir alheio com ?reason de 501 caracteres -> 422", r.status === 422, `${r.status}`);
r = await call(bob, "GET", `/api/contents/${xId}`); check("o conteúdo recusado continua existindo", r.status === 200, `${r.status}`);
r = await call(admin, "DELETE", `/api/contents/${xId}?reason=${encodeURIComponent("Plágio comprovado")}`); check("admin exclui conteúdo do Bob com ?reason -> 204", r.status === 204, `${r.status} ${r.text.slice(0,100)}`);
r = await call(bob, "GET", "/api/notifications?unread=1"); check("o dono é avisado da exclusão (texto com o motivo)", r.status === 200 && r.json?.data?.length === 1 && /Pl.gio comprovado/.test(r.json.data[0].text), `${r.status} ${r.text.slice(0,250)}`);
// --- contraste por modo e notificação CONTRAST (M-019)
r = await call(admin, "PUT", "/api/configuration", { darkPrimaryColor: "#333333" });
check("PUT da configuração com a primária noturna escura -> 200 com aviso do modo noturno", r.status === 200 && (r.json?.warnings ?? []).some((w) => w.field === "darkPrimaryColor" && w.minimum === 4.5), `${r.status} ${r.text.slice(0,250)}`);
check("os avisos têm a forma de sempre (5 chaves, sem mode)", (r.json?.warnings ?? []).every((w) => Object.keys(w).sort().join() === "code,field,message,minimum,ratio"), JSON.stringify(r.json?.warnings?.[0]));
r = await call(admin, "GET", "/api/notifications?unread=1"); const nSite = (r.json?.data ?? []).find((n) => n.type === "CONTRAST");
check("o administrador recebe a notificação CONTRAST do modo noturno, em português", !!nSite && /noturno/.test(nSite.title) && /do site/.test(nSite.text) && nSite.data?.scope === "site" && nSite.data?.mode === "dark", JSON.stringify(nSite)?.slice(0, 300));
r = await call(admin, "PUT", "/api/configuration", { darkPrimaryColor: "#333333" });
r = await call(admin, "GET", "/api/notifications"); check("salvar de novo reabre a mesma notificação (uma só por modo e escopo)", (r.json?.data ?? []).filter((n) => n.type === "CONTRAST").length === 1, r.text.slice(0, 300));
r = await call(admin, "PUT", "/api/configuration", { darkPrimaryColor: "#60a5fa" }); check("paleta corrigida -> sem aviso", r.status === 200 && (r.json?.warnings ?? []).length === 0, r.text.slice(0,200));
r = await call(admin, "GET", "/api/notifications?unread=1"); check("a notificação de contraste resolvida sai das não lidas", !(r.json?.data ?? []).some((n) => n.type === "CONTRAST"), r.text.slice(0, 300));
r = await call(bob, "PUT", "/api/appearance", { primaryColor: "#f0f0f0", secondaryColor: "#1e293b", accentColor: "#b45309" }); check("PUT da aparência do Bob com a primária clara demais -> aviso do modo claro", r.status === 200 && (r.json?.warnings ?? []).some((w) => w.field === "primaryColor"), `${r.status} ${r.text.slice(0,200)}`);
r = await call(bob, "GET", "/api/notifications?unread=1"); const nBob = (r.json?.data ?? []).find((n) => n.type === "CONTRAST");
check("o Bob recebe a notificação CONTRAST do escopo da aparência", !!nBob && nBob.data?.scope === "appearance" && /do seu espaço/.test(nBob.text), JSON.stringify(nBob)?.slice(0, 300));
r = await call(admin, "GET", "/api/notifications?unread=1"); check("a notificação do Bob não aparece para o administrador", !(r.json?.data ?? []).some((n) => n.type === "CONTRAST"), r.text.slice(0, 200));
r = await call(bob, "PUT", "/api/appearance", { primaryColor: "#2563eb", secondaryColor: "#1e293b", accentColor: "#b45309" }); check("o Bob corrige a paleta -> sem aviso", r.status === 200 && (r.json?.warnings ?? []).length === 0, r.text.slice(0, 200));
// Épico v1 (M-039, ADR-038): a paleta de um modo é uma unidade e a nula herda; o contraste vale sobre a aparência EFETIVA.
r = await call(bob, "PUT", "/api/appearance", { darkPrimaryColor: "#112233" }); check("uma cor sozinha de um modo ainda sem paleta -> 422 (a paleta fica por inteiro)", r.status === 422, `${r.status} ${r.text.slice(0, 150)}`);
r = await call(bob, "PUT", "/api/appearance", { siteName: "Só o nome do Bob" }); check("só o nome (paletas herdadas) -> 200, não 500, e sem aviso", r.status === 200 && (r.json?.warnings ?? []).length === 0, `${r.status} ${r.text.slice(0, 150)}`);
// --- layout raiz estático, tema por envoltório e páginas do editor (M-021)
for (const [pagina, jar] of [["/", null], ["/login", null], ["/admin", admin]]) {
  r = await call(jar, "GET", pagina);
  const htmlTag = (r.text.match(/<html[^>]*>/) ?? [""])[0];
  check(`${pagina}: 200, <html lang="pt-BR"> sem style, script do modo no <head>`, r.status === 200 && /lang="pt-BR"/.test(htmlTag) && !/style=/.test(htmlTag) && /<head>[\s\S]*vitrine-modo[\s\S]*<\/head>/.test(r.text), `${r.status} ${htmlTag}`);
}
// --- épico v1, A-027 (M-038): modo por cookie lido só pelo script do <head>; marcador de sessão; CSP mantém https:
{
  const anonima = await call(null, "GET", "/");
  const comCookies = await call(null, "GET", "/", undefined, { cookie: "vitrine-modo=dark; vitrine-logado=1" });
  const script = (anonima.text.match(/<head>[\s\S]*?<\/head>/) ?? [""])[0];
  check("o script do modo lê o cookie vitrine-modo, sem localStorage nem matchMedia (sem \"automático\")", /vitrine-modo/.test(script) && !/localStorage|matchMedia|vitrine:modo/.test(script), script.slice(0, 200));
  check("o servidor NÃO lê vitrine-modo nem vitrine-logado: o HTML de / é o mesmo com e sem os cookies, e sem class=\"dark\" no <html>", anonima.status === 200 && anonima.text === comCookies.text && !/<html[^>]*class="[^"]*dark/.test(comCookies.text), `${anonima.status} ${comCookies.status} ${anonima.text.length} ${comCookies.text.length}`);
  check("/ não define cookie algum (nem de modo, nem marcador)", (anonima.headers.getSetCookie?.() ?? []).length === 0, String(anonima.headers.getSetCookie?.()));
  check("o cache de / não muda com os cookies (mesmo Cache-Control)", anonima.headers.get("cache-control") === comCookies.headers.get("cache-control"), `${anonima.headers.get("cache-control")} | ${comCookies.headers.get("cache-control")}`);
  const logada = await call(admin, "GET", "/");
  check("página pública estática: mesmo com sessão, o servidor não escreve o link Administração (quem decide é o navegador)", logada.status === 200 && logada.text === anonima.text, `${logada.status} ${logada.text.length} ${anonima.text.length}`);
  const csp = anonima.headers.get("content-security-policy") ?? "";
  check("CSP da v1 mantém https: no img-src (ADR-034, item 11)", /img-src 'self' data: https:(;|$)/.test(csp), csp.slice(0, 300));
  check("a CSP não admite connect-src de outro site (get-session é da mesma origem)", /connect-src 'self'(;|$)/.test(csp), csp.slice(0, 300));
}
r = await call(null, "GET", "/"); check("o portal leva o envoltório .vitrine-tema", /class="[^"]*vitrine-tema/.test(r.text), r.text.slice(0, 200));
r = await call(null, "GET", "/admin/conteudo/novo"); check("editor sem sessão -> redireciona ao /login com o destino", (r.status === 307 || r.status === 302 || r.status === 308) && /\/login\?redirectTo=/.test(r.headers.get("location") ?? ""), `${r.status} ${r.headers.get("location")}`);
r = await call(bob, "GET", `/admin/conteudo/${bId}`); check("editor: o dono abre o próprio documento (200)", r.status === 200, `${r.status}`);
r = await call(bob, "GET", `/admin/conteudo/${aDoc}`); check("editor: documento de outro dono -> 404", r.status === 404, `${r.status}`);
r = await call(admin, "GET", `/admin/conteudo/${bId}`); check("editor: o administrador também recebe 404 no documento alheio", r.status === 404, `${r.status}`);
r = await call(bob, "GET", `/admin/conteudo/${aId}`); check("editor: coleção -> 404", r.status === 404, `${r.status}`);
r = await call(bob, "GET", "/admin/conteudo/idinexistente123"); check("editor: id inexistente -> 404 (igual ao alheio)", r.status === 404, `${r.status}`);
r = await call(bob, "GET", "/admin/conteudo/novo"); check("novo: 200 para o dono", r.status === 200, `${r.status}`);
r = await call(bob, "GET", `/admin/conteudo/novo?pai=${aId}`); check("novo: ?pai= coleção de outro dono -> 404", r.status === 404, `${r.status}`);
r = await call(bob, "GET", `/admin/conteudo/novo?pai=${bId}`); check("novo: ?pai= documento -> 404", r.status === 404, `${r.status}`);
r = await call(bob, "GET", `/admin/conteudo/novo?pai=${aId}&pai=${aId}`); check("novo: ?pai= repetido -> 404", r.status === 404, `${r.status}`);
r = await call(bob, "GET", "/admin/conteudo/novo?pai=idinexistente123"); check("novo: ?pai= inexistente -> 404", r.status === 404, `${r.status}`);
r = await call(bob, "GET", "/admin/aparencia"); check("aparência: o usuário comum abre a própria (200, noindex)", r.status === 200 && /noindex/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/admin/aparencia"); check("aparência: sem sessão -> redireciona ao login", (r.status === 307 || r.status === 302 || r.status === 308) && /\/login/.test(r.headers.get("location") ?? ""), `${r.status}`);
r = await call(bob, "GET", "/admin/configuracoes"); check("configurações: usuário comum -> 404 (a página não existe para ele)", r.status === 404, `${r.status}`);
r = await call(admin, "GET", "/admin/configuracoes"); check("configurações: o administrador abre (200, noindex)", r.status === 200 && /noindex/.test(r.text), `${r.status}`);
r = await call(admin, "GET", "/admin/aparencia"); check("aparência: o administrador abre a própria, não a de outro (200)", r.status === 200 && !/bob@exemplo/.test(r.text), `${r.status}`);
r = await call(bob, "GET", "/admin/notificacoes"); check("notificações: o dono abre a página (200, noindex) com o texto da exclusão em português", r.status === 200 && /noindex/.test(r.text) && /Pl.gio comprovado/.test(r.text), `${r.status}`);
r = await call(bob, "GET", `/admin/notificacoes?userId=${(await call(admin, "GET", "/api/users/me")).json?.data?.id}`); check("notificações: ?userId= de outro usuário não muda nada (só a lista do dono)", r.status === 200 && /Pl.gio comprovado/.test(r.text), `${r.status}`);
r = await call(admin, "GET", "/admin/notificacoes"); check("notificações: a página do administrador não traz as do Bob", r.status === 200 && !/Pl.gio comprovado/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/admin/notificacoes"); check("notificações: sem sessão -> redireciona ao login", [301, 302, 307, 308].includes(r.status) && /\/login/.test(r.headers.get("location") ?? ""), `${r.status}`);
r = await call(bob, "GET", "/admin/aparencia"); check("sino no cabeçalho do painel, com o contador no rótulo acessível", /Notificações, 1 não lida/.test(r.text), r.text.slice(0, 100));
check("o sino é um botão de divulgação, fechado de saída (aria-expanded=false, aria-controls), e não mais um link", /<button[^>]*aria-label="Notificações, 1 não lida"[^>]*aria-expanded="false"[^>]*aria-controls="/.test(r.text) || /<button[^>]*aria-expanded="false"[^>]*aria-label="Notificações, 1 não lida"/.test(r.text), (r.text.match(/<button[^>]*Notificações[^>]*>/) ?? [""])[0]);
check("o painel do popout não carrega a lista de outro dono: no HTML inicial o painel está vazio e oculto", !/Notificações recentes/.test(r.text), "popout já renderizado no servidor");
r = await call(bob, "GET", "/admin"); check("menu do usuário comum: sem os links de Configurações e Usuários (o cartão \"em breve\" da visão geral não é o menu)", r.status === 200 && !/href="\/admin\/configuracoes"/.test(r.text) && !/href="\/admin\/usuarios"/.test(r.text) && /href="\/admin\/notificacoes"/.test(r.text), `${r.status}`);
r = await call(admin, "GET", "/admin"); check("menu do administrador: com o link de Configurações", /href="\/admin\/configuracoes"/.test(r.text), `${r.status}`);
// --- A-021 (M-032): 64 KiB e o orçamento de renderização na gravação (ADR-033)
const comum = "# Título\n\nUm parágrafo com **negrito**, `código` e a fórmula $x^2$.\n\n".repeat(800);
const hostil = "> ".repeat(30000);
const contar = async () => (await call(bob, "GET", "/api/contents")).json?.data?.length;
let antes = await contar();
r = await call(bob, "POST", "/api/contents", { title: "Comum grande", slug: "comum-grande", type: "DOCUMENT", body: comum }); check("documento comum de ~57 KiB -> 201 (renderiza dentro do orçamento)", r.status === 201, `${r.status} ${r.text.slice(0, 160)}`);
antes = await contar();
r = await call(bob, "POST", "/api/contents", { title: "Hostil", slug: "hostil", type: "DOCUMENT", body: hostil });
check("texto hostil de 60 KiB (> repetido) -> 422 CONTENT_TOO_COMPLEX, campo body", r.status === 422 && code(r) === "CONTENT_TOO_COMPLEX" && r.json?.error?.details?.[0]?.field === "body", `${r.status} ${r.text.slice(0, 200)}`);
check("422 CONTENT_TOO_COMPLEX: mensagem exata em português", r.json?.error?.message === "O texto é complexo demais para publicar: simplifique-o ou divida-o em partes.", r.json?.error?.message);
check("422 CONTENT_TOO_COMPLEX: nada foi gravado", (await contar()) === antes, `${antes} -> ${await contar()}`);
r = await call(bob, "POST", "/api/contents", { title: "Cota", slug: "cota", type: "DOCUMENT", body: "a".repeat(70 * 1024) }); check("70 KiB -> 422 QUOTA_EXCEEDED (a cota barata vem antes do orçamento)", r.status === 422 && code(r) === "QUOTA_EXCEEDED" && r.json?.error?.details?.[0]?.max === 65536, `${r.status} ${r.text.slice(0, 160)}`);
let cur = (await call(bob, "GET", `/api/contents/${bId}`)).json?.data;
r = await call(bob, "PATCH", `/api/contents/${bId}`, { body: hostil, version: cur?.updatedAt }); check("PATCH com texto hostil -> 422 CONTENT_TOO_COMPLEX", r.status === 422 && code(r) === "CONTENT_TOO_COMPLEX", `${r.status} ${r.text.slice(0, 160)}`);
check("PATCH recusado: o corpo gravado não mudou", (await call(bob, "GET", `/api/contents/${bId}`)).json?.data?.body === cur?.body, "o corpo mudou");
r = await call(bob, "PATCH", `/api/contents/${bId}`, { title: "Do Bob (retitulado)" }); check("PATCH só do título não passa pelo orçamento (200)", r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);
cur = (await call(bob, "GET", `/api/contents/${bId}`)).json?.data;
r = await call(admin, "PATCH", `/api/contents/${bId}`, { body: hostil, reason: "teste", version: cur?.updatedAt }); check("moderação do corpo com texto hostil -> 422 CONTENT_TOO_COMPLEX (a moderação também passa)", r.status === 422 && code(r) === "CONTENT_TOO_COMPLEX", `${r.status} ${r.text.slice(0, 160)}`);
r = await call(admin, "PUT", "/api/configuration", { homeBody: hostil }); check("PUT /api/configuration com homeBody hostil -> 422 CONTENT_TOO_COMPLEX, campo homeBody", r.status === 422 && code(r) === "CONTENT_TOO_COMPLEX" && r.json?.error?.details?.[0]?.field === "homeBody", `${r.status} ${r.text.slice(0, 160)}`);
// o laço de eventos não bloqueia: um GET /login durante a validação responde depressa
{
  const lenta = call(bob, "POST", "/api/contents", { title: "Lenta", slug: "lenta", type: "DOCUMENT", body: hostil });
  await new Promise((res) => setTimeout(res, 150));
  const t0 = performance.now(); const login = await call(null, "GET", "/login"); const ms = Math.round(performance.now() - t0);
  check(`GET /login durante a validação responde em menos de 500 ms (${ms} ms)`, login.status === 200 && ms < 500, `${login.status} ${ms} ms`);
  await lenta;
}
// A-022 (M-035): no máximo UMA validação por usuário (em andamento ou na fila). Sete envios hostis simultâneos da
// MESMA conta: um é validado (422), os outros recebem 503 BUSY com Retry-After de 3 segundos.
{
  const lote = await Promise.all(Array.from({ length: 7 }, (_, k) => call(bob, "POST", "/api/contents", { title: "Fila " + k, slug: "fila-" + k, type: "DOCUMENT", body: hostil })));
  const por = (st) => lote.filter((x) => x.status === st).length;
  const ocupado = lote.find((x) => x.status === 503);
  check(`7 envios hostis simultâneos da mesma conta: 1 validado (422) e 6 recusados (503) (${por(422)}x422, ${por(503)}x503)`, por(422) === 1 && por(503) === 6, lote.map((x) => x.status).join(","));
  check("503 BUSY com Retry-After de 3 segundos", ocupado?.json?.error?.code === "BUSY" && ocupado?.headers.get("retry-after") === "3", `${ocupado?.text?.slice(0, 120)} ${ocupado?.headers.get("retry-after")}`);
}
// Um usuário não bloqueia o outro: com o texto hostil do Bob em validação, a gravação normal do administrador é
// atendida (201), e uma segunda gravação do próprio Bob, não (503).
{
  const hostilDoBob = call(bob, "POST", "/api/contents", { title: "Hostil 2", slug: "hostil-2", type: "DOCUMENT", body: hostil });
  await new Promise((res) => setTimeout(res, 100));
  // as duas ao mesmo tempo: a validação hostil do Bob ainda está em andamento quando as duas chegam
  const [doAdmin, segundaDoBob] = await Promise.all([
    call(admin, "POST", "/api/contents", { title: "Normal do admin", slug: "normal-do-admin", type: "DOCUMENT", body: "texto curto do administrador" }),
    call(bob, "POST", "/api/contents", { title: "Segunda do Bob", slug: "segunda-do-bob", type: "DOCUMENT", body: "texto curto" }),
  ]);
  check("com a validação hostil do Bob em andamento, o administrador grava normalmente (201)", doAdmin.status === 201, `${doAdmin.status} ${doAdmin.text.slice(0, 120)}`);
  check("com a validação hostil do Bob em andamento, a segunda gravação do próprio Bob recebe 503 BUSY", segundaDoBob.status === 503 && code(segundaDoBob) === "BUSY", `${segundaDoBob.status} ${segundaDoBob.text.slice(0, 120)}`);
  const fim = await hostilDoBob; check("a validação hostil do Bob termina com 422 CONTENT_TOO_COMPLEX", fim.status === 422 && code(fim) === "CONTENT_TOO_COMPLEX", `${fim.status}`);
}
r = await call(bob, "POST", "/api/contents", { title: "Depois da fila", slug: "depois", type: "DOCUMENT", body: "texto curto" }); check("depois da fila cheia, a gravação normal volta a funcionar (201)", r.status === 201, `${r.status} ${r.text.slice(0, 120)}`);
// --- M-034: /admin/conteudo, /admin/perfil e o PATCH /api/users/me com campos extras
r = await call(bob, "GET", "/admin/conteudo"); check("conteúdo: o dono abre a árvore (200, noindex, os títulos dele)", r.status === 200 && /noindex/.test(r.text) && /Comum grande/.test(r.text), `${r.status}`);
check("conteúdo: a árvore do Bob não traz o conteúdo do administrador", !/Doc admin/.test(r.text) && !/Do admin/.test(r.text), "o texto do administrador apareceu");
r = await call(bob, "GET", `/admin/conteudo?ownerId=${(await call(admin, "GET", "/api/users/me")).json?.data?.id}`); check("conteúdo: ?ownerId= de outro usuário não muda nada (a árvore é a da sessão)", r.status === 200 && !/Doc admin/.test(r.text), `${r.status}`);
r = await call(admin, "GET", "/admin/conteudo"); check("conteúdo: o administrador vê a árvore dele, sem a do Bob", r.status === 200 && /Doc admin/.test(r.text) && !/Comum grande/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/admin/conteudo"); check("conteúdo: sem sessão -> redireciona ao login", [301, 302, 307, 308].includes(r.status) && /\/login/.test(r.headers.get("location") ?? ""), `${r.status}`);
r = await call(bob, "GET", "/admin/perfil"); check("perfil: o dono abre a própria página (200, noindex, o e-mail dele)", r.status === 200 && /noindex/.test(r.text) && /bob@exemplo\.test/.test(r.text), `${r.status}`);
check("perfil: não traz o e-mail de outro usuário", !/admin@exemplo\.test/.test(r.text), "o e-mail do administrador apareceu");
r = await call(null, "GET", "/admin/perfil"); check("perfil: sem sessão -> redireciona ao login", [301, 302, 307, 308].includes(r.status) && /\/login/.test(r.headers.get("location") ?? ""), `${r.status}`);
r = await call(bob, "GET", "/admin"); check("menu do usuário comum: agora com os links de Conteúdo e Perfil", /href="\/admin\/conteudo"/.test(r.text) && /href="\/admin\/perfil"/.test(r.text), `${r.status}`);
r = await call(bob, "PATCH", "/api/users/me", { name: "Bob Dois", role: "admin", handle: "novohandle", banned: true }); check("PATCH /api/users/me com campos extras: 200, o nome muda", r.status === 200 && r.json?.data?.name === "Bob Dois", `${r.status} ${r.text.slice(0, 120)}`);
r = await call(bob, "GET", "/api/users/me"); check("PATCH /api/users/me: papel e handle seguem intactos, a conta não foi banida", r.json?.data?.role === "user" && r.json?.data?.handle === "bob" && r.json?.data?.suspended === false, r.text.slice(0, 160));
// --- espaços públicos, portal e Proxy (M-022 e M-024)
const naoExiste = /não existe ou não está disponível/;
r = await call(null, "GET", "/admin-site"); check("espaço do administrador (/admin-site): 200, lang pt-BR, envoltório, <html> sem style", r.status === 200 && /lang="pt-BR"/.test(r.text) && /vitrine-tema/.test(r.text) && !/<html[^>]*style=/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/admin-site/do-admin"); check("coleção redireciona ao primeiro documento publicado (RN14)", [301, 302, 307, 308].includes(r.status) && /\/admin-site\/do-admin\/doc$/.test(r.headers.get("location") ?? ""), `${r.status} ${r.headers.get("location")}`);
r = await call(null, "GET", "/admin-site/do-admin/doc"); check("documento publicado: 200 com o texto", r.status === 200 && /oi/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/bob/do-admin"); check("espaço do Bob: documento publicado 200 com o título", r.status === 200 && /Do Bob/.test(r.text), `${r.status}`);
const e404a = await call(null, "GET", "/handle-que-nao-existe"); const e404b = await call(null, "GET", "/bob/nao-existe"); const e404c = await call(null, "GET", "/admin-site/do-admin/nao-existe");
check("404 de handle, de slug no espaço do Bob e de slug no do administrador: o mesmo texto único", [e404a, e404b, e404c].every((x) => x.status === 404 && naoExiste.test(x.text)), `${e404a.status} ${e404b.status} ${e404c.status}`);
for (const caminho of ["/Bob/do-admin", "/bob/Do-Admin", "/bob/do%2Dadmin%00", "/bob/%FF", "/bob/a.b", "/" + "a".repeat(80), "/bob/" + "a".repeat(200)]) { r = await call(null, "GET", caminho); check(`Proxy: ${caminho.slice(0, 40)} -> 404 sem 500`, r.status === 404 || r.status === 400, `${r.status}`); }
r = await call(null, "GET", "/bob/do-admin"); check("a página real segue 200 depois dos 404 em maiúsculas (cache não envenenado)", r.status === 200, `${r.status}`);
r = await write(bob, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" }); check("despublicar o documento -> 200 (e não 429: o cache só reflete uma escrita aceita)", r.status === 200, `${r.status}`); r = await settled("/bob/do-admin", (x) => x.status === 404, "despublicar"); check("rascunho: 404 depois de despublicar (RN15; a primeira leitura pode vir velha por alguns ms, ver o INFO)", r.status === 404 && naoExiste.test(r.text) && !/Do Bob/.test(r.text), `${r.status}`);
r = await write(bob, "PATCH", `/api/contents/${bId}`, { status: "PUBLISHED" }); check("republicar o documento -> 200", r.status === 200, `${r.status}`); r = await settled("/bob/do-admin", (x) => x.status === 200, "republicar"); check("republicado: 200 de novo, sem esperar o prazo do cache", r.status === 200, `${r.status}`);
// --- SEO (M-029): robots, mapas do site e metadados
r = await call(null, "GET", "/robots.txt"); check("robots.txt: bloqueia /admin, /api e /login e libera o resto", r.status === 200 && /Disallow: \/admin/.test(r.text) && /Disallow: \/api/.test(r.text) && /Disallow: \/login/.test(r.text) && /Allow: \//.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
r = await call(null, "GET", "/admin-site/sitemap.xml"); check("mapa do espaço do administrador: XML com o início e o documento publicado", r.status === 200 && /xml/.test(r.headers.get("content-type") ?? "") && /<loc>[^<]*\/admin-site<\/loc>/.test(r.text) && /\/admin-site\/do-admin\/doc<\/loc>/.test(r.text) && /<lastmod>/.test(r.text), `${r.status} ${r.text.slice(0, 160)}`);
r = await call(null, "GET", "/bob/sitemap.xml"); check("mapa do espaço do Bob: lista o documento publicado", r.status === 200 && /\/bob\/do-admin<\/loc>/.test(r.text), `${r.status}`);
await write(bob, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" });
r = await call(null, "GET", "/bob/sitemap.xml"); check("rascunho nunca aparece no mapa (RN15): some na primeira leitura depois de despublicar", r.status === 200 && !/do-admin/.test(r.text), `${r.status}`);
await write(bob, "PATCH", `/api/contents/${bId}`, { status: "PUBLISHED" });
{ const a1 = await call(null, "GET", "/handle-que-nao-existe/sitemap.xml"); const a2 = await call(null, "GET", "/Bob/sitemap.xml"); const a3 = await call(null, "GET", "/sitemap.xml/x"); check("mapa de handle inexistente e em maiúsculas: o mesmo 404, com o mesmo corpo", a1.status === 404 && a2.status === 404 && a1.text === a2.text && a3.status === 404, `${a1.status} ${a2.status} ${a3.status}`); }
r = await call(null, "GET", "/sitemap.xml"); check("índice do portal: XML de sitemapindex", r.status === 200 && /<sitemapindex/.test(r.text), `${r.status} ${r.text.slice(0, 100)}`);
r = await call(null, "GET", "/admin-site/do-admin/doc"); check("documento: título, descrição e canônico no HTML (sem marcação na descrição)", r.status === 200 && /<title>[^<]*<\/title>/.test(r.text) && /<meta name="description" content="[^"<*#\[]*"/.test(r.text) && /rel="canonical"/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/"); check("portal: 200 com o envoltório", r.status === 200 && /vitrine-tema/.test(r.text), `${r.status}`);
// cotas e corpo
r = await call(bob, "POST", "/api/contents", { title: "Grande", slug: "grande", type: "DOCUMENT", body: "a".repeat(300 * 1024) }); check("corpo de 300 KiB (acima do limite de leitura de 192 KiB) -> 413", r.status === 413, `${r.status}`);
r = await call(bob, "POST", "/api/contents", "x".repeat(2 * 1024 * 1024), { "content-type": "application/json" }); check("corpo de 2 MiB -> 413", r.status === 413, `${r.status}`);
const adminIdEarly = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
// usuários: comum
for (const [m, p, b, nome] of [["GET","/api/users",undefined,"Bob lista usuários"],["POST","/api/users",{ email: "e@exemplo.test", name: "E", handle: "eee", role: "admin" },"Bob cria conta admin"],["GET",`/api/users/${adminIdEarly}`,undefined,"Bob lê o usuário do admin"],["PATCH",`/api/users/${bobId}`,{ role: "admin" },"Bob se promove a admin"],["PUT",`/api/users/${bobId}/password`,{ password: "x".repeat(10) },"Bob redefine senha"],["POST",`/api/users/${bobId}/ban`,{ reason: "x" },"Bob suspende alguém"],["DELETE",`/api/users/${bobId}`,undefined,"Bob exclui usuário"],["PUT","/api/configuration",{ siteName: "hack" },"Bob altera o site"],["GET","/api/configuration",undefined,"Bob lê o site"]]) { r = await call(bob, m, p, b); check(`${nome} -> 403`, r.status === 403, `${r.status} ${r.text.slice(0,100)}`); }
r = await call(bob, "GET", "/api/users/idinexistente123"); check("Bob consulta usuário inexistente -> 403 (sem enumerar)", r.status === 403, `${r.status}`);
r = await call(bob, "PATCH", "/api/users/me", { role: "admin", name: "Bob B" }); check("PATCH /me ignora role ou recusa", r.status === 200 || r.status === 422, `${r.status}`);
const me = (await call(bob, "GET", "/api/users/me")).json?.data; check("Bob continua 'user'", me?.role === "user", JSON.stringify(me));
// aparência
r = await call(bob, "PUT", "/api/appearance", { siteName: "Espaço do Bob", primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" }); check("Bob grava a própria aparência", r.status === 200, `${r.status} ${r.text.slice(0,150)}`);
r = await call(admin, "GET", "/api/appearance"); check("admin lê a própria aparência (não a do Bob)", r.status === 200 && r.json?.data?.siteName !== "Espaço do Bob", r.text.slice(0,150));
// suspensão
r = await write(admin, "POST", `/api/users/${bobId}/ban`, {}); check("suspender sem motivo -> 422", r.status === 422, `${r.status}`);
r = await write(admin, "POST", `/api/users/${bobId}/ban`, { reason: "Violação das diretrizes" }); check("admin suspende o Bob", r.status === 200 || r.status === 204, `${r.status} ${r.text.slice(0,120)}`);
r = await call(null, "GET", "/bob/do-admin"); check("espaço suspenso: 404 na hora, mesmo com a página em cache (RN23)", r.status === 404 && naoExiste.test(r.text), `${r.status}`);
r = await call(bob, "GET", "/api/contents"); check("sessão do Bob revogada/suspensa -> 401", r.status === 401, `${r.status}`);
r = await call(null, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: "senha-bob-definitiva-9" }); check("login suspenso -> 403 BANNED_USER com motivo", r.status === 403 && /BANNED/.test(JSON.stringify(r.json)) && /Viola/.test(r.text) && /diretrizes\./.test(r.text), `${r.status} ${r.text.slice(0,200)}`);
r = await write(admin, "DELETE", `/api/users/${bobId}/ban`); check("admin reativa", r.status === 200 || r.status === 204, `${r.status}`);
r = await settled("/bob/do-admin", (x) => x.status === 200, "espaço reativado"); check("espaço reativado: 200 de novo", r.status === 200, `${r.status}`);
// --- épico v1, A-031 (M-041): aparência em duas camadas (ADR-038): contrato da API, contraste só do dono, ISR com herança, painel e seletor
{
  const unread = async (jar) => ((await call(jar, "GET", "/api/notifications")).json?.data ?? []).filter((n) => n.type === "CONTRAST" && n.resolvedAt === null);
  r = await call(bob, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: "senha-bob-definitiva-9" }); check("A-031: o Bob entra de novo depois da reativação", r.status === 200, `${r.status} ${r.text.slice(0, 100)}`);
  const SYS = { primaryColor: "#0e7490", secondaryColor: "#1e293b", accentColor: "#b45309" };
  const SYS2 = { primaryColor: "#7e22ce", secondaryColor: "#1e293b", accentColor: "#b45309" };
  const OWN = { primaryColor: "#be123c", secondaryColor: "#1e293b", accentColor: "#b45309" };
  const GOOD_DARK = { darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" };
  const BAD_DARK = { darkPrimaryColor: "#1a1a1a", darkSecondaryColor: "#202020", darkAccentColor: "#141414" };
  const NULL_LIGHT = { primaryColor: null, secondaryColor: null, accentColor: null };
  const NULL_DARK = { darkPrimaryColor: null, darkSecondaryColor: null, darkAccentColor: null };

  // contrato
  r = await call(bob, "PUT", "/api/appearance", { siteName: null, ...NULL_LIGHT, ...NULL_DARK }); check("A-031: PUT da aparência com null no nome e nas seis cores -> 200", r.status === 200 && r.json?.data?.siteName === null && r.json.data.primaryColor === null && r.json.data.darkAccentColor === null, `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "GET", "/api/appearance");
  check("A-031: GET /api/appearance traz data crua (nulos), effective e inherits", r.status === 200 && r.json?.data?.primaryColor === null && typeof r.json?.effective?.primaryColor === "string" && r.json?.inherits?.lightPalette === true && r.json?.inherits?.darkPalette === true && r.json?.inherits?.siteName === true, r.text.slice(0, 400));
  check("A-031: effective não carrega a chave inherits e data não carrega effective", !("inherits" in (r.json?.effective ?? {})) && !("effective" in (r.json?.data ?? {})), r.text.slice(0, 300));
  r = await call(bob, "PUT", "/api/appearance", { ...OWN, ...GOOD_DARK }); check("A-031: o Bob define as duas paletas por inteiro", r.status === 200 && r.json?.data?.primaryColor === OWN.primaryColor && r.json.data.darkPrimaryColor === GOOD_DARK.darkPrimaryColor, `${r.status}`);
  r = await call(bob, "PUT", "/api/appearance", { primaryColor: null }); check("A-031: uma cor nula de um modo -> 422 com field lightPalette", r.status === 422 && r.json?.error?.details?.[0]?.field === "lightPalette", `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { darkPrimaryColor: null, darkSecondaryColor: null }); check("A-031: duas cores nulas de um modo -> 422 com field darkPalette", r.status === 422 && r.json?.error?.details?.[0]?.field === "darkPalette", `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { showLogo: false, showName: false }); check("A-031: showLogo e showName ambos falsos -> 422 com field showName", r.status === 422 && r.json?.error?.details?.[0]?.field === "showName", `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { showLogo: false }); check("A-031: desligar só o logotipo -> 200", r.status === 200 && r.json?.data?.showLogo === false && r.json.data.showName === true, `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { showLogo: true, siteName: "   " }); check("A-031: nome só de espaços vira null (herda)", r.status === 200 && r.json?.data?.siteName === null && r.json.data.showLogo === true, `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { primaryColor: "javascript:1", secondaryColor: "#1e293b", accentColor: "#b45309" }); check("A-031: cor fora do formato -> 422", r.status === 422, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { primaryColor: null }); check("A-031: o sistema não aceita cor nula -> 422", r.status === 422, `${r.status} ${r.text.slice(0, 150)}`);
  r = await call(admin, "PUT", "/api/configuration", { siteName: null }); check("A-031: o sistema não aceita nome nulo -> 422", r.status === 422, `${r.status} ${r.text.slice(0, 150)}`);
  r = await call(admin, "PUT", "/api/configuration", { showLogo: false, showName: false }); check("A-031: o sistema com a barra toda desligada -> 422 field showName", r.status === 422 && r.json?.error?.details?.[0]?.field === "showName", `${r.status} ${r.text.slice(0, 150)}`);
  r = await call(admin, "PUT", "/api/configuration", { modeIconPair: "estrela" }); check("A-031: par de ícones fora da lista -> 422", r.status === 422, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { directoryTitle: "x".repeat(41) }); check("A-031: título do diretório de 41 caracteres -> 422", r.status === 422, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { directoryTitle: "   " }); check("A-031: título do diretório vazio -> 422", r.status === 422, `${r.status}`);
  r = await call(bob, "PUT", "/api/configuration", { ...SYS2 }); check("A-031: o usuário comum não grava o sistema -> 403", r.status === 403, `${r.status}`);
  r = await call(null, "PUT", "/api/appearance", { siteName: "x" }); check("A-031: sem sessão -> 401 na aparência", r.status === 401, `${r.status}`);
  r = await call(bob, "PUT", "/api/appearance", { siteName: "x" }, { origin: "https://evil.example" }); check("A-031: origem alheia -> 401 na aparência", r.status === 401, `${r.status}`);

  // ISR: o espaço herdeiro mostra a paleta do sistema, continua estático e é revalidado quando o sistema muda
  r = await call(bob, "PUT", "/api/appearance", { siteName: null, ...NULL_LIGHT, ...NULL_DARK }); check("A-031: o Bob volta a herdar tudo antes do ensaio do ISR", r.status === 200 && r.json?.data?.primaryColor === null, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { ...SYS, ...GOOD_DARK }); check("A-031: o administrador fixa a paleta do sistema", r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);
  const space = (path = "/bob/do-admin") => call(null, "GET", path);
  // Espera a página assentar (HIT) antes de cada mudança do sistema: uma regeneração em curso quando a revalidação chega grava a versão velha como nova (limite do ISR do Next, também na main).
  const put = async (body) => { await until(space, (x) => x.headers.get("x-nextjs-cache") === "HIT"); await sleep(300); return call(admin, "PUT", "/api/configuration", body); };
  r = await until(space, (x) => x.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`));
  check("A-031: o espaço do Bob (sem paleta própria) mostra a paleta clara do SISTEMA", r.status === 200 && r.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`) && r.text.includes(`--vitrine-dark-primary:${GOOD_DARK.darkPrimaryColor}`), `${r.status}`);
  const htmlTag = (r.text.match(/<html[^>]*>/) ?? [""])[0];
  check("A-031: o layout raiz segue estático: <html> sem style, sem Set-Cookie na página pública", !/style=/.test(htmlTag) && !r.headers.get("set-cookie"), `${htmlTag} ${r.headers.get("set-cookie")}`);
  r = await until(space, (x) => x.headers.get("x-nextjs-cache") === "HIT");
  check("A-031: o espaço continua em cache (x-nextjs-cache HIT), e não dinâmico", r.headers.get("x-nextjs-cache") === "HIT" && !/no-store|private/.test(r.headers.get("cache-control") ?? ""), `${r.headers.get("x-nextjs-cache")} ${r.headers.get("cache-control")}`);
  const before = r.text;
  r = await put({ ...SYS2 }); check("A-031: o sistema muda a paleta clara", r.status === 200, `${r.status}`);
  r = await until(space, (x) => x.text.includes(`--vitrine-light-primary:${SYS2.primaryColor}`));
  check("A-031: o espaço que herda é revalidado: mostra a paleta nova sem esperar o prazo", r.text.includes(`--vitrine-light-primary:${SYS2.primaryColor}`) && !r.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`), `${r.status}`);
  r = await until(space, (x) => x.headers.get("x-nextjs-cache") === "HIT"); check("A-031: depois de regenerar, o espaço volta ao cache (HIT)", r.headers.get("x-nextjs-cache") === "HIT", `${r.headers.get("x-nextjs-cache")}`);
  r = await call(bob, "PUT", "/api/appearance", { ...OWN }); check("A-031: o Bob define a paleta clara própria", r.status === 200 && r.json?.data?.primaryColor === OWN.primaryColor, `${r.status}`);
  r = await until(space, (x) => x.text.includes(`--vitrine-light-primary:${OWN.primaryColor}`));
  check("A-031: com paleta clara própria, o espaço mostra a do Bob e herda só a noturna do sistema", r.text.includes(`--vitrine-light-primary:${OWN.primaryColor}`) && r.text.includes(`--vitrine-dark-primary:${GOOD_DARK.darkPrimaryColor}`) && !r.text.includes(SYS2.primaryColor), `${r.status}`);
  r = await put({ ...SYS }); check("A-031: o sistema muda a clara de novo (o Bob não herda a clara)", r.status === 200, `${r.status}`);
  await sleep(600);
  r = await space();
  check("A-031: quem definiu a própria paleta clara não muda com o sistema", r.text.includes(`--vitrine-light-primary:${OWN.primaryColor}`) && !r.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`) && r.headers.get("x-nextjs-cache") === "HIT", `${r.headers.get("x-nextjs-cache")}`);
  r = await put({ darkPrimaryColor: "#7dd3fc", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24" }); check("A-031: o sistema muda a paleta noturna", r.status === 200, `${r.status}`);
  r = await until(space, (x) => x.text.includes("--vitrine-dark-primary:#7dd3fc"));
  check("A-031: a paleta noturna herdada é revalidada (cada modo é uma unidade)", r.text.includes("--vitrine-dark-primary:#7dd3fc") && r.text.includes(`--vitrine-light-primary:${OWN.primaryColor}`), `${r.status}`);
  r = await put({ siteName: "Sistema do ensaio" }); check("A-031: o sistema muda o nome", r.status === 200, `${r.status}`);
  r = await until(space, (x) => /<title>[^<]*Sistema do ensaio/.test(x.text));
  check("A-031: o espaço sem nome próprio mostra o nome do SISTEMA no título (ADR-038, item 8)", /<title>[^<]*\| Sistema do ensaio<\/title>/.test(r.text) && !/<title>[^<]*Herdeiro/.test(r.text), (r.text.match(/<title>[^<]*<\/title>/) ?? [""])[0]);
  const withIcons = r.text;
  r = await put({ modeIconPair: "lightbulb" }); check("A-031: o sistema muda o par de ícones do botão de modo", r.status === 200, `${r.status}`);
  r = await until(space, (x) => x.text !== withIcons);
  check("A-031: o par de ícones chega a todo espaço (revalidação de todos)", r.text !== withIcons, `${r.status}`);
  r = await put({ modeIconPair: "sun_moon", directoryTitle: "Pessoas" }); check("A-031: o sistema aceita o par e o título do diretório", r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);

  // painel: o administrador vê SEMPRE o sistema; o usuário comum, o dele sobre o do sistema
  r = await call(bob, "GET", "/admin/aparencia");
  check("A-031: o painel do usuário comum usa a paleta dele (clara própria) sobre a do sistema (noturna)", r.status === 200 && new RegExp(`vitrine-tema[^>]*style="[^"]*--vitrine-light-primary:${OWN.primaryColor}`).test(r.text) && /--vitrine-dark-primary:#7dd3fc/.test(r.text), `${r.status}`);
  check("A-031: /admin/aparencia do usuário comum é a página dele, sem o seletor nem o formulário do sistema", /Aparência do seu espaço/.test(r.text) && !/Aparência a editar/.test(r.text) && !/Nome do site/.test(r.text), "");
  r = await call(bob, "GET", "/admin/aparencia?alvo=sistema"); check("A-031: ?alvo=sistema não dá ao usuário comum o formulário do sistema", r.status === 200 && /Aparência do seu espaço/.test(r.text) && !/Nome do site/.test(r.text), `${r.status}`);
  r = await call(admin, "PUT", "/api/appearance", { primaryColor: "#15803d", secondaryColor: "#1e293b", accentColor: "#b45309" }); check("A-031: o administrador define a paleta clara da PÁGINA dele", r.status === 200, `${r.status}`);
  r = await call(admin, "GET", "/admin");
  check("A-031: o painel do administrador usa só a paleta do SISTEMA, não a da página dele", r.status === 200 && new RegExp(`vitrine-tema[^>]*style="[^"]*--vitrine-light-primary:${SYS.primaryColor}`).test(r.text) && !r.text.includes("#15803d"), `${r.status}`);
  r = await call(admin, "GET", "/admin/aparencia");
  check("A-031: /admin/aparencia do administrador abre no sistema, com o seletor", r.status === 200 && /Aparência do sistema/.test(r.text) && /Aparência a editar/.test(r.text) && /Nome do site/.test(r.text), `${r.status}`);
  r = await call(admin, "GET", "/admin/aparencia?alvo=pagina"); check("A-031: ?alvo=pagina abre a página do administrador", r.status === 200 && /Aparência do seu espaço/.test(r.text) && !/Nome do site/.test(r.text), `${r.status}`);
  r = await call(admin, "GET", "/admin/aparencia?alvo=%3Cscript%3E"); check("A-031: alvo inválido cai no sistema, sem eco", r.status === 200 && /Aparência do sistema/.test(r.text) && !/<script>/.test(r.text.replace(/<script[\s\S]*?<\/script>/g, "")), `${r.status}`);
  r = await call(admin, "GET", "/admin/configuracoes"); check("A-031: /admin/configuracoes não tem mais o nome do site", r.status === 200 && !/Nome do site/.test(r.text) && /Texto do portal/.test(r.text), `${r.status}`);
  r = await call(bob, "GET", "/admin/configuracoes"); check("A-031: o usuário comum recebe 404 em /admin/configuracoes", r.status === 404, `${r.status}`);
  r = await call(null, "GET", "/login");
  check("A-031: o /login usa o nome do sistema", r.status === 200 && r.text.includes("Sistema do ensaio") && new RegExp(`--vitrine-light-primary:${SYS.primaryColor}`).test(r.text), `${r.status}`);
  r = await until(() => call(null, "GET", "/"), (x) => x.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`));
  check("A-031: o portal usa a paleta do sistema (ISR; a primeira leitura depois da revalidação pode ser a velha)", r.status === 200 && r.text.includes(`--vitrine-light-primary:${SYS.primaryColor}`), `${r.status} ${r.headers.get("x-nextjs-cache")} ${(r.text.match(/--vitrine-light-primary:[^;"]*/) ?? ["sem variável"])[0]}`);

  // contraste: só quem DEFINIU a paleta é avisado; o administrador é o dono da paleta do sistema
  r = await call(bob, "PUT", "/api/appearance", { ...NULL_DARK }); check("A-031: o Bob volta a herdar a paleta noturna", r.status === 200, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { ...BAD_DARK });
  check("A-031: paleta noturna ruim do SISTEMA: aviso ao administrador", r.status === 200 && (r.json?.warnings ?? []).length === 3 && r.json.warnings.every((w) => /^dark/.test(w.field)), `${r.status} ${r.text.slice(0, 200)}`);
  check("A-031: e a notificação CONTRAST do site vai ao administrador", (await unread(admin)).some((n) => n.data?.scope === "site" && n.data?.mode === "dark"), "");
  r = await call(bob, "PUT", "/api/appearance", { siteName: "Herdeiro" }); check("A-031: quem herda a paleta ruim do sistema NÃO recebe aviso", r.status === 200 && (r.json?.warnings ?? []).length === 0, `${r.status} ${r.text.slice(0, 200)}`);
  check("A-031: nem notificação de contraste", (await unread(bob)).length === 0, JSON.stringify(await unread(bob)).slice(0, 200));
  r = await call(bob, "PUT", "/api/appearance", { ...BAD_DARK });
  check("A-031: se o Bob DEFINE a paleta ruim, o aviso e a notificação são dele", r.status === 200 && (r.json?.warnings ?? []).length === 3 && (await unread(bob)).some((n) => n.data?.scope === "appearance" && n.data?.mode === "dark"), `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { ...NULL_DARK });
  check("A-031: voltar a herdar o modo resolve a notificação daquele modo (sem aviso)", r.status === 200 && (r.json?.warnings ?? []).length === 0 && (await unread(bob)).length === 0, `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(admin, "PUT", "/api/configuration", { ...GOOD_DARK }); check("A-031: o administrador corrige a paleta e a notificação do site é resolvida", r.status === 200 && (r.json?.warnings ?? []).length === 0 && !(await unread(admin)).some((n) => n.data?.scope === "site"), `${r.status}`);
  r = await call(bob, "PUT", "/api/appearance", { siteName: null, ...NULL_LIGHT }); check("A-031: o Bob volta a herdar tudo (estado do resto do ensaio)", r.status === 200, `${r.status}`);
  r = await call(admin, "PUT", "/api/configuration", { siteName: "Vitrine", ...SYS, modeIconPair: "sun_moon", directoryTitle: "Espaços", primaryColor: "#2563eb" });
  check("A-031: o sistema volta ao estado inicial", r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);
  r = await call(admin, "PUT", "/api/appearance", { primaryColor: null, secondaryColor: null, accentColor: null }); check("A-031: a página do administrador volta a herdar", r.status === 200, `${r.status}`);
}
// --- épico v1, A-029 (M-042): imagens (logotipo, favicon, avatar), /media, moderação do avatar e rodapé por ícones (ADR-034, ADR-035, RN17, RN19, RN29)
{
  const sharp = (await import("sharp")).default;
  const zlib = await import("node:zlib");
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const idOf = (url) => (typeof url === "string" && url.startsWith("/media/") ? url.slice(7) : null);

  // --- imagens de teste. Os de CONTROLE provam que a entrada traz o que a saída não pode trazer.
  const SEGREDO = "SEGREDO-DO-ENSAIO";
  const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).png().toBuffer();
  const pngB = await sharp({ create: { width: 160, height: 160, channels: 3, background: "#993366" } }).png().toBuffer();
  const pngAlfa = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 10, g: 120, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const jpegGps = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#aa3333" } }).jpeg()
    .withExif({ IFD0: { Copyright: SEGREDO }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 3230/100", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 4366/100" } }).toBuffer();
  const webpOk = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#228855" } }).webp().toBuffer();
  const html = "<html><script>alert('xss-ensaio')</script></html>";
  const polyglot = Buffer.concat([await sharp({ create: { width: 64, height: 64, channels: 3, background: "#555555" } }).jpeg().toBuffer(), Buffer.from(html)]);
  check("controle: a entrada com EXIF traz o texto e o GPS que a saída não pode trazer", jpegGps.includes(SEGREDO) && jpegGps.includes("Exif"), "o JPEG de teste não tem EXIF");

  const crc = (buf) => { const b = Buffer.alloc(4); b.writeUInt32BE(zlib.crc32(buf) >>> 0); return b; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([len, td, crc(td)]); };
  // PNG de 1 bit, preto, w x h: pequeno no arquivo e enorme decodificado (bomba de pixels).
  const bomba = (w, h) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 0;
    const raw = Buffer.alloc((Math.ceil(w / 8) + 1) * h);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  };
  // PNG válido preenchido até EXATAMENTE `total` bytes por um bloco auxiliar privado (ignorado por quem decodifica).
  const preenchido = (base, total) => {
    const iend = base.subarray(base.length - 12);
    const sem = base.subarray(0, base.length - 12);
    return Buffer.concat([sem, chunk("ruSt", Buffer.alloc(total - base.length - 12)), iend]);
  };
  const MB2 = 2 * 1024 * 1024;

  const up = async (jar, path, bytes, { type = "image/png", filename = "foto.png", field = "file", method = "PUT", retry = true, origin = B } = {}) => {
    for (;;) {
      let body;
      if (bytes !== undefined) { body = new FormData(); body.append(field, new Blob([bytes], { type }), filename); }
      const res = await fetch(B + path, { method, headers: { origin, ...(jar ? { cookie: jar.h } : {}) }, body, redirect: "manual" });
      jar?.set(res);
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
      if (res.status === 429 && retry) { await sleep((Number(res.headers.get("retry-after")) || 1) * 1000 + 300); continue; }
      return { status: res.status, json, text, headers: res.headers };
    }
  };
  const media = async (id, headers = {}) => {
    const res = await fetch(`${B}/media/${id}`, { headers, redirect: "manual" });
    return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
  };
  const bobId2 = (await call(admin, "GET", "/api/users")).json?.data?.find((u) => u.handle === "bob")?.id;
  const adminId2 = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
  r = await login(bob, "bob@exemplo.test", "senha-bob-definitiva-9");
  check("A-029: o Bob está com a sessão ativa", r.status === 200, `${r.status}`);

  // --- Carla: conta nova (a terceira conta dos ensaios de concorrência), primeiro com a senha provisória
  const carla = new Jar();
  r = await write(admin, "POST", "/api/users", { email: "carla@exemplo.test", name: "Carla", handle: "carla", role: "user" });
  const carlaId = r.json?.data?.id ?? r.json?.data?.user?.id; const carlaTemp = r.json?.data?.temporaryPassword ?? r.json?.data?.password ?? r.json?.temporaryPassword;
  check("A-029: a conta da Carla é criada com senha provisória de 16 caracteres", typeof carlaTemp === "string" && carlaTemp.length === 16, JSON.stringify(r.json).slice(0, 160));
  r = await login(carla, "carla@exemplo.test", carlaTemp);
  check("A-029: a Carla entra com a senha provisória", r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);
  r = await up(carla, "/api/users/me/avatar", png);
  check("A-029: com a senha provisória pendente, o envio de avatar -> 403 PASSWORD_CHANGE_REQUIRED", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED", `${r.status} ${r.text.slice(0, 120)}`);
  r = await up(carla, "/api/users/me/avatar", undefined, { method: "DELETE" });
  check("A-029: e a remoção também", r.status === 403 && code(r) === "PASSWORD_CHANGE_REQUIRED", `${r.status}`);
  r = await call(carla, "POST", "/api/users/me/password", { current: carlaTemp, next: "senha-carla-definitiva-9" });
  check("A-029: a Carla troca a senha", r.status === 200 || r.status === 204, `${r.status}`);

  // --- autenticação, origem e papel
  r = await up(null, "/api/users/me/avatar", png); check("A-029: sem sessão -> 401 no envio de avatar", r.status === 401, `${r.status}`);
  r = await up(null, "/api/appearance/logo", png); check("A-029: sem sessão -> 401 no logotipo", r.status === 401, `${r.status}`);
  r = await up(bob, "/api/appearance/logo", png, { origin: "https://evil.example" }); check("A-029: origem alheia -> 401 no logotipo", r.status === 401, `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", png, { origin: "https://evil.example" }); check("A-029: origem alheia -> 401 no avatar", r.status === 401, `${r.status}`);
  for (const [m, p] of [["PUT", "/api/configuration/logo"], ["PUT", "/api/configuration/favicon"], ["DELETE", "/api/configuration/logo"], ["DELETE", "/api/configuration/favicon"]]) {
    r = await up(bob, p, m === "PUT" ? png : undefined, { method: m }); check(`A-029: o usuário comum não mexe nas imagens do sistema (${m} ${p}) -> 403`, r.status === 403, `${r.status}`);
  }
  r = await up(null, "/api/configuration/logo", png); check("A-029: sem sessão -> 401 no logotipo do sistema", r.status === 401, `${r.status}`);

  // --- o corpo
  r = await call(carla, "PUT", "/api/users/me/avatar", { file: "x" }); check("A-029: corpo JSON no envio -> 400", r.status === 400, `${r.status} ${r.text.slice(0, 120)}`);
  r = await call(carla, "PUT", "/api/users/me/avatar", png.toString("latin1"), { "content-type": "image/png" }); check("A-029: PNG cru (sem multipart) -> 400", r.status === 400, `${r.status}`);
  r = await call(admin, "PUT", "/api/appearance/logo", "--x\r\n", { "content-type": "multipart/form-data" }); check("A-029: multipart sem boundary -> 400", r.status === 400, `${r.status}`);
  r = await call(admin, "PUT", "/api/appearance/logo", "isto nao e multipart", { "content-type": "multipart/form-data; boundary=zzz" }); check("A-029: multipart malformado -> 400 ou 422 sem arquivo, nunca 500", r.status === 400 || r.status === 422, `${r.status} ${r.text.slice(0, 120)}`);
  {
    const f = new FormData(); f.append("nome", "so texto");
    const res = await fetch(`${B}/api/users/me/avatar`, { method: "PUT", headers: { origin: B, cookie: carla.h }, body: f }); const j = await res.json().catch(() => null);
    check("A-029: multipart sem o campo file -> 422 VALIDATION_ERROR no campo file", res.status === 422 && j?.error?.code === "VALIDATION_ERROR" && j.error.details?.[0]?.field === "file", `${res.status} ${JSON.stringify(j).slice(0, 160)}`);
  }
  r = await up(carla, "/api/users/me/avatar", png, { field: "imagem" }); check("A-029: campo com outro nome (imagem) -> 422", r.status === 422, `${r.status}`);

  // --- formatos recusados pelo CONTEÚDO, com o nome e o tipo declarados enganosos (3 contas se revezam: o limite de 10 por minuto é por usuário)
  const juizes = [[bob, "/api/appearance/logo"], [admin, "/api/appearance/logo"], [carla, "/api/users/me/avatar"]];
  let turno = 0;
  const recusa = async (nome, bytes, opts = {}) => {
    const [jar, path] = juizes[turno++ % juizes.length];
    const x = await up(jar, path, bytes, { filename: "NOME-SENTINELA.png", ...opts });
    const sujo = /NOME-SENTINELA|image\/svg|image\/gif|text\/html|alert\(/i.test(x.text);
    check(`A-029: ${nome} -> 422 INVALID_IMAGE no campo file, sem eco do arquivo`, x.status === 422 && code(x) === "INVALID_IMAGE" && x.json?.error?.details?.[0]?.field === "file" && !sujo, `${x.status} ${x.text.slice(0, 200)}`);
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>';
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  await recusa("SVG declarado como image/svg+xml", Buffer.from(svg), { type: "image/svg+xml", filename: "NOME-SENTINELA.svg" });
  await recusa("SVG renomeado .png e declarado image/png", Buffer.from(svg));
  await recusa("GIF válido declarado image/gif", gif, { type: "image/gif", filename: "NOME-SENTINELA.gif" });
  await recusa("GIF válido declarado image/png", gif);
  await recusa("HTML renomeado .png (image/png)", Buffer.from("<!doctype html><script>alert(1)</script>"));
  await recusa("ZIP renomeado .png (image/png)", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60, 7)]));
  await recusa("arquivo de 0 byte", Buffer.alloc(0));
  await recusa("PDF", Buffer.from("%PDF-1.4\n1 0 obj\n"), { type: "application/pdf", filename: "NOME-SENTINELA.pdf" });
  await recusa("BMP", Buffer.concat([Buffer.from("BM"), Buffer.alloc(60)]));
  await recusa("TIFF", Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(60)]));
  await recusa("RIFF que não é WebP (WAVE)", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(30)]));
  await recusa("assinatura de PNG com lixo depois", Buffer.concat([png.subarray(0, 8), Buffer.alloc(80, 9)]));
  await recusa("assinatura de JPEG com lixo depois", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(80, 9)]));
  await recusa("PNG truncado", png.subarray(0, Math.floor(png.length / 2)));
  await recusa("PNG real declarado image/jpeg (tipo declarado diferente do conteúdo)", png, { type: "image/jpeg" });
  await recusa("JPEG real declarado text/html", jpegGps, { type: "text/html", filename: "NOME-SENTINELA.html" });
  await recusa("WebP real declarado image/svg+xml", webpOk, { type: "image/svg+xml" });

  // --- bomba de pixels e tamanho
  {
    const b = bomba(30000, 30000);
    const t0 = performance.now(); const x = await up(admin, "/api/appearance/logo", b); const ms = Math.round(performance.now() - t0);
    check(`A-029: bomba de pixels de 30000x30000 (${(b.length / 1024).toFixed(0)} KiB no arquivo) -> 422 INVALID_IMAGE em ${ms} ms, sem decodificar`, x.status === 422 && code(x) === "INVALID_IMAGE" && ms < 5000, `${x.status} ${ms} ms ${x.text.slice(0, 160)}`);
    const vivo = await call(null, "GET", "/login"); check("A-029: o servidor segue respondendo depois da bomba", vivo.status === 200, `${vivo.status}`);
    const limite = await up(carla, "/api/users/me/avatar", bomba(5000, 5000));
    check("A-029: 5000x5000 (exatamente 25 megapixels) é aceita", limite.status === 200, `${limite.status} ${limite.text.slice(0, 160)}`);
    const acima = await up(admin, "/api/appearance/logo", bomba(5001, 5000));
    check("A-029: 5001x5000 (25,005 megapixels) -> 422 INVALID_IMAGE", acima.status === 422 && code(acima) === "INVALID_IMAGE", `${acima.status}`);
  }
  r = await up(carla, "/api/users/me/avatar", preenchido(png, MB2));
  check("A-029: PNG válido de EXATAMENTE 2 MiB é aceito", r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);
  r = await up(carla, "/api/users/me/avatar", preenchido(png, MB2 + 1));
  check("A-029: 2 MiB + 1 byte -> 413 PAYLOAD_TOO_LARGE (antes de decodificar)", r.status === 413 && code(r) === "PAYLOAD_TOO_LARGE", `${r.status} ${r.text.slice(0, 160)}`);
  r = await up(admin, "/api/appearance/logo", Buffer.alloc(3 * MB2, 1));
  check("A-029: 6 MiB -> 413 (o corpo é cortado no limite)", r.status === 413, `${r.status}`);

  // --- o que a saída é: formato, tamanho, EXIF/GPS e conteúdo reencodado
  const bytesLimpos = (bytes, rotulo) => {
    const t = bytes.toString("latin1");
    return !t.includes(SEGREDO) && !/Exif|GPS|XMP|<script|xss-ensaio|alert\(/.test(t);
  };
  r = await fetch(`${B}/media`, { redirect: "manual" }); check("A-029: /media sem identificador -> 404", r.status === 404, `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", jpegGps, { type: "image/jpeg", filename: "../../etc/passwd" });
  const av1 = r;
  check("A-029: avatar JPEG com EXIF/GPS e nome '../../etc/passwd' -> 200 { id, url, width, height }", r.status === 200 && ID.test(r.json?.data?.id ?? "") && r.json.data.url === `/media/${r.json.data.id}` && r.json.data.width === 256 && r.json.data.height === 256 && !/passwd/.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
  const avId1 = av1.json?.data?.id;
  {
    const m = await media(avId1); const meta = await sharp(m.bytes).metadata();
    check("A-029: GET /media/<id> do avatar: 200, image/webp, 256x256", m.status === 200 && m.headers.get("content-type") === "image/webp" && meta.format === "webp" && meta.width === 256 && meta.height === 256, `${m.status} ${m.headers.get("content-type")} ${meta.format} ${meta.width}x${meta.height}`);
    check("A-029: a saída NÃO tem o EXIF, o GPS nem o texto secreto (bytes inspecionados)", bytesLimpos(m.bytes) && !meta.exif && !meta.xmp && !meta.iptc, `exif=${!!meta.exif} xmp=${!!meta.xmp}`);
    check("A-029: /media: nosniff, cache imutável de 1 ano, ETag, sem Set-Cookie, tamanho exato", m.headers.get("x-content-type-options") === "nosniff" && /public/.test(m.headers.get("cache-control") ?? "") && /max-age=31536000/.test(m.headers.get("cache-control") ?? "") && /immutable/.test(m.headers.get("cache-control") ?? "") && /^"[0-9a-f]{64}"$/.test(m.headers.get("etag") ?? "") && !m.headers.get("set-cookie") && Number(m.headers.get("content-length")) === m.bytes.length, JSON.stringify([...m.headers]).slice(0, 300));
    const et = m.headers.get("etag");
    const c1 = await media(avId1, { "if-none-match": et }); check("A-029: If-None-Match igual -> 304 sem corpo, com os cabeçalhos de cache", c1.status === 304 && c1.bytes.length === 0 && /immutable/.test(c1.headers.get("cache-control") ?? ""), `${c1.status}`);
    const c2 = await media(avId1, { "if-none-match": `W/${et}` }); check("A-029: If-None-Match fraco igual -> 304", c2.status === 304, `${c2.status}`);
    const c3 = await media(avId1, { "if-none-match": '"outro"' }); check("A-029: If-None-Match diferente -> 200", c3.status === 200 && c3.bytes.length === m.bytes.length, `${c3.status}`);
    const c4 = await fetch(`${B}/media/${avId1}`, { method: "POST", headers: { origin: B } }); check("A-029: POST em /media/<id> -> 405", c4.status === 405, `${c4.status}`);
  }
  for (const caminho of ["/media/idinexistente123", "/media/..%2F..%2Fetc%2Fpasswd", "/media/%00", `/media/${"a".repeat(100)}`]) {
    const x = await fetch(B + caminho, { redirect: "manual" }); const t = await x.text();
    check(`A-029: ${caminho.slice(0, 40)} -> 404 uniforme, sem corpo de página`, x.status === 404 && !/<html/i.test(t) && !x.headers.get("set-cookie"), `${x.status} ${t.slice(0, 80)}`);
  }
  r = await up(bob, "/api/users/me/avatar", pngB, { type: "" , filename: "x" });
  check("A-029: troca do avatar com o tipo NÃO declarado (octet-stream) -> 200 e id NOVO", r.status === 200 && r.json?.data?.id !== avId1 && ID.test(r.json?.data?.id ?? ""), `${r.status} ${r.text.slice(0, 160)}`);
  const avId2 = r.json?.data?.id;
  check("A-029: a imagem antiga do avatar saiu na troca (404) e a nova serve", (await media(avId1)).status === 404 && (await media(avId2)).status === 200, "");
  r = await call(bob, "GET", "/api/users/me"); check("A-029: GET /api/users/me traz avatarImageId", r.json?.data?.avatarImageId === avId2, r.text.slice(0, 200));
  r = await call(admin, "GET", `/api/users/${bobId2}`); check("A-029: GET /api/users/:id traz avatarImageId", r.json?.data?.avatarImageId === avId2, r.text.slice(0, 200));
  r = await call(admin, "GET", "/api/users"); check("A-029: GET /api/users (lista) traz avatarImageId de cada um (e null de quem não tem)", (r.json?.data ?? []).find((u) => u.id === bobId2)?.avatarImageId === avId2 && (r.json?.data ?? []).every((u) => "avatarImageId" in u), r.text.slice(0, 200));
  r = await up(bob, "/api/users/me/avatar", polyglot, { type: "image/jpeg", filename: "poliglota.jpg" });
  {
    const idp = r.json?.data?.id; const m = idp ? await media(idp) : null;
    check("A-029: poliglota JPEG+HTML: recusado (422) ou reencodado SEM o HTML na saída", r.status === 422 || (r.status === 200 && m?.status === 200 && bytesLimpos(m.bytes)), `${r.status} ${m ? m.bytes.length : ""}`);
  }
  r = await up(bob, "/api/users/me/avatar", webpOk, { type: "image/webp" }); check("A-029: WebP é aceito como avatar", r.status === 200, `${r.status}`);
  const avFinal = r.json?.data?.id;

  // logotipo e favicon
  r = await up(bob, "/api/appearance/logo", pngAlfa);
  const logoBob = r.json?.data;
  check("A-029: logotipo 800x400 com alfa -> 200, reduzido a 512x256", r.status === 200 && logoBob?.width === 512 && logoBob?.height === 256, `${r.status} ${r.text.slice(0, 160)}`);
  {
    const m = await media(logoBob.id); const meta = await sharp(m.bytes).metadata();
    check("A-029: o logotipo servido é WebP 512x256 e mantém o alfa", m.status === 200 && m.headers.get("content-type") === "image/webp" && meta.width === 512 && meta.height === 256 && meta.hasAlpha === true, `${m.status} ${meta.width}x${meta.height} alfa=${meta.hasAlpha}`);
  }
  r = await up(bob, "/api/appearance/favicon", jpegGps, { type: "image/jpeg" });
  const favBob = r.json?.data;
  check("A-029: favicon JPEG 200x100 -> 200, 64x64", r.status === 200 && favBob?.width === 64 && favBob?.height === 64, `${r.status} ${r.text.slice(0, 160)}`);
  {
    const m = await media(favBob.id); const meta = await sharp(m.bytes).metadata();
    check("A-029: o favicon servido é PNG 64x64, sem EXIF", m.status === 200 && m.headers.get("content-type") === "image/png" && meta.format === "png" && meta.width === 64 && meta.height === 64 && bytesLimpos(m.bytes), `${m.status} ${m.headers.get("content-type")} ${meta.width}x${meta.height}`);
  }
  r = await call(bob, "GET", "/api/appearance"); check("A-029: GET /api/appearance traz logoImageId e faviconImageId", r.json?.data?.logoImageId === logoBob.id && r.json?.data?.faviconImageId === favBob.id, r.text.slice(0, 300));
  r = await call(bob, "PUT", "/api/appearance", { logoUrl: "https://evil.example/x.png", faviconUrl: "/x.ico", githubUrl: "https://evil.example/", discordUrl: null });
  check("A-029: PUT /api/appearance só com os campos legados (logoUrl, faviconUrl, links) -> 422 'ao menos um campo'", r.status === 422, `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { siteName: "Bob com legado", logoUrl: "https://evil.example/x.png", githubUrl: "https://evil.example/" });
  check("A-029: com outro campo junto, os legados são descartados (200, sem eco)", r.status === 200 && !/evil\.example/.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
  r = await call(bob, "PUT", "/api/appearance", { siteName: null });

  // --- um usuário não troca a imagem de outro; o administrador só remove a de outro, com motivo
  r = await call(bob, "DELETE", `/api/users/${adminId2}/avatar?reason=x`); check("A-029: o usuário comum não remove o avatar de outro -> 403", r.status === 403, `${r.status}`);
  r = await call(bob, "DELETE", `/api/users/${bobId2}/avatar?reason=x`); check("A-029: nem o próprio pela rota de moderação -> 403", r.status === 403, `${r.status}`);
  r = await call(null, "DELETE", `/api/users/${bobId2}/avatar?reason=x`); check("A-029: sem sessão -> 401 na moderação do avatar", r.status === 401, `${r.status}`);
  for (const m of ["PUT", "POST", "PATCH"]) { r = await call(admin, m, `/api/users/${bobId2}/avatar`, m === "PATCH" ? {} : undefined); check(`A-029: o administrador não troca o avatar de outro (${m} -> 405)`, r.status === 405, `${r.status}`); }
  r = await up(admin, `/api/users/${bobId2}/avatar`, png); check("A-029: PUT multipart em /api/users/:id/avatar -> 405", r.status === 405, `${r.status}`);
  r = await write(admin, "DELETE", `/api/users/${bobId2}/avatar`); check("A-029: moderar sem motivo -> 422 no campo reason", r.status === 422 && r.json?.error?.details?.[0]?.field === "reason", `${r.status} ${r.text.slice(0, 160)}`);
  r = await write(admin, "DELETE", `/api/users/${bobId2}/avatar?reason=`); check("A-029: motivo vazio -> 422", r.status === 422, `${r.status}`);
  r = await write(admin, "DELETE", `/api/users/${bobId2}/avatar?reason=${"x".repeat(501)}`); check("A-029: motivo de 501 caracteres -> 422", r.status === 422, `${r.status}`);
  r = await write(admin, "DELETE", `/api/users/${adminId2}/avatar?reason=teste`); check("A-029: o administrador não remove o próprio avatar pela rota de moderação -> 403", r.status === 403, `${r.status}`);
  r = await write(admin, "DELETE", `/api/users/idinexistente123/avatar?reason=teste`); check("A-029: usuário inexistente -> 404", r.status === 404, `${r.status}`);
  {
    const semAvatar = (await call(admin, "GET", `/api/users/${carlaId}`)).json?.data?.avatarImageId;
    r = await write(admin, "DELETE", `/api/users/${carlaId}/avatar?reason=teste`); check("A-029: usuário sem avatar -> 404", semAvatar === null ? r.status === 404 : true, `${r.status} avatar=${semAvatar}`);
  }
  const antesDaModeracao = (await call(bob, "GET", "/api/notifications")).json?.data?.length ?? 0;
  r = await write(admin, "DELETE", `/api/users/${bobId2}/avatar?reason=${encodeURIComponent("Imagem imprópria do ensaio")}`);
  check("A-029: o administrador remove o avatar do Bob com motivo -> 204", r.status === 204, `${r.status} ${r.text.slice(0, 120)}`);
  check("A-029: o avatar saiu: avatarImageId nulo e /media 404", (await call(admin, "GET", `/api/users/${bobId2}`)).json?.data?.avatarImageId === null && (await media(avFinal)).status === 404, "");
  {
    const lista = (await call(bob, "GET", "/api/notifications")).json?.data ?? [];
    const aviso = lista.find((n) => n.type === "MODERATION" && /avatar/i.test(`${n.title} ${n.text}`));
    check("A-029: o Bob recebe a notificação de moderação do avatar, com o motivo, na mesma operação", lista.length === antesDaModeracao + 1 && !!aviso && /Imagem impr.pria do ensaio/.test(aviso.text), JSON.stringify(aviso ?? lista[0]).slice(0, 300));
  }
  r = await write(admin, "DELETE", `/api/users/${bobId2}/avatar?reason=outra`); check("A-029: remover de novo -> 404 (não há avatar)", r.status === 404, `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", undefined, { method: "DELETE" }); check("A-029: o dono remove o próprio avatar (sem avatar) -> 204 idempotente", r.status === 204, `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", png); const avBob = r.json?.data?.id; check("A-029: o Bob envia outro avatar depois da moderação", r.status === 200, `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", undefined, { method: "DELETE" });
  check("A-029: o dono remove o próprio avatar -> 204, sem notificação a si mesmo e a imagem sai", r.status === 204 && (await media(avBob)).status === 404 && (((await call(bob, "GET", "/api/notifications")).json?.data ?? []).length === antesDaModeracao + 1), `${r.status}`);

  // --- páginas: o logotipo, o favicon e o avatar chegam ao HTML; o favicon enviado prevalece no <head>
  const links = (texto) => [...texto.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).filter((t) => /rel="(?:shortcut )?icon"/.test(t)).map((t) => (t.match(/href="([^"]*)"/) ?? [])[1]);
  const spaceBob = () => call(null, "GET", "/bob/do-admin");
  r = await until(spaceBob, (x) => x.text.includes(`src="/media/${logoBob.id}"`) || x.text.includes(`/media/${logoBob.id}`));
  check("A-029: o espaço do Bob mostra o logotipo dele (/media/<id>)", r.status === 200 && r.text.includes(`/media/${logoBob.id}`), `${r.status}`);
  check("A-029: o favicon do Bob é o ÚNICO ícone do <head> do espaço dele (o de reserva não é somado)", JSON.stringify(links(r.text)) === JSON.stringify([`/media/${favBob.id}`]), JSON.stringify(links(r.text)));
  r = await call(null, "GET", "/admin-site/do-admin/doc");
  check("A-029: o espaço de quem não enviou favicon tem o de reserva (/favicon.ico), e só ele", JSON.stringify(links(r.text)) === JSON.stringify(["/favicon.ico"]) && !r.text.includes(logoBob.id), JSON.stringify(links(r.text)));
  r = await call(null, "GET", "/favicon.ico"); check("A-029: /favicon.ico (public/) responde 200 como imagem", r.status === 200 && /image\//.test(r.headers.get("content-type") ?? ""), `${r.status} ${r.headers.get("content-type")}`);
  // A-024 (M-043): o favicon de reserva é pequeno e é um ICO de verdade; só a fonte sans é pré-carregada (a mono, não)
  { const f = await fetch(B + "/favicon.ico"); const bytes = new Uint8Array(await f.arrayBuffer());
    check("A-024: /favicon.ico é um ICO (assinatura 00 00 01 00) de no máximo 4 KiB", f.status === 200 && bytes.length > 0 && bytes.length <= 4096 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0, `${f.status} ${bytes.length} bytes`); }
  r = await call(null, "GET", "/");
  { const fontes = [...r.text.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]).filter((t) => /as="font"/.test(t));
    check("A-024: o portal pré-carrega UMA fonte (a sans); a mono fica de fora do caminho crítico", fontes.length === 1, `${fontes.length}: ${fontes.join(" ").slice(0, 300)}`); }
  // o sistema: logotipo e favicon do administrador (portal, /login, painel e espaços que herdam)
  r = await up(admin, "/api/configuration/logo", png); const logoSys = r.json?.data; check("A-029: o administrador envia o logotipo do SISTEMA", r.status === 200 && ID.test(logoSys?.id ?? ""), `${r.status} ${r.text.slice(0, 160)}`);
  r = await up(admin, "/api/configuration/favicon", pngB); const favSys = r.json?.data; check("A-029: o administrador envia o favicon do SISTEMA", r.status === 200 && favSys?.width === 64, `${r.status} ${r.text.slice(0, 160)}`);
  r = await until(() => call(null, "GET", "/"), (x) => x.text.includes(`/media/${logoSys.id}`) && links(x.text).includes(`/media/${favSys.id}`));
  check("A-029: o portal mostra o logotipo e o favicon do sistema", r.text.includes(`/media/${logoSys.id}`) && JSON.stringify(links(r.text)) === JSON.stringify([`/media/${favSys.id}`]), JSON.stringify(links(r.text)));
  r = await call(null, "GET", "/login"); check("A-029: o /login mostra o logotipo e o favicon do sistema", r.text.includes(`/media/${logoSys.id}`) && JSON.stringify(links(r.text)) === JSON.stringify([`/media/${favSys.id}`]), JSON.stringify(links(r.text)));
  r = await call(admin, "GET", "/admin"); check("A-029: o painel do administrador mostra o logotipo e o favicon do sistema, e nada do Bob", r.text.includes(`/media/${logoSys.id}`) && links(r.text).includes(`/media/${favSys.id}`) && !r.text.includes(logoBob.id) && !r.text.includes(favBob.id), JSON.stringify(links(r.text)));
  r = await call(bob, "GET", "/admin"); check("A-029: o painel do Bob usa o logotipo DELE sobre o do sistema", r.text.includes(`/media/${logoBob.id}`) && !r.text.includes(`/media/${logoSys.id}`), "");
  r = await until(() => call(null, "GET", "/admin-site/do-admin/doc"), (x) => links(x.text).includes(`/media/${favSys.id}`));
  check("A-029: o espaço que não tem favicon próprio herda o do sistema (revalidado), no lugar do de reserva", JSON.stringify(links(r.text)) === JSON.stringify([`/media/${favSys.id}`]) && r.text.includes(`/media/${logoSys.id}`), JSON.stringify(links(r.text)));
  r = await spaceBob(); check("A-029: o espaço do Bob mantém o dele", JSON.stringify(links(r.text)) === JSON.stringify([`/media/${favBob.id}`]) && r.text.includes(`/media/${logoBob.id}`) && !r.text.includes(logoSys.id), JSON.stringify(links(r.text)));
  r = await call(admin, "GET", "/admin/aparencia"); check("A-029: /admin/aparencia (sistema) mostra as imagens do SISTEMA", r.status === 200 && r.text.includes(logoSys.id) && !r.text.includes(logoBob.id), `${r.status}`);
  r = await call(bob, "GET", "/admin/aparencia"); check("A-029: /admin/aparencia do Bob mostra as imagens DELE, e não as do sistema", r.status === 200 && r.text.includes(logoBob.id) && !r.text.includes(logoSys.id), `${r.status}`);
  r = await up(bob, "/api/users/me/avatar", jpegGps, { type: "image/jpeg" }); const avPerfil = r.json?.data?.id;
  r = await call(bob, "GET", "/admin/perfil"); check("A-029: /admin/perfil mostra o avatar do Bob", r.status === 200 && r.text.includes(avPerfil), `${r.status}`);
  r = await call(admin, "GET", "/admin/perfil"); check("A-029: /admin/perfil do administrador não mostra o avatar de outro", r.status === 200 && !r.text.includes(avPerfil), `${r.status}`);
  r = await until(() => call(null, "GET", "/"), (x) => x.text.includes(`/media/${avPerfil}`));
  check("A-029: o diretório do portal mostra o avatar do Bob (revalidado)", r.text.includes(`/media/${avPerfil}`), `${r.status}`);
  // o espaço suspenso: a imagem segue servida (identificador opaco; ADR-034, item 8), e a página dá 404
  r = await write(admin, "POST", `/api/users/${bobId2}/ban`, { reason: "Ensaio da imagem" }); check("A-029: o Bob é suspenso", r.status === 200 || r.status === 204, `${r.status}`);
  r = await call(null, "GET", "/bob/do-admin"); check("A-029: com o Bob suspenso, o espaço dá 404", r.status === 404, `${r.status}`);
  check("A-029: e a imagem do Bob segue servida (200, id opaco)", (await media(avPerfil)).status === 200 && (await media(logoBob.id)).status === 200, "");
  r = await write(admin, "DELETE", `/api/users/${bobId2}/ban`); check("A-029: o Bob é reativado", r.status === 200 || r.status === 204, `${r.status}`);
  r = await login(bob, "bob@exemplo.test", "senha-bob-definitiva-9"); check("A-029: o Bob entra de novo", r.status === 200, `${r.status}`);

  // --- o administrador troca a imagem DELE sem tocar na do Bob
  r = await up(admin, "/api/appearance/logo", pngB); const logoAdmin = r.json?.data;
  check("A-029: o logotipo do espaço do administrador é dele; o do Bob não muda", r.status === 200 && (await call(bob, "GET", "/api/appearance")).json?.data?.logoImageId === logoBob.id && (await media(logoBob.id)).status === 200, `${r.status}`);

  // --- concorrência: um processamento por usuário e dois no servidor (503 BUSY com Retry-After)
  {
    // Três contas novas, de limite de taxa intocado: o 429 não pode confundir o 503 que o ensaio quer ver.
    const conta = async (handle) => {
      const jar = new Jar(); const c = await write(admin, "POST", "/api/users", { email: `${handle}@exemplo.test`, name: handle, handle, role: "user" });
      const tmp = c.json?.data?.temporaryPassword ?? c.json?.data?.password; const id = c.json?.data?.id ?? c.json?.data?.user?.id;
      await login(jar, `${handle}@exemplo.test`, tmp);
      const t = await call(jar, "POST", "/api/users/me/password", { current: tmp, next: `senha-${handle}-definitiva-9` });
      return { jar, id, trocou: t.status === 200 || t.status === 204 };
    };
    const [c1, c2, c3] = [await conta("conc-um"), await conta("conc-dois"), await conta("conc-tres")];
    check("A-029: as três contas da concorrência estão prontas", c1.trocou && c2.trocou && c3.trocou, JSON.stringify([c1.id, c2.id, c3.id]));
    const grande = bomba(5000, 5000);
    const um = await Promise.all([1, 2, 3].map(() => up(c1.jar, "/api/appearance/logo", grande, { retry: false })));
    const ok = um.filter((x) => x.status === 200).length, busy = um.filter((x) => x.status === 503);
    check(`A-029: três envios simultâneos do MESMO usuário: 1 processado e 2 recusados com 503 BUSY (${um.map((x) => x.status).join(",")})`, ok === 1 && busy.length === 2 && busy.every((x) => code(x) === "BUSY" && Number(x.headers.get("retry-after")) > 0), JSON.stringify(um.map((x) => x.status)));
    await sleep(300);
    r = await up(c1.jar, "/api/appearance/logo", png); check("A-029: depois dos 503, a vaga foi liberada: o envio normal volta a funcionar", r.status === 200, `${r.status}`);
    const tres = await Promise.all([c1, c2, c3].map((c) => up(c.jar, "/api/appearance/logo", grande, { retry: false })));
    const ok3 = tres.filter((x) => x.status === 200).length, busy3 = tres.filter((x) => x.status === 503).length;
    check(`A-029: três usuários ao mesmo tempo: 2 processados e 1 recusado com 503 (teto de dois no servidor) (${tres.map((x) => x.status).join(",")})`, ok3 === 2 && busy3 === 1, JSON.stringify(tres.map((x) => x.status)));
    await sleep(300);
    r = await up(c3.jar, "/api/users/me/avatar", png); check("A-029: e uma das contas consegue enviar de novo em seguida", r.status === 200, `${r.status}`);
    const ids = [];
    for (const c of [c1, c2, c3]) { const a = (await call(c.jar, "GET", "/api/appearance")).json?.data?.logoImageId; const av = (await call(admin, "GET", `/api/users/${c.id}`)).json?.data?.avatarImageId; ids.push(a, av); }
    const vivas = ids.filter(Boolean);
    for (const c of [c1, c2, c3]) await write(admin, "DELETE", `/api/users/${c.id}`);
    let sumiram = true; for (const id of vivas) if ((await fetch(`${B}/media/${id}`)).status !== 404) sumiram = false;
    check(`A-029: excluir as contas apaga as imagens delas (${vivas.length} imagens, todas 404)`, vivas.length >= 2 && sumiram, `${vivas.length} ${sumiram}`);
  }

  // --- limite de taxa do grupo de imagens: 10 por minuto, por usuário
  {
    let visto = null;
    for (let i = 0; i < 14 && !visto; i++) { const x = await call(carla, "PUT", "/api/users/me/avatar", { a: 1 }); if (x.status === 429) visto = x; }
    check("A-029: o 11º pedido de imagem no minuto -> 429 RATE_LIMITED com Retry-After", visto && code(visto) === "RATE_LIMITED" && Number(visto.headers.get("retry-after")) > 0, JSON.stringify(visto?.text?.slice(0, 120)));
  }

  // --- handle reservado
  r = await write(admin, "POST", "/api/users", { email: "m@exemplo.test", name: "M", handle: "media", role: "user" }); check("A-029: 'media' é handle reservado -> 422", r.status === 422 || r.status === 409, `${r.status} ${r.text.slice(0, 120)}`);
  r = await write(admin, "PATCH", `/api/users/${carlaId}`, { handle: "media" }); check("A-029: trocar o handle para 'media' -> 422", r.status === 422 || r.status === 409, `${r.status}`);

  // --- rodapé por ícones (RN17, ADR-035)
  {
    const L = (icon, url) => ({ icon, url });
    const ok8 = ["github", "linkedin", "instagram", "youtube", "x", "facebook", "bluesky", "mastodon"].map((i) => L(i, `https://exemplo.test/${i}`));
    r = await call(bob, "GET", "/api/footer-links"); check("A-029: GET /api/footer-links -> { data: [] } de início", r.status === 200 && Array.isArray(r.json?.data) && r.json.data.length === 0, r.text.slice(0, 160));
    r = await call(null, "GET", "/api/footer-links"); check("A-029: sem sessão -> 401 no rodapé", r.status === 401, `${r.status}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [L("github", "https://github.com/bob"), L("email", "mailto:bob@exemplo.test"), L("website", "https://bob.exemplo.test/")] });
    check("A-029: o Bob grava 3 links na ordem do vetor (200)", r.status === 200 && r.json?.data?.map((x) => x.icon).join() === "github,email,website", `${r.status} ${r.text.slice(0, 200)}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [L("website", "https://bob.exemplo.test/"), L("github", "https://github.com/bob")] });
    check("A-029: a ordem do vetor é a do rodapé (a troca vale)", r.status === 200 && (await call(bob, "GET", "/api/footer-links")).json?.data?.map((x) => x.icon).join() === "website,github", `${r.status}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [...ok8, L("telegram", "https://t.me/x")] }); check("A-029: 9 links -> 422", r.status === 422, `${r.status} ${r.text.slice(0, 160)}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: ok8 }); check("A-029: 8 links -> 200 (o teto)", r.status === 200 && r.json.data.length === 8, `${r.status} ${r.text.slice(0, 160)}`);
    const alvo = async (nome, links, campo) => { const x = await call(bob, "PUT", "/api/footer-links", { links }); check(`A-029: ${nome} -> 422 com field ${campo}`, x.status === 422 && x.json?.error?.details?.some((d) => d.field === campo), `${x.status} ${x.text.slice(0, 200)}`); };
    await alvo("ícone repetido", [L("github", "https://a.test/"), L("github", "https://b.test/")], "links[1].icon");
    await alvo("ícone fora da lista", [L("orkut", "https://a.test/")], "links[0].icon");
    await alvo("javascript: no website", [L("website", "javascript:alert(1)")], "links[0].url");
    await alvo("data: no github", [L("github", "data:text/html,<script>alert(1)</script>")], "links[0].url");
    await alvo("http:// (só https)", [L("github", "http://github.com/x")], "links[0].url");
    await alvo("URL sem esquema", [L("github", "github.com/x")], "links[0].url");
    await alvo("protocolo relativo", [L("github", "//evil.example/x")], "links[0].url");
    await alvo("https: sem host", [L("github", "https:exemplo.com")], "links[0].url");
    await alvo("URL com espaço", [L("github", "https://a.test/a b")], "links[0].url");
    await alvo("URL de mais de 2048 caracteres", [L("github", "https://a.test/" + "a".repeat(2100))], "links[0].url");
    await alvo("mailto: em ícone que não é o e-mail", [L("github", "mailto:a@b.co")], "links[0].url");
    await alvo("https:// no ícone do e-mail", [L("email", "https://a.test/")], "links[0].url");
    await alvo("mailto: com parâmetros (?subject=)", [L("email", "mailto:a@b.co?subject=x")], "links[0].url");
    await alvo("mailto: com fragmento (#)", [L("email", "mailto:a@b.co#x")], "links[0].url");
    await alvo("e-mail sem domínio com ponto", [L("email", "mailto:a@b")], "links[0].url");
    await alvo("URL vazia", [L("github", "   ")], "links[0].url");
    r = await call(bob, "PUT", "/api/footer-links", { links: "nope" }); check("A-029: links que não é lista -> 422", r.status === 422, `${r.status}`);
    r = await call(bob, "PUT", "/api/footer-links", {}); check("A-029: corpo sem links -> 422", r.status === 422, `${r.status}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [L("github", "https://github.com/bob"), L("github", "javascript:1")] });
    check("A-029: lote com um item inválido não grava nenhum (o rodapé anterior fica)", r.status === 422 && (await call(bob, "GET", "/api/footer-links")).json?.data?.length === 8, `${r.status}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [L("github", "https://github.com/bob?a=%22%3E%3Cscript%3Ealert(1)%3C/script%3E"), L("email", "mailto:bob@exemplo.test")], dono: "forjado" });
    check("A-029: o Bob grava o rodapé final (campo extra ignorado)", r.status === 200 && r.json.data.length === 2, `${r.status} ${r.text.slice(0, 160)}`);
    r = await call(bob, "PUT", "/api/footer-links", { links: [L("github", "https://github.com/bob"), L("email", "mailto:bob@exemplo.test")] }, { origin: "https://evil.example" }); check("A-029: origem alheia -> 401 no rodapé", r.status === 401, `${r.status}`);
    // o do sistema
    r = await call(bob, "GET", "/api/configuration/footer-links"); check("A-029: o usuário comum não lê o rodapé do sistema -> 403", r.status === 403, `${r.status}`);
    r = await call(bob, "PUT", "/api/configuration/footer-links", { links: [L("github", "https://github.com/x")] }); check("A-029: nem grava -> 403", r.status === 403, `${r.status}`);
    r = await call(null, "PUT", "/api/configuration/footer-links", { links: [] }); check("A-029: sem sessão -> 401 no rodapé do sistema", r.status === 401, `${r.status}`);
    r = await call(admin, "PUT", "/api/configuration/footer-links", { links: [L("github", "https://github.com/vitrine-sistema"), L("discord", "https://discord.gg/sistema")] }); check("A-029: o administrador grava o rodapé do sistema", r.status === 200 && r.json?.data?.length === 2, `${r.status} ${r.text.slice(0, 160)}`);
    r = await call(admin, "GET", "/api/footer-links"); check("A-029: o rodapé do administrador (da página dele) é outro, vazio", r.status === 200 && r.json?.data?.length === 0, r.text.slice(0, 160));
    r = await until(spaceBob, (x) => x.text.includes("github.com/bob"));
    check("A-029: o espaço do Bob mostra o rodapé DELE e nenhum link do sistema (o rodapé não herda)", r.status === 200 && /href="https:\/\/github\.com\/bob\?/.test(r.text) && /href="mailto:bob@exemplo\.test"/.test(r.text) && !/vitrine-sistema|discord\.gg/.test(r.text), `${r.status}`);
    check("A-029: o link do Bob com </script> na URL sai escapado no HTML (sem tag solta)", !/<script>alert\(1\)/.test(r.text), "");
    check("A-029: link externo com target=_blank e rel noopener noreferrer", /href="https:\/\/github\.com\/bob\?[^"]*"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(r.text) || /target="_blank"[^>]*rel="noopener noreferrer"[^>]*href="https:\/\/github\.com\/bob/.test(r.text), "");
    r = await until(() => call(null, "GET", "/"), (x) => x.text.includes("vitrine-sistema"));
    check("A-029: o portal mostra o rodapé do SISTEMA, sem os links do Bob", /href="https:\/\/github\.com\/vitrine-sistema"/.test(r.text) && !/github\.com\/bob/.test(r.text), `${r.status}`);
    r = await call(admin, "GET", "/admin-site/do-admin/doc"); check("A-029: o espaço do administrador não herda o rodapé do sistema", !/vitrine-sistema/.test(r.text), "");
    r = await call(admin, "GET", "/admin/aparencia"); check("A-029: /admin/aparencia (sistema) mostra o rodapé do sistema, e não o do Bob", r.status === 200 && r.text.includes("vitrine-sistema") && !r.text.includes("github.com/bob"), `${r.status}`);
    r = await call(bob, "GET", "/admin/aparencia"); check("A-029: /admin/aparencia do Bob mostra o rodapé dele, e não o do sistema", r.status === 200 && r.text.includes("github.com/bob") && !r.text.includes("vitrine-sistema"), `${r.status}`);
    r = await call(admin, "PUT", "/api/configuration/footer-links", { links: [] }); check("A-029: o rodapé do sistema esvazia (200)", r.status === 200 && r.json?.data?.length === 0, `${r.status}`);
  }

  // --- a CSP não mudou, e o Markdown segue como estava
  {
    for (const caminho of ["/", "/login", "/bob/do-admin", "/admin-site"]) {
      const x = await call(null, "GET", caminho); const csp = x.headers.get("content-security-policy") ?? "";
      check(`A-029: a CSP de ${caminho} mantém img-src 'self' data: https: (sem blob:, sem outras origens)`, /img-src 'self' data: https:(;|$)/.test(csp) && !/blob:/.test(csp) && /connect-src 'self'(;|$)/.test(csp), csp.slice(0, 260));
    }
    const m = await fetch(`${B}/media/${avPerfil}`); check("A-029: /media/<id> também leva a CSP da aplicação (sem script)", /default-src 'self'/.test(m.headers.get("content-security-policy") ?? "") || m.headers.get("content-security-policy") === null, m.headers.get("content-security-policy") ?? "");
  }

  // --- remoções: do dono e do administrador, idempotentes; o sistema volta ao embutido
  r = await up(admin, "/api/configuration/logo", undefined, { method: "DELETE" }); check("A-029: o administrador remove o logotipo do sistema (204)", r.status === 204 && (await media(logoSys.id)).status === 404, `${r.status}`);
  r = await up(admin, "/api/configuration/logo", undefined, { method: "DELETE" }); check("A-029: remover de novo é idempotente (204)", r.status === 204, `${r.status}`);
  r = await up(admin, "/api/configuration/favicon", undefined, { method: "DELETE" }); check("A-029: o administrador remove o favicon do sistema (204)", r.status === 204 && (await media(favSys.id)).status === 404, `${r.status}`);
  r = await until(() => call(null, "GET", "/admin-site/do-admin/doc"), (x) => JSON.stringify(links(x.text)) === JSON.stringify(["/favicon.ico"]));
  check("A-029: sem favicon no sistema, o espaço herdeiro volta ao de reserva (revalidado)", JSON.stringify(links(r.text)) === JSON.stringify(["/favicon.ico"]), JSON.stringify(links(r.text)));
  r = await up(admin, "/api/appearance/logo", undefined, { method: "DELETE" }); check("A-029: o administrador remove o logotipo da página dele (204)", r.status === 204 && (await media(logoAdmin.id)).status === 404, `${r.status}`);
  r = await up(bob, "/api/appearance/favicon", undefined, { method: "DELETE" }); check("A-029: o Bob remove o favicon dele (204) e a imagem sai", r.status === 204 && (await media(favBob.id)).status === 404, `${r.status}`);
  r = await call(bob, "GET", "/api/appearance"); check("A-029: depois de remover, faviconImageId é nulo (e o logotipo do Bob segue)", r.json?.data?.faviconImageId === null && !!r.json?.data?.logoImageId, r.text.slice(0, 200));
  globalThis.__midiaDoEnsaio = { carlaId, bobLogo: (await call(bob, "GET", "/api/appearance")).json?.data?.logoImageId, bobAvatar: avPerfil, carlaAvatar: (await call(admin, "GET", `/api/users/${carlaId}`)).json?.data?.avatarImageId };
}
// último administrador
const adminId = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
r = await write(admin, "POST", `/api/users/${adminId}/ban`, { reason: "auto" }); check("auto-suspensão -> 403 FORBIDDEN", r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${code(r)}`);
r = await write(admin, "DELETE", `/api/users/${adminId}`); check("auto-exclusão -> 403 FORBIDDEN", r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${code(r)}`);
r = await write(admin, "PATCH", `/api/users/${adminId}`, { role: "user" }); check("o último administrador não se rebaixa -> 409 LAST_ADMIN", r.status === 409 && code(r) === "LAST_ADMIN", `${r.status} ${code(r)}`);
// excluir usuário com conteúdo
r = await write(admin, "DELETE", `/api/users/${bobId}`); check("excluir usuário com conteúdo sem escolha -> 409 USER_HAS_CONTENT", r.status === 409 && code(r) === "USER_HAS_CONTENT", `${r.status} ${r.text.slice(0,120)}`);
// DELETE de usuário: 200 com o resumo (R-009)
r = await write(admin, "POST", "/api/users", { email: "eva@exemplo.test", name: "Eva", handle: "eva", role: "user" }); const evaId = r.json?.data?.id;
r = await write(admin, "DELETE", `/api/users/${evaId}`); check("excluir usuário sem conteúdo -> 200 com { id, content, roots, renamed }", r.status === 200 && r.json?.data?.id === evaId && "content" in (r.json?.data ?? {}) && "roots" in r.json.data && "renamed" in r.json.data, `${r.status} ${r.text.slice(0,200)}`);
r = await write(admin, "DELETE", `/api/users/${bobId}?content=transfer&to=${adminId}&onConflict=rename`); check("transferir o conteúdo do Bob e excluir -> 200 com raiz renomeada (slug repetido)", r.status === 200 && r.json?.data?.id === bobId && Array.isArray(r.json?.data?.renamed) && r.json.data.renamed.length >= 1, `${r.status} ${r.text.slice(0,300)}`);
r = await call(admin, "GET", `/api/users/${bobId}`); check("o Bob excluído -> 404", r.status === 404, `${r.status}`);
{
  const m = globalThis.__midiaDoEnsaio; const vivo = async (id) => (await fetch(`${B}/media/${id}`)).status;
  check("A-029: excluir o usuário apaga as imagens dele (logotipo e avatar: 404)", (await vivo(m.bobLogo)) === 404 && (await vivo(m.bobAvatar)) === 404, `${await vivo(m.bobLogo)} ${await vivo(m.bobAvatar)}`);
  r = await write(admin, "DELETE", `/api/users/${m.carlaId}`); check("A-029: a Carla (conta do ensaio de imagens) é excluída", r.status === 200, `${r.status}`);
  if (m.carlaAvatar) check("A-029: e o avatar dela sai junto (404)", (await vivo(m.carlaAvatar)) === 404, `${await vivo(m.carlaAvatar)}`);
}
console.log(`   (escritas que esperaram o limite de taxa: ${esperasDoLimite})`);
console.log(atrasos.length ? `INFO: ${atrasos.length} primeira(s) leitura(s) velha(s) depois de escrita aceita (200), todas corrigidas depois de: ${atrasos.map((x) => `${x.rotulo} ${x.ms} ms${x.ok ? "" : " (NÃO refletiu)"} [${x.cache}]`).join("; ")}` : "INFO: nenhuma primeira leitura velha depois de escrita aceita");
// taxa
let limited = 0, retry = null; for (let i = 0; i < 75; i++) { r = await call(admin, "POST", "/api/contents", { title: "t"+i, slug: "t"+i, type: "DOCUMENT" }); if (r.status === 429) { limited++; retry = r.headers.get("retry-after"); } }
check("limite de taxa de escrita (429 + Retry-After)", limited > 0 && !!retry, `limitadas=${limited} retry=${retry}`);
console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas`);
