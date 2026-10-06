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
r = await call(bob, "PUT", "/api/appearance", { primaryColor: "#f0f0f0" }); check("PUT da aparência do Bob com a primária clara demais -> aviso do modo claro", r.status === 200 && (r.json?.warnings ?? []).some((w) => w.field === "primaryColor"), `${r.status} ${r.text.slice(0,200)}`);
r = await call(bob, "GET", "/api/notifications?unread=1"); const nBob = (r.json?.data ?? []).find((n) => n.type === "CONTRAST");
check("o Bob recebe a notificação CONTRAST do escopo da aparência", !!nBob && nBob.data?.scope === "appearance" && /do seu espaço/.test(nBob.text), JSON.stringify(nBob)?.slice(0, 300));
r = await call(admin, "GET", "/api/notifications?unread=1"); check("a notificação do Bob não aparece para o administrador", !(r.json?.data ?? []).some((n) => n.type === "CONTRAST"), r.text.slice(0, 200));
r = await call(bob, "PUT", "/api/appearance", { primaryColor: "#2563eb" }); check("o Bob corrige a paleta -> sem aviso", r.status === 200 && (r.json?.warnings ?? []).length === 0, r.text.slice(0, 200));
// --- layout raiz estático, tema por envoltório e páginas do editor (M-021)
for (const [pagina, jar] of [["/", null], ["/login", null], ["/admin", admin]]) {
  r = await call(jar, "GET", pagina);
  const htmlTag = (r.text.match(/<html[^>]*>/) ?? [""])[0];
  check(`${pagina}: 200, <html lang="pt-BR"> sem style, script do modo no <head>`, r.status === 200 && /lang="pt-BR"/.test(htmlTag) && !/style=/.test(htmlTag) && /<head>[\s\S]*vitrine:modo[\s\S]*<\/head>/.test(r.text), `${r.status} ${htmlTag}`);
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
r = await call(bob, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" }); r = await call(null, "GET", "/bob/do-admin"); check("rascunho: 404 na primeira visita depois de despublicar (RN15)", r.status === 404 && naoExiste.test(r.text) && !/Do Bob/.test(r.text), `${r.status}`);
r = await call(bob, "PATCH", `/api/contents/${bId}`, { status: "PUBLISHED" }); r = await call(null, "GET", "/bob/do-admin"); check("republicado: 200 de novo, sem esperar o prazo do cache", r.status === 200, `${r.status}`);
// --- SEO (M-029): robots, mapas do site e metadados
r = await call(null, "GET", "/robots.txt"); check("robots.txt: bloqueia /admin, /api e /login e libera o resto", r.status === 200 && /Disallow: \/admin/.test(r.text) && /Disallow: \/api/.test(r.text) && /Disallow: \/login/.test(r.text) && /Allow: \//.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
r = await call(null, "GET", "/admin-site/sitemap.xml"); check("mapa do espaço do administrador: XML com o início e o documento publicado", r.status === 200 && /xml/.test(r.headers.get("content-type") ?? "") && /<loc>[^<]*\/admin-site<\/loc>/.test(r.text) && /\/admin-site\/do-admin\/doc<\/loc>/.test(r.text) && /<lastmod>/.test(r.text), `${r.status} ${r.text.slice(0, 160)}`);
r = await call(null, "GET", "/bob/sitemap.xml"); check("mapa do espaço do Bob: lista o documento publicado", r.status === 200 && /\/bob\/do-admin<\/loc>/.test(r.text), `${r.status}`);
await call(bob, "PATCH", `/api/contents/${bId}`, { status: "DRAFT" });
r = await call(null, "GET", "/bob/sitemap.xml"); check("rascunho nunca aparece no mapa (RN15): some na primeira leitura depois de despublicar", r.status === 200 && !/do-admin/.test(r.text), `${r.status}`);
await call(bob, "PATCH", `/api/contents/${bId}`, { status: "PUBLISHED" });
{ const a1 = await call(null, "GET", "/handle-que-nao-existe/sitemap.xml"); const a2 = await call(null, "GET", "/Bob/sitemap.xml"); const a3 = await call(null, "GET", "/sitemap.xml/x"); check("mapa de handle inexistente e em maiúsculas: o mesmo 404 único", a1.status === 404 && a2.status === 404 && naoExiste.test(a1.text) && naoExiste.test(a2.text) && a3.status === 404, `${a1.status} ${a2.status} ${a3.status}`); }
r = await call(null, "GET", "/sitemap.xml"); check("índice do portal: XML de sitemapindex", r.status === 200 && /<sitemapindex/.test(r.text), `${r.status} ${r.text.slice(0, 100)}`);
r = await call(null, "GET", "/admin-site/do-admin/doc"); check("documento: título, descrição e canônico no HTML (sem marcação na descrição)", r.status === 200 && /<title>[^<]*<\/title>/.test(r.text) && /<meta name="description" content="[^"<*#\[]*"/.test(r.text) && /rel="canonical"/.test(r.text), `${r.status}`);
r = await call(null, "GET", "/"); check("portal: 200 com o envoltório", r.status === 200 && /vitrine-tema/.test(r.text), `${r.status}`);
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
r = await call(null, "GET", "/bob/do-admin"); check("espaço suspenso: 404 na hora, mesmo com a página em cache (RN23)", r.status === 404 && naoExiste.test(r.text), `${r.status}`);
r = await call(bob, "GET", "/api/contents"); check("sessão do Bob revogada/suspensa -> 401", r.status === 401, `${r.status}`);
r = await call(null, "POST", "/api/auth/sign-in/email", { email: "bob@exemplo.test", password: "senha-bob-definitiva-9" }); check("login suspenso -> 403 BANNED_USER com motivo", r.status === 403 && /BANNED/.test(JSON.stringify(r.json)) && /Viola/.test(r.text) && /diretrizes\./.test(r.text), `${r.status} ${r.text.slice(0,200)}`);
r = await call(admin, "DELETE", `/api/users/${bobId}/ban`); check("admin reativa", r.status === 200 || r.status === 204, `${r.status}`);
r = await call(null, "GET", "/bob/do-admin"); check("espaço reativado: 200 de novo", r.status === 200, `${r.status}`);
// último administrador
const adminId = (await call(admin, "GET", "/api/users/me")).json?.data?.id;
r = await call(admin, "POST", `/api/users/${adminId}/ban`, { reason: "auto" }); check("auto-suspensão -> 403 FORBIDDEN", r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${code(r)}`);
r = await call(admin, "DELETE", `/api/users/${adminId}`); check("auto-exclusão -> 403 FORBIDDEN", r.status === 403 && code(r) === "FORBIDDEN", `${r.status} ${code(r)}`);
r = await call(admin, "PATCH", `/api/users/${adminId}`, { role: "user" }); check("o último administrador não se rebaixa -> 409 LAST_ADMIN", r.status === 409 && code(r) === "LAST_ADMIN", `${r.status} ${code(r)}`);
// excluir usuário com conteúdo
r = await call(admin, "DELETE", `/api/users/${bobId}`); check("excluir usuário com conteúdo sem escolha -> 409 USER_HAS_CONTENT", r.status === 409 && code(r) === "USER_HAS_CONTENT", `${r.status} ${r.text.slice(0,120)}`);
// DELETE de usuário: 200 com o resumo (R-009)
r = await call(admin, "POST", "/api/users", { email: "eva@exemplo.test", name: "Eva", handle: "eva", role: "user" }); const evaId = r.json?.data?.id;
r = await call(admin, "DELETE", `/api/users/${evaId}`); check("excluir usuário sem conteúdo -> 200 com { id, content, roots, renamed }", r.status === 200 && r.json?.data?.id === evaId && "content" in (r.json?.data ?? {}) && "roots" in r.json.data && "renamed" in r.json.data, `${r.status} ${r.text.slice(0,200)}`);
r = await call(admin, "DELETE", `/api/users/${bobId}?content=transfer&to=${adminId}&onConflict=rename`); check("transferir o conteúdo do Bob e excluir -> 200 com raiz renomeada (slug repetido)", r.status === 200 && r.json?.data?.id === bobId && Array.isArray(r.json?.data?.renamed) && r.json.data.renamed.length >= 1, `${r.status} ${r.text.slice(0,300)}`);
r = await call(admin, "GET", `/api/users/${bobId}`); check("o Bob excluído -> 404", r.status === 404, `${r.status}`);
// taxa
let limited = 0, retry = null; for (let i = 0; i < 75; i++) { r = await call(admin, "POST", "/api/contents", { title: "t"+i, slug: "t"+i, type: "DOCUMENT" }); if (r.status === 429) { limited++; retry = r.headers.get("retry-after"); } }
check("limite de taxa de escrita (429 + Retry-After)", limited > 0 && !!retry, `limitadas=${limited} retry=${retry}`);
console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas`);
