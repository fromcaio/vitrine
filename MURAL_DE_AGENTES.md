# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.
> **O que já foi atendido está em `doc/ref/mural-arquivo.md`** (somente leitura; use `grep -n` pelo identificador, não o leia inteiro). **Leia neste arquivo só a sua tarefa (`A-nnn`), os `[MERGE]` e os `[PEDIDO]` que lhe dizem respeito.**

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto o remove e o move para o arquivo).

**Fases** (Cap. 3 §3.2): F1 Especificação, F2 Fundação e a especificação multiusuário (F2b) **concluídas**; F2b em implementação: A-013 a A-018 **integradas** (M-012 a M-024, 2026-10-04 e 2026-10-05: banco, autorização, moderação, notificações, modo noturno, layout raiz estático, editor, espaços públicos, portal, Proxy, senha provisória e os formulários de aparência e de configuração); **abertas, em paralelo e sem sobreposição de arquivos: A-014 Parte 3c (Core: páginas de aparência e de configuração, portal com `revalidate` de 60 s e o SEO do M12) e A-015 etapa 4 (UI: notificações e acertos)**; a Parte 3d do Core (as demais páginas do painel e a moderação) e a etapa 5 da UI aguardam. F3 a F7 seguem depois (Cap. 6): F5 (imagem Docker com as rotas novas e a VPS, CT29), acessibilidade e Lighthouse, e a documentação final.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · permanente — Como começar (resumo; o histórico completo está no arquivo)

1. **Leiam pouco e certo:** `CLAUDE.md`, `DESENVOLVEDORES.md` §1 e §3 a §9 (do §6, só a parte do seu agente) e **a sua tarefa abaixo**. Da documentação, só as seções que a tarefa cita (`grep -n 'label{sec:...}'` nos `.tex`; o Cap. 5 está em arquivos por tema, `doc/tex/capitulos/cap5/`). Não leiam um capítulo inteiro, nem o mural inteiro, nem o arquivo.
2. **Worktree próprio** (`git worktree add ../vitrine-<agente> -b <branch> main`), `npm ci`, `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (`.env` fictício; **não** copie o `.env.example`, que só traz os nomes), `npx prisma generate`. Nenhum agente trabalha na cópia principal, que fica na `main`. Sem `git push`.
3. **Especificação:** o que a documentação não cobrir é `[RFC]` aqui; não improvisem requisito, rota, coluna nem cor. Cada commit cita os IDs (RF, RN, UC, M, CT).
4. **Antes de pedir merge:** `npm run lint`, `npm run build` e `npm test` (mais `npm run test:e2e` se tocou o Core ou as telas); pedido no modelo de `DESENVOLVEDORES.md` §4, **curto** (formato fixo, no máximo cerca de 40 linhas; o diff e os commits têm o detalhe).
5. **Segurança e ambiente (resumo):** nunca `.env*`, chaves ou tokens reais; nunca `npm audit fix --force` (ADR-019 e ADR-032); a CSP só existe em produção (verifiquem telas novas sobre `npm run build` e `npm run start`); o `next build` não consulta o banco (`getSiteConfiguration`); só tokens de tema (`text-on-primary`, nunca `text-white`; modo noturno pela classe `dark`); os componentes da UI não conhecem o dono: recebem tudo por *props*.
6. **Capturas de tela:** `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` lista os arquivos exatos em `doc/tex/figuras/`. Não editem `.tex`.

---

### A-014 · [TAREFA] Arquiteto → @Core · 2026-10-03 · PARTES 1, 2, 3A E 3B ATENDIDAS (M-013, M-015, M-019, M-021, M-022, M-024; R-009, R-010, R-014, R-016) · PARTE 3C ABERTA (2026-10-05) — M16, M17 e M12 (Core)

**Estado.** As Partes 1, 2, 3a e 3b estão na `main` (os pedidos: `doc/ref/mural-arquivo.md`, `grep -n 'M-022\|M-024\|M-019\|M-021'`): o Core entregou o layout raiz estático, os layouts por proprietário, o editor, as páginas públicas do espaço, o portal real, o Proxy dos espaços e a troca de senha. A etapa 3 da UI (M-023: `AppearanceForm`, `ConfigurationForm`, `ColorField`) também está: **as *props* exatas estão no M-023 do arquivo** (`grep -n 'M-023' doc/ref/mural-arquivo.md`). A **Parte 3c** liga os formulários às páginas do painel, ajusta o portal e entrega o SEO (M12); anda em paralelo com a etapa 4 da UI (arquivos diferentes).

**Primeiro passo (modo local; `DESENVOLVEDORES.md` §3):** *worktree* novo a partir da `main` (`git worktree add ../vitrine-core -b feat/core-painel-seo main`); `npm ci`; `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (`.env` fictício; **não** copie o `.env.example`); `npx prisma generate` (de novo depois de trocar de branch). Sem *push*; o mural se edita na cópia principal. **Leiam (só estas seções; `grep -n 'label{sec:' doc/tex/capitulos/cap5/*.tex`):** Cap. 5 §5.7 (`cap5/isr.tex`: a Tabela, o 404, o Proxy), §5.9 (`tema.tex`), §5.10 (`api.tex`: `/api/appearance` e `/api/configuration`), §5.11 (`rotas.tex`: rotas-alvo, layout raiz), §5.12 (a CSP) · Cap. 4: RF18, RF25, RF29, RF31, RN08, RN15, RN19, RN23, RN25, RNF07 · Cap. 6, M12 · ADR-021, ADR-024, ADR-030 · CT23, CT24, CT25, CT31.

