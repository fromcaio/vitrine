#!/usr/bin/env python3
"""mutacoes.py -- mutações do Arquiteto nos pontos de segurança (a confiança vem do que o Arquiteto reexecuta).

Uso:  python3 doc/revisao/mutacoes.py --dominio core|dados --repo <worktree-de-revisão>
Aplica uma mutação por vez, roda o conjunto de testes do domínio, restaura o arquivo (sempre, mesmo em erro)
e imprime só DETECTADA / ESCAPOU e o total. "NÃO ACHOU" significa que o código mudou: atualize a lista abaixo.
Uma mutação que ESCAPA é um achado: ou o teste é fraco (peça reforço ao agente), ou a mutação é equivalente
(justifique no pedido de merge). Rode SEMPRE em um worktree de revisão, nunca na cópia principal.
"""
import argparse, shutil, subprocess, sys

NPX = shutil.which("npx") or "npx"  # no Windows, `npx` é `npx.cmd` e o subprocess não o acha sem o caminho

CORE=[
 ("src/lib/authz.js","  if (!ROLES.includes(/** @type {any} */ (actor.role))) return FORBIDDEN;\n","","M1 papel desconhecido deixa de falhar fechado"),
 ("src/lib/authz.js","if (rule === \"any\") return { allowed: true, foreign: true };","if (rule === \"any\") return { allowed: true, foreign: false };","M2 recurso alheio deixa de ser marcado como moderação"),
 ("src/app/api/_lib/route.js","if (decision.foreign && !spec.allowForeign) throw new ApiError(403, \"FORBIDDEN\", FORBIDDEN_MESSAGE);","","M3 administrador escreve em conteúdo alheio"),
 ("src/lib/authz.js","return Number.isNaN(expires) || expires > now.getTime();","return Number.isNaN(expires) || expires < now.getTime();","M4 prazo da suspensão invertido"),
 ("src/app/api/_lib/auth-guard.js","new Set([\"GET /get-session\", \"POST /sign-in/email\", \"POST /sign-out\"])","new Set([\"GET /get-session\", \"POST /sign-in/email\", \"POST /sign-out\", \"GET /list-sessions\"])","M5 lista de permitidas ganha rota bruta"),
 ("src/lib/authz.js","new Set([\"profile:change-password\", \"users:read\"])","new Set([\"profile:change-password\", \"users:read\", \"content:list\"])","M6 senha provisória libera listar conteúdo"),
 ("src/app/api/_lib/route.js","if (spec.mutation && !isSameOrigin(request)) {","if (false) {","M7 verificação de origem desligada"),
 ("src/app/api/contents/[id]/route.js","if (\"body\" in patch && version === undefined) {","if (false) {","M8 PATCH do corpo sem version aceito"),
 ("src/app/api/users/[id]/ban/route.js","if (params.id === actor.id) {","if (false) {","M9 admin suspende a si mesmo"),
 ("src/app/api/users/[id]/route.js","if (params.id === actor.id) {","if (false) {","M10 admin exclui a si mesmo"),
 ("src/lib/authz.js","\"users:update\": { scope: \"resource\", admin: \"any\", user: \"none\" }","\"users:update\": { scope: \"resource\", admin: \"any\", user: \"own\" }","M11 usuário comum edita usuários (papel/handle)"),
 ("src/lib/authz.js","\"site:update\": { scope: \"collection\", admin: \"any\", user: \"none\" }","\"site:update\": { scope: \"collection\", admin: \"any\", user: \"any\" }","M12 usuário comum altera o site"),
 ("src/app/api/_lib/route.js","if (spec.mutation && spec.rate) {\n        const taken","if (false) {\n        const taken","M13 limite de taxa desligado"),
 ("src/app/api/contents/route.js","authorId: actor.id }","authorId: input.authorId ?? actor.id }","M14 authorId do corpo vale"),
 ("src/lib/authz.js","  if (!isNonEmptyString(ownerId)) return FORBIDDEN;\n","","M15 ação de recurso sem dono não falha fechada"),
 ("src/lib/authz.js","  if (!Object.hasOwn(POLICY, action)) return FORBIDDEN;\n","","M16 ação desconhecida não falha fechada"),
 # M-015 (A-014 Parte 2): moderação, notificações e revalidação por espaço
 ("src/app/api/contents/[id]/route.js","{ action: \"content:update\", mutation: true, rate: \"content\", load: loadContent, allowForeign: true }","{ action: \"content:update\", mutation: true, rate: \"content\", load: loadContent }","M17 PATCH deixa de ser moderação (allowForeign)"),
 ("src/app/api/contents/[id]/route.js","{ action: \"content:delete\", mutation: true, rate: \"content\", load: loadContent, allowForeign: true }","{ action: \"content:delete\", mutation: true, rate: \"content\", load: loadContent }","M18 DELETE deixa de ser moderação (allowForeign)"),
 ("src/app/api/contents/[id]/route.js","  if (reason === undefined) {\n    throw new ApiError(422","  if (false) {\n    throw new ApiError(422","M19 moderação sem motivo aceita"),
 ("src/lib/validators.js",".string({ error: \"Informe o motivo.\" })\n  .trim()\n",".string({ error: \"Informe o motivo.\" })\n","M20 motivo só de espaços aceito"),
 ("src/app/api/contents/[id]/route.js","updateContent(params.id, patch, { limits, expectedVersion: version, notification: notification ?? undefined })","updateContent(params.id, patch, { limits, expectedVersion: version })","M21 edição moderada não avisa o dono"),
 ("src/app/api/contents/[id]/route.js","await deleteContent(params.id, { notification: notification ?? undefined });","await deleteContent(params.id);","M22 exclusão moderada não avisa o dono"),
 ("src/app/api/notifications/[id]/route.js","if (!(await getNotification(actor.id, params.id))) {","if (false) {","M23 notificação alheia deixa de ser 404"),
 ("src/app/api/notifications/route.js","{ unreadOnly: unread, take: limit + 1, cursor }","{ unreadOnly: unread, take: limit + 1 }","M24 cursor de paginação ignorado"),
 ("src/app/api/_lib/revalidation.js","const urls = revalidateSnapshots(before, after);","const urls = revalidateSnapshots(after);","M25 revalidação esquece o caminho antigo"),
 ("src/app/api/_lib/revalidation.js","const urls = revalidateSnapshots(...before, after);","const urls = revalidateSnapshots(after);","M26 revalidação esquece o handle antigo"),
 ("src/lib/revalidate.js","for (const slugs of paths) urls.add(spaceUrl(handle, slugs));","","M27 revalidação esquece os caminhos do espaço"),
 ("src/lib/revalidate.js","    revalidatePath(\"/\");\n","    revalidatePath(\"/\", \"layout\");\n","M28 portal invalida o layout raiz (todos os espaços)"),
 ("src/app/api/contents/[id]/route.js","if (foreign && MOVE_FIELDS.some((field) => field in patch)) throw","if (false) throw","M29 moderação move o conteúdo alheio"),
 # M-019 e M-021 (A-014 Parte 3a): contraste por modo, layouts por proprietário, requireSession e editor
 ("src/app/api/_lib/contrast.js","return `${scope === \"site\" ? \"contrast-site\" : \"contrast\"}:${mode}`;","return `contrast:${mode}`;","M30 chave de deduplicação sem o escopo do site"),
 ("src/app/api/_lib/contrast.js","      await resolveNotification(userId, dedupeKey);\n      continue;","      continue;","M31 contraste que passa a atender não resolve a notificação"),
 ("src/app/api/_lib/contrast.js","COLOR_MODES.map((mode) =>","[\"light\"].map((mode) =>","M32 avisos só do modo claro"),
 ("src/app/api/configuration/route.js","await syncContrastNotifications({ userId: actor.id, scope: \"site\", byMode });","await syncContrastNotifications({ userId: actor.id, scope: \"appearance\", byMode });","M33 notificação do site com o escopo da aparência"),
 ("src/app/layout.js","<script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />","","M34 layout raiz sem o script do modo de cor"),
 ("src/app/_lib/site.js","return typeof value === \"string\" && HEX_COLOR.test(value) ? value : null;","return typeof value === \"string\" ? value : null;","M35 cor do banco vai ao style sem validação (injeção de CSS)"),
 ("src/app/admin/_lib/session.js","if (role !== undefined && session.user.role !== role) notFound();","","M36 requireSession sem a checagem de papel"),
 ("src/app/admin/_lib/session.js","if (!session) redirect(","if (false) redirect(","M37 requireSession sem a checagem de sessão"),
 ("src/app/admin/_lib/editor.js","if (!content || content.authorId !== userId || content.type !== \"DOCUMENT\") notFound();","if (!content) notFound();","M38 editor abre o documento de outro dono"),
 ("src/app/admin/_lib/editor.js","if (!parent || parent.authorId !== userId || parent.type !== \"COLLECTION\") notFound();","if (!parent) notFound();","M39 ?pai= de coleção alheia aceito"),
 ("src/lib/auth.js","`${motive}.`","motive","M40 motivo da suspensão sem ponto antes do prazo"),
]

