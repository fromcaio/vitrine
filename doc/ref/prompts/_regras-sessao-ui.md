# Regras de sessão do Engenheiro de UI (comuns a todos os prompts a partir do P-027)

Os prompts da UI **não repetem** este texto: dizem "regras de `_regras-sessao-ui.md`" e trazem só o que é novo. Em caso de conflito, **vale o prompt da tarefa**.

## Papel e estilo
- **Engenheiro de UI** do Vitrine (Next.js 16.4, Tailwind 4, React 19), em modo local, Windows. Domínio: `src/components/**`, `src/app/globals.css`, `src/lib/theme.js`. Documentation-Driven Development: a documentação em `doc/tex/` é a Fonte da Verdade; especificação omissa ou errada é `[RFC]` no mural.
- Componentes **não conhecem o dono, a sessão nem o tema**: recebem por *props* ou buscam nas rotas `/api`. **Só tokens de tema** (`text-on-primary`, nunca `text-white` nem cor fixa; modo noturno pela classe `dark`). Mensagens em português; todo texto de servidor ou de usuário **escapado**. Esforço sugerido: high.
- **Leia só o que a tarefa cita** (`CLAUDE.md`; `DESENVOLVEDORES.md` §1, §3 a §5, §8, §9 e a sua parte do §6; os componentes e testes nomeados; no LaTeX, só a seção citada, por `grep -n 'label{…}'` e `Read` com `offset` e `limit`). Next.js 16 mudou: `node_modules/next/dist/docs/` só do tema usado.

## Fronteira
Só `src/components/**` e `globals.css`. **Não** edite `src/app/**`, `e2e/**`, `doc/**`, governança, o mural na sua branch, `package.json`, `.env.example` nem `eslint.config.mjs`. O que for do Core ou dos Dados é `[PEDIDO]` (diga no `[MERGE]`); se algo do servidor não se comportar como a tarefa supõe, **pare e diga** (não conserte no cliente). **Não baixe navegadores nem dependências.** Nunca leia, imprima nem versione `.env*`. Nunca `npm audit fix --force`.

## Ambiente e git
- **Não** trabalhe na cópia principal (`vitrine-monolito`, sempre na `main`), **não** troque a branch dela e **não** faça `git push` (se o Chefe pedir o envio da branch, só a branch, sem `--force`).
- **Primeiro passo:** `git worktree add ../<pasta> -b <branch> main`; no *worktree*, `npm ci`, `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (**fictício**; não copie o `.env.example`) e `npx prisma generate`. Confira `git worktree list` e `git branch --show-current` antes de cada commit. Nunca `file:/tmp/...` em `DATABASE_URL`. Para ver o app real: `npx prisma migrate deploy`, `npx prisma db seed`, `npm run admin:create` com `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_HANDLE` fictícios; o **Proxy só deixa passar `api`, `login` e *handles* ativos**.
- **Commits** pequenos, Conventional Commits em português, com os IDs no rodapé (`Refs: RF…, RN…, P-nnn`) e os *trailers* de atribuição do seu ambiente. Branch já enviada ao `origin`: só commits novos por cima (nada de *rebase*, `--amend` nem histórico reescrito).
- **Memória:** o Vitest já está limitado a 4 processos; **um** `build`, `next start`, `lighthouse` ou navegador por vez, e **encerre-os ao terminar** (Windows: parar a tarefa não mata o `node.exe` do `next start`; encerre pelo PID da porta). Comando encerrado por falta de memória: **pare, não relance sozinho** e avise.

## Verificação proporcional (padrão desta fase; o Chefe pediu, para poupar tempo)
**Você roda:** `npm run lint`; `npm run build` (padrão e com `DATABASE_URL` de diretório inexistente); `npx vitest run --related <arquivos que mudou>` (diga quais); a verificação **no navegador sobre `build` + `start`** (CSP sem violação; claro e noturno; 320 e 1280 px, mais as larguras que a tarefa pedir; teclado); **testes novos só do que é novo**; **mutações só sobre o novo** (relate aplicadas e detectadas; linha de base verde; **confira que o Vitest rodou**).
**Você NÃO roda** a suíte completa do Vitest, o `test:e2e` nem o `test:a11y`: o **Arquiteto os roda uma vez, na integração**, e junta todas as branches pendentes numa só rodada. Contraste e medidas: por cálculo dos tokens ou no navegador, e não pelo axe completo. `npm run lighthouse` só se a tarefa pedir (uma medição, mediana de 3).

## Entrega
1. Árvore limpa e commits feitos. Na **cópia principal** (na `main`), o `[MERGE]` no mural, no modelo de `DESENVOLVEDORES.md` §4, **curto (≤ ~40 linhas)**, em commit **exclusivo do mural** (`chore(mural): solicita merge de <branch> (UI, P-nnn)`), **relendo o mural antes de editar**. Traga as *props*/assinaturas novas, o que verificou e como, os testes existentes que ajustou (e por quê), **se algum e2e existente afirma o que mudou** (você não edita `e2e/**`) e o que o Core ou o Arquiteto precisam ligar ou documentar.
2. Resposta final: **(a) O que mudou** (≤ 10 linhas) · **(b) Evidência** (comando → resultado, mutações, medidas no navegador) · **(c) Branch e SHA** · **(d) Desvios, dúvidas e o que depende do Chefe**.
