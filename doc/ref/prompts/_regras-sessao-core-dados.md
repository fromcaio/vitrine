# Regras de sessão do Desenvolvedor Core e do Arquiteto de Dados (comuns aos prompts a partir da página inicial, P-031)

Os prompts do Core e dos Dados **não repetem** este texto: dizem "regras de `_regras-sessao-core-dados.md`" e trazem só o que é novo. Em conflito, **vale o prompt da tarefa**.

## Papel
- **Dados:** `prisma/**`, `src/lib/db.js`, `src/lib/content-tree.js`, `src/lib/limits.js`, `tests/dados/**`. **Core:** `src/app/**`, `src/proxy.js`, autenticação, validação (`src/lib/validators.js`), revalidação, `tests/core/**`, `e2e/**`. **Nenhum dos dois** edita `src/components/**` (é `[PEDIDO]` à UI), `doc/**`, governança, `.env.example`, `eslint.config.mjs`, nem o mural dentro da sua branch.
- Documentation-Driven Development: a documentação em `doc/tex/` é a Fonte da Verdade (o Arquiteto já a escreveu para a tarefa). Especificação omissa ou errada: `[RFC]` no mural. Leia **só as seções que a tarefa cita** (`grep -n 'label{…}'` e `Read` com `offset` e `limit`; nunca um capítulo inteiro). Next.js 16.4 e Prisma 7 mudaram: `node_modules/next/dist/docs/` e `.claude/skills/prisma-*` só do tema usado.
- Segurança: nunca ler, imprimir nem versionar `.env*`; só valores fictícios. Texto de usuário **sempre escapado**. Nunca `npm audit fix --force`. **Não baixe dependências nem navegadores.** `next build` não consulta o banco (guarda de `getSiteConfiguration`, ADR-021).

## Ambiente e git
- **Não** trabalhe na cópia principal (`vitrine-monolito`, sempre na `main`), **não** troque a branch dela e **não** faça `git push`.
- **Primeiro passo:** `git worktree add ../<pasta> -b <branch> main`; no *worktree*, `npm ci`, `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (**fictício**; não copie o `.env.example`) e `npx prisma generate`. Confira `git worktree list` e `git branch --show-current` antes de cada commit. Nunca `file:/tmp/...` em `DATABASE_URL` (no Windows vira `F:\tmp\...`). Teste que apaga diretório nunca recebe o `os.tmpdir()` real: use `tests/core/tmp-sandbox.js`. Teste de `version` não usa o relógio: use `aged()`.
- **Commits** pequenos, Conventional Commits em português, com os IDs no rodapé (`Refs: RF42, RN35, P-nnn`) e os *trailers* de atribuição do seu ambiente.
- **Memória:** um `build`, `test:e2e`, `next start` ou navegador por vez, e encerre-os ao terminar (Windows: parar a tarefa não mata o `node.exe` do `next start`; encerre pelo PID da porta). O Vitest já está limitado a 4 processos. Comando encerrado por falta de memória: **pare, não relance sozinho** e avise.
- Depois de trocar de branch ou atualizar a `main`: `npx prisma generate`.

## Verificação (proporcional)
**Você roda:** `npm run lint`; `npm run build` (padrão e com `DATABASE_URL` de diretório inexistente); `npm test -- --maxWorkers=4` **uma vez**, no fim (Core) ou só `npx vitest run tests/dados` (Dados); `npm run test:e2e` **uma vez**, no fim, se for o Core; **testes novos do que é novo**; **mutações só sobre o novo** (relate aplicadas e detectadas; linha de base verde; **confira que o Vitest rodou**). **Você NÃO roda** o `test:a11y` (o Arquiteto o roda na integração). Referência na `main`: ver o prompt da tarefa.

## Entrega
1. Árvore limpa e commits feitos. Na **cópia principal** (na `main`), o `[MERGE]` no mural, curto (≤ ~40 linhas), em commit **exclusivo do mural** (`chore(mural): solicita merge de <branch> (<Dados|Core>, P-nnn)`), **relendo o mural antes de editar**. Traga as assinaturas novas, o que verificou e como, os testes existentes que ajustou (e por quê) e o que o próximo agente ou o Arquiteto precisam saber.
2. Resposta final: **(a) O que mudou** (≤ 10 linhas) · **(b) Evidência** (comando → resultado, mutações, contagens) · **(c) Branch e SHA** · **(d) Desvios, dúvidas e o que depende do Chefe**. Você não pode perguntar ao Chefe durante a execução: na dúvida, escolha a opção mais conservadora, registre-a no `[MERGE]` e siga; se algo bloquear de fato, pare e reporte.