DADOS=[
 ("src/lib/db.js","if (loses && (next.role !== \"admin\" || isSuspended(next, now))) {","if (false) {","M1 LAST_ADMIN no updateUserProfile"),
 ("src/lib/db.js","where: { type: \"CONTRAST\", OR: [{ readAt: { lt: cutoff } }, { resolvedAt: { lt: cutoff } }] },","where: { OR: [{ readAt: { lt: cutoff } }, { resolvedAt: { lt: cutoff } }] },","M2 poda por idade atinge moderação e conta"),
 ("src/lib/db.js","current.updatedAt.getTime() !== version.getTime()","false","M3 VERSION_CONFLICT desligado"),
 ("src/lib/db.js","return { OR: [{ banned: false }, { banExpires: { lt: now } }] };","return { banned: false };","M4 suspensão vencida continua oculta"),
 ("src/lib/db.js","{ type: { in: [\"MODERATION\", \"ACCOUNT\"] }, readAt: { not: null } },","{ type: { in: [\"MODERATION\", \"ACCOUNT\"] } },","M5 teto remove moderação não lida antes da hora"),
 ("src/lib/db.js","      await assertAnotherActiveAdmin(tx, user, now);\n\n      const owned","      const owned","M6 deleteUser sem LAST_ADMIN"),
 ("prisma/migrations/20261004120000_multiusuario/migration.sql","UPDATE \"configurations\" SET \"primaryColor\" = '#2563eb' WHERE \"primaryColor\" = '#3b82f6';","UPDATE \"configurations\" SET \"primaryColor\" = '#2563eb';","M7 migração sobrescreve cor personalizada"),
 ("prisma/migrations/20261004120000_multiusuario/migration.sql","  AND \"authorId\" <> (SELECT \"rootOwner\" FROM \"tree\" WHERE \"tree\".\"id\" = \"contents\".\"id\");","  AND 0;","M8 migração não normaliza o dono"),
 ("src/lib/db.js","if (total >= quota.maxContentsPerUser) {","if (total > quota.maxContentsPerUser) {","M9 cota off-by-one"),
 ("src/lib/db.js","await tx.verification.deleteMany({ where: { identifier: user.email } });","","M10 deleteUser deixa verificação"),
]

ap = argparse.ArgumentParser()
ap.add_argument("--dominio", choices=["core", "dados"], required=True)
ap.add_argument("--repo", required=True)
a = ap.parse_args()
MUT, ALVO, TEMPO = (CORE, "tests/core", 400) if a.dominio == "core" else (DADOS, "tests/dados", 300)
res = []
for f, old, new, name in MUT:
    p = f"{a.repo}/{f}"
    s = open(p, encoding="utf-8", newline="").read()
    if s.count(old) != 1:
        print("NÃO ACHOU", name, s.count(old), flush=True)
        continue
    open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new))
    try:
        r = subprocess.run([NPX, "vitest", "run", ALVO], cwd=a.repo, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TEMPO)
        killed = r.returncode != 0
    finally:
        open(p, "w", encoding="utf-8", newline="").write(s)
    res.append((name, killed))
    print(("DETECTADA " if killed else "ESCAPOU   ") + name, flush=True)
print(sum(k for _, k in res), "de", len(res), "detectadas")
sujo = subprocess.run(["git", "status", "--short"], cwd=a.repo, capture_output=True, text=True).stdout.strip()
if sujo:
    print("ATENÇÃO: a árvore ficou suja:\n" + sujo)
    sys.exit(1)
