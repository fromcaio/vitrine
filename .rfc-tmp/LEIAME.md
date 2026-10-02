# Evidência do RFC do Core (A-012, Parte 1)

Branch descartável `rfc/core-multiusuario`; **não será integrada** e não tem pedido de merge. Tudo aqui é código de
prova de conceito: nada disto vai para a `main`. Versões: better-auth 1.7.6, Next.js 16.3.7, Prisma 7.10.0,
`better-sqlite3` 12.11.1, Node.js 24. Segredos e dados são fictícios; os bancos ficam em `.rfc-tmp/db/` (ignorados
pelo Git) e nenhum arquivo `.env*` foi lido.

## Como reproduzir

```bash
npm ci && npx prisma generate
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > .rfc-tmp/schema-gerado.sql
node .rfc-tmp/lib/make-template.mjs            # cria .rfc-tmp/db/template.db com o SQL gerado
.rfc-tmp/run.sh e1-admin-plugin                # grava e1.out (stdout) e e1.err (stderr)
node .rfc-tmp/show.mjs .rfc-tmp/e1.out         # leitura compacta
```

O `prisma/schema.prisma` deste *worktree* tem campos de rascunho (`role`, `banned`, `banReason`, `banExpires`,
`handle`, `username`, `displayUsername`, `mustChangePassword` em `User`; `impersonatedBy` em `Session`), **somente**
para as provas. O `db push --accept-data-loss` não foi usado (a CLI do Prisma o bloqueia para agentes): o banco-modelo
nasce do SQL de `migrate diff`, aplicado com o `better-sqlite3`.

## Provas

| Arquivo | Proposta | O que prova |
|---|---|---|
| `e1-admin-plugin.mjs`, `e1b-personificacao.mjs`, `e1c-ultimo-admin.mjs` | 1, 4 | `create-user` com o cadastro público desabilitado; papéis; `update-user` bruto; personificação; suspensão; último administrador |
| `e2a-username-plugin.mjs`, `e2b-handle-proprio.mjs` (`--hooks`) | 2 | plugin `username` × campo `handle` próprio, com e sem validação em `databaseHooks` |
| `e3-senha-provisoria.mjs` | 3 | marcador `mustChangePassword`, troca de senha, redefinição e sessões |
| `e4-encapsulamento.mjs`, `lib/guard.mjs` | 4 | 45 rotas brutas, lista de permitidas, tentativas de contorno, limites, origem, forma dos erros |
| `e5-autorizacao.mjs`, `lib/authz.mjs`, `lib/route.mjs` | 5, 9 | matriz papel × ação, ordem das verificações com sessões reais |
| `e6-paginas-proxy.mjs`, `lib/pages.mjs` | 6 | o que o cookie traz, cache de cookie, `requireSession` com papel |
| `e7-app/`, `e7-revalidacao-por-espaco.mjs`, `e7b-proxy-404.mjs` | 7 | revalidação por espaço (`next build` + `next start`), 404 em cache, Proxy |
| `e8-comandos.mjs`, `lib/cli.mjs` | 8 | contrato de `admin:create` e `admin:reset-password` |
| `e9-cotas-abuso.mjs` | 9 | cota de conteúdos, bytes, leitura limitada do corpo, custo do *hash* |
| `e10-riscos.mjs` | 10 | fixação de sessão, cookie, enumeração, campos das rotas brutas, CSRF |

`e7` precisa do servidor do mini-aplicativo:

```bash
E7_DATA=$PWD/.rfc-tmp/e7-data.json node node_modules/next/dist/bin/next build .rfc-tmp/e7-app
E7_DATA=$PWD/.rfc-tmp/e7-data.json PORT=3221 node node_modules/next/dist/bin/next start .rfc-tmp/e7-app
node .rfc-tmp/e7-revalidacao-por-espaco.mjs
# para o e7b: recompilar não é preciso; subir com E7_PROXY=1 e rodar node .rfc-tmp/e7b-proxy-404.mjs
```