#### Parte 3c — páginas de aparência e de configuração, portal e SEO (`feat/core-painel-seo`)
1. **`/admin/aparencia` e `/admin/configuracoes` (RF18, RF31; CT23, CT24):** a primeira usa `requireSession` e monta `AppearanceForm` com `initial` = `getAppearance(user.id)` (o registro como a API o devolve); a segunda usa `requireSession({ role: "admin" })` (usuário comum: `notFound()`) e monta `ConfigurationForm` com `initial` = `getConfiguration()` e `maxBodyBytes` = o limite de bytes do texto do portal (de `MAX_BODY_BYTES`, por `currentLimits()`). Cada página leva a sua `<h1>` e o que o painel pedir; o formulário traz tudo o mais (ver o M-023). Metadados `noindex`. *Spec* e2e: o dono salva a aparência pela interface (aviso por modo, a notificação `CONTRAST` em `GET /api/notifications`, e o espaço dele regenerado com a paleta nova, sem mexer no de outro dono); o administrador salva a configuração e o portal regenera; o usuário comum recebe 404 em `/admin/configuracoes`.
2. **Portal com `revalidate` de 60 s (decisão do Arquiteto; R-016):** o portal sai do *build* com os padrões e, em uma instância recriada, só assumiria o texto e o diretório na primeira revalidação (até 1 h). Com `revalidate = 60`, a primeira visita depois de 60 s regenera; mantenha `revalidatePath("/")` nas rotas. Teste e e2e (o portal regenera sem `PUT` depois do prazo, ou o teste do valor exportado).
3. **SEO e metadados (M12; RF25, RNF07; CT25, CT31):** (a) `generateMetadata` por página do espaço: `title` do conteúdo (já existe) e `description` do documento (o começo do texto, sem marcação, até uns 160 caracteres; a do espaço no início), e `metadataBase` a partir de `BETTER_AUTH_URL` (a URL pública base; sem ela, valem URLs relativas); (b) `src/app/robots.js`: libera os espaços públicos e bloqueia `/admin`, `/api` e `/login`, e aponta para o mapa do site; (c) **o mapa do site por espaço** (`/{handle}/sitemap.xml`, *route handler*, só conteúdo publicado, RN15, com `lastmod` do conteúdo; espaço suspenso, sem `handle` ou inexistente: o mesmo 404; atenção: o *matcher* do Proxy exclui caminhos com extensão, então o *handler* confere o espaço sozinho) e **um índice no portal** (`/sitemap.xml`, com os espaços do diretório); rascunho e subárvore de rascunho **nunca** aparecem (CT31); (d) a invalidação: um evento estrutural ou de estado atualiza o mapa do espaço (acrescente o caminho literal do mapa ao conjunto que `revalidateStructure` invalida, ou use um `revalidate` curto, e meça: o custo é desprezível). Metadados presentes no HTML pré-renderizado de cada documento (CT25).
**Critérios de aceite:** CT23, CT24, CT25, CT31 (o mapa do site), CT44 (o mapa entra na revalidação do espaço); **mutações** nos pontos novos (o papel de `/admin/configuracoes`, o registro lido de `getAppearance(user.id)` e não de outro usuário, o `revalidate` do portal, o filtro de publicados e de espaço ativo no mapa, o 404 do mapa de suspenso, o `robots` e o `description` sem marcação), com o relato de quantas foram aplicadas e detectadas; `lint`, `build` (também com `DATABASE_URL` de diretório inexistente e de banco vazio), `npm test` e `test:e2e`; verificação no navegador sobre `npm run build` e `npm run start` (CSP, os dois modos); pedido de merge no modelo de `DESENVOLVEDORES.md` §4 (pode ser em dois: itens 1 e 2, depois 3). **Se `eslint.config.mjs` ainda tiver a exceção do `PasswordChangeForm`, deixe-a:** o Arquiteto a remove quando a UI trocar o `<a href="/login">` por `<Link>` (etapa 4). **Ambiente:** `npx prisma generate` depois de trocar de branch; encerre o `next start` órfão pelo PID da porta.

