#!/usr/bin/env bash
# ensaio-http.sh -- sobe o BUILD DE PRODUÇÃO de um worktree de revisão em banco novo e roda o ensaio adversarial.
# Uso: bash doc/revisao/ensaio-http.sh <worktree-de-revisão> [ensaio.mjs]
# Requer: node_modules instalado e `npx prisma generate` já feito no worktree. Só valores FICTÍCIOS.
set -u
WT="$(cd "${1:?informe o worktree de revisão}" && pwd)"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENSAIO="${2:-$AQUI/ensaio-autorizacao.mjs}"
PORTA="${ENSAIO_PORTA:-3100}"
D="$(mktemp -d "${TMPDIR:-/tmp}/vitrine-ensaio.XXXXXX")"
export DATABASE_URL="file:$D/v.db" BETTER_AUTH_SECRET="segredo-ficticio-ensaio-0123456789abcdef" \
       BETTER_AUTH_URL="http://127.0.0.1:$PORTA" NEXT_TELEMETRY_DISABLED=1 ENSAIO_URL="http://127.0.0.1:$PORTA"
cd "$WT" || exit 1
for p in $(ps -eo pid,args | awk '/next-server|next start/ && !/awk/ {print $1}'); do kill "$p" 2>/dev/null; done
sleep 1
npm run build > "$D/build.log" 2>&1 || { echo "build falhou (veja $D/build.log)"; tail -20 "$D/build.log"; exit 1; }
npx prisma migrate deploy 2>&1 | tail -1
npx prisma db seed 2>&1 | tail -1
ADMIN_EMAIL=admin@exemplo.test ADMIN_PASSWORD=senha-admin-ficticia-1 ADMIN_HANDLE=admin-site npm run admin:create 2>&1 | tail -2 | head -1
nohup npx next start -p "$PORTA" > "$D/server.log" 2>&1 &
SERVIDOR=$!
for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORTA/login" && break; sleep 1; done
node "$ENSAIO" > "$D/ensaio.out" 2>&1
for p in $(ps -eo pid,args | awk '/next-server|next start/ && !/awk/ {print $1}'); do kill "$p" 2>/dev/null; done
echo "FALHAS: $(grep -c '^FALHA' "$D/ensaio.out")   OK: $(grep -c '^OK' "$D/ensaio.out")   (saída completa: $D/ensaio.out)"
grep '^FALHA' "$D/ensaio.out" | head -20
