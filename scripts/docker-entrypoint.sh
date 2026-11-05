#!/bin/sh
# Ponto de entrada da imagem do Vitrine (imagem pública; ver Dockerfile e docker-compose.yml).
#
# 1. Se o contêiner começou como root, ajusta o dono de /data (o diretório do banco, montado do
#    servidor) e volta a se executar como o usuário sem privilégios `node`. Assim, quem instala não
#    precisa de `chown` no servidor, e nenhum comando do Vitrine roda como root.
# 2. Ao iniciar o servidor (o comando padrão), prepara o banco: aplica as migrações, grava a
#    configuração padrão do site e, se ADMIN_EMAIL e ADMIN_PASSWORD estiverem definidas, cria o
#    administrador inicial. As três etapas são idempotentes e rodam a cada início; numa atualização,
#    as migrações da versão nova são aplicadas sozinhas.
# Outros comandos (`docker compose run --rm vitrine npm run db:backup ...`) rodam sem a preparação.
set -e

# Como no `npm run` e no `npx`: o seed do Prisma chama o `tsx` pelo nome.
export PATH="/app/node_modules/.bin:$PATH"

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown node:node /data
  exec setpriv --reuid=node --regid=node --init-groups sh "$0" "$@"
fi

if [ "$1" = "node_modules/.bin/next" ] && [ "$2" = "start" ]; then
  echo "Vitrine: aplicando as migrações do banco..."
  node_modules/.bin/prisma migrate deploy
  echo "Vitrine: garantindo a configuração padrão do site..."
  node_modules/.bin/prisma db seed
  if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
    echo "Vitrine: conferindo o administrador inicial..."
    # Não impede o início do servidor: o erro fica no log (docker compose logs vitrine).
    node_modules/.bin/tsx --tsconfig jsconfig.json scripts/create-admin.js \
      || echo "Vitrine: o administrador inicial não foi criado; confira ADMIN_EMAIL e ADMIN_PASSWORD no .env."
  fi
fi

exec "$@"