**Depois (aguarda a etapa 4 e a 5 da UI):** a Parte 3d: as páginas `/admin/notificacoes`, `/admin/perfil`, `/admin/conteudo` (árvore), `/admin/usuarios`, `/admin/usuarios/[id]` e `/admin/usuarios/[id]/conteudo`, o fluxo de moderação do editor (que passa a enviar `reason`) e a troca do início do espaço pelo componente da UI.

**Status:** **Partes 1, 2, 3a e 3b ATENDIDAS**. **Parte 3c ABERTA** (2026-10-05).

---

### A-015 · [TAREFA] Arquiteto → @UI · 2026-10-03 · ETAPAS 1, 2 E 3 ATENDIDAS (M-017, M-020, M-023; R-012, R-015, R-017) · ETAPA 4 ABERTA (2026-10-05) · a etapa 5 aguarda — M19 e M20

**Estado.** As etapas 1, 2 e 3 estão na `main` (`doc/ref/mural-arquivo.md`: `grep -n 'M-017\|M-020\|M-023'`). A etapa 4 entrega as **notificações** (M19) e os **acertos** que as etapas anteriores deixaram; os componentes ficam isolados e testados, e as páginas (`/admin/notificacoes`, e o sino no cabeçalho do painel, que o Core liga) são do Core, na Parte 3d. Anda em paralelo com a Parte 3c do Core (arquivos diferentes: `src/components/**` contra `src/app/**`).

