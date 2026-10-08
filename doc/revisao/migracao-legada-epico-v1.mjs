// migracao-legada-epico-v1.mjs -- ensaio do Arquiteto da migração `20261008120000_epico_v1_midia_rodape` sobre um
// banco LEGADO populado com casos de borda (M-039, A-026).
// Uso: node doc/revisao/migracao-legada-epico-v1.mjs <worktree-de-revisão> <arquivo.db>
//   1. aplica todas as migrações ANTERIORES (a nova é tirada do caminho por um instante e restaurada);
//   2. popula o banco (donos misturados, links de todos os esquemas, paletas padrão e personalizadas, conteúdo,
//      sessão, conta, notificações);
//   3. aplica `prisma migrate deploy` (a nova migração) e confere: contagens preservadas, PRAGMA
//      foreign_key_check e integrity_check, links convertidos (https; ordem; um dono por vez), nulos de herança,
//      índice parcial e o que NÃO pode mudar (usuários, conteúdo, notificações, e-mails com ponto e sublinhado).
// Só valores FICTÍCIOS. Imprime OK/FALHA por verificação.
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const wt = process.argv[2] ? resolve(process.argv[2]) : undefined;
const dbFile = process.argv[3] ? resolve(process.argv[3]) : undefined;
if (!wt || !dbFile) {
  console.error("uso: node migracao-legada-epico-v1.mjs <worktree> <arquivo.db>");
  process.exit(2);
}
const require = createRequire(join(wt, "package.json"));
const Database = require("better-sqlite3");
const NOVA = "20261008120000_epico_v1_midia_rodape";
const migracoes = join(wt, "prisma", "migrations");
const parking = join(wt, ".migracao-estacionada");
const url = `file:${dbFile.replace(/\\/g, "/")}`;
const env = { ...process.env, DATABASE_URL: url };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const deploy = () => execFileSync(npx, ["prisma", "migrate", "deploy"], { cwd: wt, env, encoding: "utf8", shell: process.platform === "win32" });

let pass = 0, fail = 0;
const check = (nome, cond, extra = "") => { (cond ? pass++ : fail++); console.log((cond ? "OK   " : "FALHA") + " " + nome + (cond ? "" : "  -> " + extra)); };

rmSync(dbFile, { force: true });
rmSync(parking, { recursive: true, force: true });
mkdirSync(parking);
renameSync(join(migracoes, NOVA), join(parking, NOVA));
try {
  deploy();
} finally {
  renameSync(join(parking, NOVA), join(migracoes, NOVA));
  rmSync(parking, { recursive: true, force: true });
}

const db = new Database(dbFile);
const cols = (t) => db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
const tem = (t, c) => cols(t).includes(c);
check("estado anterior: configurations tem os links e a URL do logo", tem("configurations", "discordUrl") && tem("configurations", "logoUrl"), cols("configurations").join(","));

