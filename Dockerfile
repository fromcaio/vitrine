# Imagem do Vitrine (M13; Cap. 5 §5.13 e Apêndice D): dois estágios, uma só imagem com
# `next start`. A imagem leva a aplicação inteira, e não a saída mínima do Next.js, porque também
# executa `prisma migrate deploy`, `prisma db seed` e `npm run admin:create`, que precisam da CLI
# do Prisma, do tsx e do código-fonte.
#
# Nenhum segredo entra aqui: o segredo do better-auth e as variáveis do administrador inicial
# chegam só na execução, pelo arquivo de ambiente do docker-compose.yml.

# A mesma imagem-base nos dois estágios: o better-sqlite3 é um módulo nativo, compilado ou baixado
# para uma versão do Node.js e uma glibc (ADR-014). Node.js 24 é a versão do desenvolvimento.
ARG NODE_IMAGE=node:24-bookworm-slim

# --------------------------------------------------------
# Estágio de build: instala, gera o cliente do Prisma e compila
# --------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# python3, make e g++: só se o better-sqlite3 não tiver binário pré-compilado para a plataforma.
# openssl: o motor de migrações do Prisma é escolhido pela versão da libssl encontrada.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

# Dependências antes do código, para aproveitar o cache de camadas. `npm ci` completo: as
# dependências de desenvolvimento ficam, pois o seed e o admin:create rodam com o tsx.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# O build importa as rotas, que importam db.js: DATABASE_URL precisa estar definida, mas o banco
# não é consultado e nem o arquivo nem o diretório precisam existir (ADR-021).
ENV DATABASE_URL=file:/data/vitrine.db \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# --------------------------------------------------------
# Estágio de execução
# --------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# openssl: a libssl de que o motor de migrações do Prisma precisa (`prisma migrate deploy`).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Tudo do estágio de build, já com o dono certo: node_modules completo, .next, public, src (com
# src/generated/prisma), prisma, scripts e os arquivos de configuração. O ISR grava em
# /app/.next/cache, que precisa ser gravável pelo usuário que executa. `--chown` na cópia evita
# um `chown -R` posterior, que duplicaria as camadas.
COPY --from=build --chown=node:node /app ./

# /data é o ponto de montagem do volume do SQLite (docker-compose.yml).
RUN mkdir -p /data && chown node:node /data /app

# O contêiner começa como root só para ajustar o dono de /data; o ponto de entrada volta a se
# executar como `node` (setpriv) antes de qualquer comando do Vitrine. Ele também prepara o banco
# (migrações, configuração padrão e administrador inicial) quando o comando é o servidor.
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]

# Sem o npm como processo intermediário: os sinais de parada chegam ao servidor.
CMD ["node_modules/.bin/next", "start"]

# Metadados da imagem pública: o GitHub liga o pacote ao repositório pelo `source`.
LABEL org.opencontainers.image.title="Vitrine" \
      org.opencontainers.image.description="Sistema de publicação de conteúdo com Markdown e fórmulas LaTeX" \
      org.opencontainers.image.source="https://github.com/fromcaio/vitrine" \
      org.opencontainers.image.licenses="MIT"