**Primeiro passo (modo local; `DESENVOLVEDORES.md` §3):** `git worktree add ../vitrine-ui -b feat/ui-notificacoes main`; no *worktree*, `npm ci`, `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (`.env` fictício; **não** copie o `.env.example`) e `npx prisma generate`. Sem *push*; o mural se edita na cópia principal. **Leiam (só estas seções):** Cap. 5 §5.10 (`cap5/api.tex`: `/api/notifications`, `PATCH /:id`, `read-all`, o contrato dos itens e o `?cursor=`), §5.11 (`rotas.tex`: o inventário), §5.12 (só a CSP) · Cap. 4: RF33, RN19, RN26, RNF05, RNF06 · ADR-026 · Cap. 6, M19 · `DESENVOLVEDORES.md` §6 (UI) · `doc/ref/mural-arquivo.md`: `grep -n 'M-020\|M-023'` (as *props* e o que já existe: `AdminShell`, `AdminHeader`, `AdminSidebar`).

**Tarefas da etapa 4 (`feat/ui-notificacoes`)** — os componentes não conhecem o dono; só tokens de tema; o texto de uma notificação vem **do servidor, em português, como texto puro** e é exibido **escapado** (nunca como HTML).
1. **`NotificationBell`** (Cliente; RF33, M19) no cabeçalho do painel: o contador de não lidas (`unreadCount`), com **rótulo acessível que o inclui** ("Notificações, 3 não lidas"), link para `/admin/notificacoes` e uma região `aria-live="polite"` que anuncia o aumento do contador; recebe o valor inicial por *props* e o **atualiza** ao voltar o foco à janela e por uma consulta periódica leve (`GET /api/notifications?limit=1`, que traz `unreadCount`; **pare** com a aba oculta; sem barra de rolagem, sem pedir demais: o limite de taxa é de 60 leituras por minuto). `AdminHeader` e `AdminShell` ganham a *prop* do sino (opcional, para o Core ligar).
2. **`NotificationList`** (Cliente; RF33): lista com título, texto, data e **gravidade com ícone e texto** (não só cor), o filtro "só as não lidas" (`?unread=1`), **marcar como lida** (`PATCH { read: true }`), **dispensar** (`{ dismissed: true }`), **marcar todas** (`POST /api/notifications/read-all`) e "carregar mais" pelo `nextCursor`; o `unreadCount` de cada resposta atualiza o sino (um evento do navegador ou uma *prop* de retorno: proponha no `[MERGE]`); **422 do cursor** (um cursor dispensado entre duas páginas) recomeça pela primeira página; **404** (já dispensada em outra aba) remove o item; 401, 403 e 429 em português; estado vazio.
3. **`AdminSidebar` e `AdminShell` por papel e por senha provisória:** recebem `role` e `mustChangePassword`; o menu real do painel (Visão geral, Conteúdo, Aparência, Notificações, Perfil e, só para o `admin`, Configurações e Usuários; as seções sem página aparecem como "em breve", como hoje) e, **com a senha provisória, só "Trocar a senha" e "Sair"**.
4. **`SpaceHome`** (`components/layout`): o início do espaço (RF29, D-16) no lugar da marcação mínima do Core: `{ name, description?, items: [{ id, title, href, kind }] }` e o estado "ainda sem conteúdo publicado"; Componente de Servidor, só tokens.
5. **Acertos:** troque o `<a href="/login">` do `PasswordChangeForm` e o do `SiteAppearanceForm` por `<Link>` (o Arquiteto remove a exceção do ESLint na integração); o `PasswordChangeForm` deve **continuar** descartando o estado do cliente depois de um 401 (verifique por teste; se `<Link>` não bastar, mantenha a navegação completa e diga no `[MERGE]`).
**Critérios de aceite:** CT50 (a parte da UI), RF33, RNF05 e RNF06; **mutações** (o rótulo com o contador, `aria-live`, o filtro de não lidas, ler, dispensar e marcar todas, o cursor e o 422, o 404, o escape do texto, o menu por papel e por senha provisória, o `SpaceHome` vazio); `lint`, `build`, `npm test`; **no navegador, sobre `npm run build` e `npm run start`**, com um arranjo temporário **não versionado** (páginas de ensaio no seu *worktree*, desfeitas antes do commit; **não edite `src/app/**`** salvo o `globals.css`), nos dois modos e em 320, 390, 768 e 1280 px, contra a API real (gere notificações por moderação e por contraste, como no ensaio da etapa 3), com o teclado e o leitor de tela (os *landmarks* e o anúncio do sino); pedido de merge no modelo de `DESENVOLVEDORES.md` §4, com as capturas dos *placeholders* que a etapa preencher **de verdade** (`make pendentes AGENTE=UI`; não se fabrica captura).

**Etapa seguinte (aguarda):** (5) o painel por dono (M20): a árvore do conteúdo (criar, editar, mover, excluir, estado; `ContentTree`, reordenar por botões), o formulário e a lista de usuários, a senha provisória exibida uma vez, a **moderação com motivo** (`ModerationDialog`) e o perfil.

**Status:** **Etapas 1, 2 e 3 ATENDIDAS**. **Etapa 4 ABERTA** (2026-10-05).

---

## Solicitações de merge

*(nenhum pedido aberto)*

## Pedidos entre domínios

*(nenhum pedido aberto)*

## Respostas do Arquiteto

*(nenhuma ativa; R-001 a R-017 estão em `doc/ref/mural-arquivo.md`)*