const agora = new Date().toISOString();
const now = (extra = {}) => ({ createdAt: agora, updatedAt: agora, ...extra });
const ins = (tabela, linha) => {
  const ks = Object.keys(linha);
  db.prepare(`INSERT INTO "${tabela}" (${ks.map((k) => `"${k}"`).join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...ks.map((k) => (typeof linha[k] === "boolean" ? Number(linha[k]) : linha[k])));
};
const usuario = (id, email, handle, role = "user") => ins("user", { id, name: `Nome ${id}`, email, emailVerified: 1, role, handle, ...now() });
usuario("u-admin", "admin@exemplo.test", "admin-site", "admin");
usuario("u-ana", "ana.silva_x@exemplo.test", "ana", "user");
usuario("u-beto", "beto@exemplo.test", "beto", "user");
usuario("u-cida", "cida@exemplo.test", "cida", "user");
usuario("u-dani", "dani@exemplo.test", "dani", "user");

// Site: links de vários esquemas e formatos.
db.prepare(`UPDATE "configurations" SET "discordUrl"=?, "githubUrl"=?, "youtubeUrl"=?, "instagramUrl"=?, "linkedinUrl"=?, "twitchUrl"=?, "logoUrl"=?, "faviconUrl"=?, "siteName"=? WHERE "id"='default'`).run(
  "https://discord.gg/abc", "http://github.com/inseguro", "  HTTPS://youtube.com/c/x  ", "mailto:eu@exemplo.test", "", "https://twitch.tv/site", "https://cdn.exemplo.test/logo.png", "/favicon.ico", "Meu site",
);
if (db.prepare(`SELECT COUNT(*) n FROM "configurations"`).get().n === 0) {
  ins("configurations", { id: "default", siteName: "Meu site", discordUrl: "https://discord.gg/abc", githubUrl: "http://github.com/inseguro", youtubeUrl: "  HTTPS://youtube.com/c/x  ", instagramUrl: "mailto:eu@exemplo.test", linkedinUrl: "", twitchUrl: "https://twitch.tv/site", updatedAt: agora });
}
const apar = (ownerId, o = {}) => ins("appearances", { ownerId, ...o, ...now() });
// ana: tudo no padrão antigo + nome "Vitrine" + 2 links (https e javascript:)
apar("u-admin", { siteName: "Portal do admin", primaryColor: "#112233", secondaryColor: "#445566", accentColor: "#778899", darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24", githubUrl: "https://github.com/admin", twitchUrl: "https://twitch.tv/admin", logoUrl: "https://x.test/l.png" });
apar("u-ana", { siteName: "Vitrine", primaryColor: "#2563EB", secondaryColor: "#1e293b", accentColor: "#B45309", darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24", discordUrl: "https://discord.gg/ana", githubUrl: "javascript:alert(1)" });
// beto: UMA cor clara mudada (as três permanecem) e o escuro no padrão; um link http descartado
apar("u-beto", { siteName: "Espaço do Beto", primaryColor: "#2563eb", secondaryColor: "#1e293b", accentColor: "#ff0000", darkPrimaryColor: "#60a5fa", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24", youtubeUrl: "http://youtube.com/beto" });
// cida: escuro personalizado, claro no padrão; os seis links https
apar("u-cida", { siteName: "Cida", primaryColor: "#2563eb", secondaryColor: "#1e293b", accentColor: "#b45309", darkPrimaryColor: "#000001", darkSecondaryColor: "#cbd5e1", darkAccentColor: "#fbbf24", discordUrl: "https://a.test/1", githubUrl: "https://a.test/2", youtubeUrl: "https://a.test/3", instagramUrl: "https://a.test/4", linkedinUrl: "https://a.test/5", twitchUrl: "https://a.test/6" });
// dani: sem linha de Appearance.

// Conteúdo, sessão, conta, notificações: nada disso pode mudar.
const colunasContents = cols("contents");
const conteudo = (id, ownerId, slug, parentId = null) => {
  const base = { id, authorId: ownerId, title: slug, slug, type: "DOCUMENT", status: "PUBLISHED", parentId, order: 0, body: "texto", ...now() };
  const linha = {};
  for (const k of Object.keys(base)) if (colunasContents.includes(k)) linha[k] = base[k];
  ins("contents", linha);
};
conteudo("c-ana-1", "u-ana", "intro");
conteudo("c-ana-2", "u-ana", "filho", "c-ana-1");
conteudo("c-beto-1", "u-beto", "intro");
conteudo("c-admin-1", "u-admin", "intro");
ins("session", { id: "s-1", token: "tok-ficticio-1", expiresAt: new Date(Date.now() + 3.6e6).toISOString(), userId: "u-ana", ...now() });
ins("account", { id: "a-1", accountId: "u-ana", providerId: "credential", userId: "u-ana", password: "hash-ficticio", ...now() });
const notif = (id, userId) => {
  const ks = cols("notifications");
  const base = { id, userId, type: "MODERATION", severity: "WARNING", title: "t", text: "x", data: "{}", createdAt: agora, ...now() };
  const linha = {};
  for (const k of Object.keys(base)) if (ks.includes(k)) linha[k] = base[k];
  ins("notifications", linha);
};
notif("n-1", "u-ana");
notif("n-2", "u-beto");

const contar = () => ({
  user: db.prepare(`SELECT COUNT(*) n FROM "user"`).get().n,
  contents: db.prepare(`SELECT COUNT(*) n FROM "contents"`).get().n,
  session: db.prepare(`SELECT COUNT(*) n FROM "session"`).get().n,
  account: db.prepare(`SELECT COUNT(*) n FROM "account"`).get().n,
  notifications: db.prepare(`SELECT COUNT(*) n FROM "notifications"`).get().n,
  appearances: db.prepare(`SELECT COUNT(*) n FROM "appearances"`).get().n,
  emails: db.prepare(`SELECT id, email, handle, role FROM "user" ORDER BY id`).all(),
  contentIds: db.prepare(`SELECT id, authorId, slug, parentId FROM "contents" ORDER BY id`).all(),
});
const antes = contar();
db.close();

deploy();

const d2 = new Database(dbFile);
const depois = {
  user: d2.prepare(`SELECT COUNT(*) n FROM "user"`).get().n,
  contents: d2.prepare(`SELECT COUNT(*) n FROM "contents"`).get().n,
  session: d2.prepare(`SELECT COUNT(*) n FROM "session"`).get().n,
  account: d2.prepare(`SELECT COUNT(*) n FROM "account"`).get().n,
  notifications: d2.prepare(`SELECT COUNT(*) n FROM "notifications"`).get().n,
  appearances: d2.prepare(`SELECT COUNT(*) n FROM "appearances"`).get().n,
  emails: d2.prepare(`SELECT id, email, handle, role FROM "user" ORDER BY id`).all(),
  contentIds: d2.prepare(`SELECT id, authorId, slug, parentId FROM "contents" ORDER BY id`).all(),
};
for (const k of ["user", "contents", "session", "account", "notifications", "appearances"]) check(`${k}: contagem preservada (${antes[k]})`, antes[k] === depois[k], `${antes[k]} -> ${depois[k]}`);
check("usuários (id, e-mail com ponto e sublinhado, handle, papel) idênticos", JSON.stringify(antes.emails) === JSON.stringify(depois.emails));
check("conteúdo (id, dono, slug, pai) idêntico", JSON.stringify(antes.contentIds) === JSON.stringify(depois.contentIds));
check("PRAGMA foreign_key_check vazio", d2.prepare("PRAGMA foreign_key_check").all().length === 0);
check("PRAGMA integrity_check ok", d2.prepare("PRAGMA integrity_check").get().integrity_check === "ok");

const links = (dono) => d2.prepare(`SELECT icon, url, "order" FROM "footer_links" WHERE ${dono === null ? '"ownerId" IS NULL' : '"ownerId" = ?'} ORDER BY "order"`).all(...(dono === null ? [] : [dono]));
const forma = (l) => l.map((x) => `${x.order}:${x.icon}=${x.url}`).join(" | ");
check("site: só os https, na sequência e renumerados (discord, youtube sem espaços, twitch)", forma(links(null)) === "0:discord=https://discord.gg/abc | 1:youtube=HTTPS://youtube.com/c/x | 2:twitch=https://twitch.tv/site", forma(links(null)));
check("admin: github e twitch (0 e 1)", forma(links("u-admin")) === "0:github=https://github.com/admin | 1:twitch=https://twitch.tv/admin", forma(links("u-admin")));
check("ana: só o discord https (javascript: descartado)", forma(links("u-ana")) === "0:discord=https://discord.gg/ana", forma(links("u-ana")));
check("beto: nenhum (http descartado)", links("u-beto").length === 0, forma(links("u-beto")));
check("cida: os seis, na ordem", links("u-cida").map((l) => l.icon).join(",") === "discord,github,youtube,instagram,linkedin,twitch", forma(links("u-cida")));
check("dani: nenhum", links("u-dani").length === 0);
const ids = d2.prepare(`SELECT id FROM "footer_links"`).all().map((r) => r.id);
check("ids dos links: únicos, 24 caracteres hexadecimais", new Set(ids).size === ids.length && ids.every((i) => /^[0-9a-f]{24}$/.test(i)), ids.slice(0, 3).join(","));

const ap = (id) => d2.prepare(`SELECT * FROM "appearances" WHERE "ownerId" = ?`).get(id);
const palc = (a) => [a.primaryColor, a.secondaryColor, a.accentColor];
const pale = (a) => [a.darkPrimaryColor, a.darkSecondaryColor, a.darkAccentColor];
check("ana: as duas paletas e o nome viram nulos (padrão antigo, sem distinguir caixa)", palc(ap("u-ana")).every((v) => v === null) && pale(ap("u-ana")).every((v) => v === null) && ap("u-ana").siteName === null, JSON.stringify(ap("u-ana")));
check("beto: mudou UMA cor clara -> as três permanecem; o escuro vira nulo", JSON.stringify(palc(ap("u-beto"))) === JSON.stringify(["#2563eb", "#1e293b", "#ff0000"]) && pale(ap("u-beto")).every((v) => v === null) && ap("u-beto").siteName === "Espaço do Beto", JSON.stringify(ap("u-beto")));
check("cida: claro nulo e escuro (uma cor mudada) com as três", palc(ap("u-cida")).every((v) => v === null) && JSON.stringify(pale(ap("u-cida"))) === JSON.stringify(["#000001", "#cbd5e1", "#fbbf24"]), JSON.stringify(ap("u-cida")));
check("admin: claro personalizado intacto; escuro no padrão vira nulo; nome intacto", JSON.stringify(palc(ap("u-admin"))) === JSON.stringify(["#112233", "#445566", "#778899"]) && pale(ap("u-admin")).every((v) => v === null) && ap("u-admin").siteName === "Portal do admin", JSON.stringify(ap("u-admin")));
check("nenhum modo ficou com uma ou duas cores nulas", ["u-admin", "u-ana", "u-beto", "u-cida"].every((id) => [palc(ap(id)), pale(ap(id))].every((p) => p.filter((v) => v === null).length % 3 === 0)));
check("appearances: colunas de URL e logo/favicon antigos sumiram", !["logoUrl", "faviconUrl", "discordUrl", "githubUrl", "youtubeUrl", "instagramUrl", "linkedinUrl", "twitchUrl"].some((c) => tem2("appearances", c)));
function tem2(t, c) { return d2.prepare(`PRAGMA table_info("${t}")`).all().some((x) => x.name === c); }
check("configurations: colunas antigas sumiram; novas com os padrões", !tem2("configurations", "discordUrl") && !tem2("configurations", "logoUrl") && tem2("configurations", "logoImageId") && tem2("configurations", "modeIconPair"));
const conf = d2.prepare(`SELECT * FROM "configurations" WHERE "id" = 'default'`).get();
check("configurations: nome preservado; showLogo=1, showName=1, par sun_moon, título Espaços", conf.siteName === "Meu site" && conf.showLogo === 1 && conf.showName === 1 && conf.modeIconPair === "sun_moon" && conf.directoryTitle === "Espaços", JSON.stringify(conf));
const indices = d2.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('footer_links','contents','user')`).all();
const nomes = indices.map((i) => i.name);
check("índice parcial do rodapé do site presente, com WHERE", indices.some((i) => i.name === "footer_links_site_icon_key" && /WHERE\s+"?ownerId"?\s+IS NULL/i.test(i.sql ?? "")));
check("índice parcial de contents presente", nomes.includes("contents_root_owner_slug_key"), nomes.join(","));
check("índices de user presentes (e-mail, handle, avatar)", ["user_email_key", "user_handle_key", "user_avatarImageId_key"].every((n) => nomes.includes(n)), nomes.join(","));
let unico = false;
try { d2.prepare(`INSERT INTO "footer_links" (id, ownerId, icon, url, "order", updatedAt) VALUES ('x1', NULL, 'discord', 'https://dup.test', 9, ?)`).run(agora); } catch { unico = true; }
check("o índice parcial recusa um segundo discord no rodapé do site", unico);
let fkImagem = false;
try { d2.pragma("foreign_keys = ON"); d2.prepare(`UPDATE "user" SET "avatarImageId" = 'inexistente' WHERE id = 'u-ana'`).run(); } catch { fkImagem = true; }
check("avatarImageId com chave estrangeira para images", fkImagem);
d2.close();
console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas`);
