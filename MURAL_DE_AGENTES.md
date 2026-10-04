# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.
> **O que já foi atendido está em `doc/ref/mural-arquivo.md`** (somente leitura; use `grep -n` pelo identificador, não o leia inteiro). **Leia neste arquivo só a sua tarefa (`A-nnn`), os `[MERGE]` e os `[PEDIDO]` que lhe dizem respeito.**

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto o remove e o move para o arquivo).

**Fases** (Cap. 3 §3.2): F1 Especificação, F2 Fundação e a especificação multiusuário (F2b) **concluídas**; F2b em implementação: A-013 (Dados, M15) e A-014 Parte 1 (Core, M16) **integradas em 2026-10-04** (M-012, M-013); **abertas, em paralelo e sem sobreposição de arquivos: A-014 Parte 2 (Core, API), A-015 etapa 1 (UI) e A-016 (Dados, pequena)**; a A-014 Parte 3 (páginas) e as etapas 2 a 5 da A-015 aguardam. O M07 e a A-003 (páginas públicas) estão suspensos e foram reescopados pelo M17; F3 a F7 seguem depois (Cap. 6).

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · permanente — Como começar (resumo; o histórico completo está no arquivo)

1. **Leiam pouco e certo:** `CLAUDE.md`, `DESENVOLVEDORES.md` §1 e §3 a §9 (do §6, só a parte do seu agente) e **a sua tarefa abaixo**. Da documentação, só as seções que a tarefa cita (`grep -n 'label{sec:...}'` nos `.tex`; o Cap. 5 está em arquivos por tema, `doc/tex/capitulos/cap5/`). Não leiam um capítulo inteiro, nem o mural inteiro, nem o arquivo.
2. **Worktree próprio** (`git worktree add ../vitrine-<agente> -b <branch> main`), `npm ci`, `cp .env.example .env` (valores fictícios), `npx prisma generate`. Nenhum agente trabalha na cópia principal, que fica na `main`. Sem `git push`.
3. **Especificação:** o que a documentação não cobrir é `[RFC]` aqui; não improvisem requisito, rota, coluna nem cor. Cada commit cita os IDs (RF, RN, UC, M, CT).
4. **Antes de pedir merge:** `npm run lint`, `npm run build` e `npm test` (mais `npm run test:e2e` se tocou o Core ou as telas); pedido no modelo de `DESENVOLVEDORES.md` §4, **curto** (formato fixo, no máximo cerca de 40 linhas; o diff e os commits têm o detalhe).
5. **Segurança e ambiente (resumo):** nunca `.env*`, chaves ou tokens reais; nunca `npm audit fix --force` (ADR-019 e ADR-032); a CSP só existe em produção (verifiquem telas novas sobre `npm run build` e `npm run start`); o `next build` não consulta o banco (`getSiteConfiguration`); só tokens de tema (`text-on-primary`, nunca `text-white`; modo noturno pela classe `dark`); os componentes da UI não conhecem o dono: recebem tudo por *props*.
6. **Capturas de tela:** `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` lista os arquivos exatos em `doc/tex/figuras/`. Não editem `.tex`.

---

### A-014 · [TAREFA] Arquiteto → @Core · 2026-10-03 · PARTE 1 ATENDIDA (M-013, merge `7bfc931`, 2026-10-04; R-009) · PARTE 2 ABERTA · PARTE 3 aguarda a UI — M16 e M17 (parte do Core)

**Estado.** A **Parte 1** (M16: autorização por dono e contas) está na `main`; o texto do pedido M-013 está em `git show d561ac0:MURAL_DE_AGENTES.md` (o Cap. 5 §5.6 e §5.10 e o Cap. 6 já refletem o que foi entregue). Restam duas partes, **independentes entre si e da UI**: a Parte 2 (só API e revalidação) abre agora; a Parte 3 (páginas) espera a etapa 1 da A-015 (UI).

**Primeiro passo de cada parte (modo local; `DESENVOLVEDORES.md` §3):** *worktree* novo a partir da `main` (`git worktree add ../vitrine-core -b feat/core-espacos-api main` na Parte 2); `npm ci`; `cp .env.example .env` (valores fictícios); `npx prisma generate`. Sem *push*; o mural se edita na cópia principal. **Leiam (só estas seções; `grep -n 'label{sec:' doc/tex/capitulos/cap5/*.tex`):** Cap. 5 §5.7 (`cap5/isr.tex`: revalidação por espaço e 404), §5.10 (`api.tex`), §5.11 (`rotas.tex`), §5.12 (`seguranca.tex`) · Cap. 4: RN10, RN15, RN19, RN23, RN26 · ADR-024, ADR-026, ADR-027, ADR-030. (O histórico das decisões, R-006 a R-009, está em `doc/ref/mural-arquivo.md`; já foi reconciliado nos capítulos: consulte só se algo não casar.)

#### Parte 2 — API: moderação, notificações, revalidação por espaço e ajustes da R-009 (`feat/core-espacos-api`)
1. **Moderação (RF34, RN19, RN26, ADR-027; CT51, parte do servidor):** ligue `allowForeign` em `PATCH` e `DELETE` de `/api/contents/:id`. O administrador despublica, edita e exclui conteúdo **de outro dono** com `reason` obrigatório (1 a 500 caracteres; no `DELETE`, em `?reason=`; sem ele, 422), a `version` da RN18 vale também aqui, e o dono recebe `notify` (`MODERATION`, com o motivo, a ação e o conteúdo). Reordenar conteúdo alheio **continua 403** (não é moderação). A moderação é uma transação com a notificação, e a revalidação do item 3 vale para o espaço do dono.
2. **Rotas de notificações (RF33, RN19, RN26; CT50, parte do servidor):** `GET /api/notifications` (`?unread=1`, `unreadCount` ao lado de `data`, paginação por cursor), `PATCH /api/notifications/:id` (`read` ou `dismissed`; a de outro usuário responde **404**) e `POST /api/notifications/read-all`, sempre filtradas pelo dono da sessão (inclusive o administrador). A resposta traz o **texto em português** montado a partir de `type` e `data` (suspensão, reativação, senha redefinida, moderação; o de contraste só quando existir). A de contraste (`notify`/`resolveNotification`) **fica fora**: depende do P-013 (avisos por modo, da UI).
3. **Revalidação por espaço (RN10, ADR-030; CT44, CT22 e CT32 no que for de servidor):** substitua `revalidatePath("/", "layout")` por **caminhos literais**, calculados **antes e depois** de cada escrita com `getPublicPaths(ownerId, nodeId)` (do Dados), conforme a Tabela do Cap. 5 §5.7: criar, excluir, renomear, mover, reordenar ou mudar o estado invalida a página inicial do espaço e os caminhos antigos e novos do nó e dos descendentes; só o corpo invalida a página do documento; aparência, `handle` (antigo e novo) e suspensão invalidam o espaço inteiro; configuração do site invalida só `/` (`revalidatePath('/', 'page')`). **Nunca** `revalidatePath("/", "layout")` por mudança de espaço ou do site. Os testes verificam as chamadas literais (sem páginas ainda).
4. **Ajustes da R-009 (decisões do Arquiteto sobre as dúvidas do M-013):** (a) auto-suspensão e auto-exclusão respondem **403 `FORBIDDEN`**, e o 409 `LAST_ADMIN` fica para o último administrador de fato (a regra de dados já existe em `db.js`); (b) `DELETE /api/users/:id` responde **200 com `data: { id, content, roots, renamed }`**, em vez de 204; (c) o corpo do `PATCH` de conteúdo que **não** altera o corpo continua sem `version`.
5. **Opcional (R-003, item 2):** `E2E_CHROMIUM_PATH` na configuração do Playwright, para ambientes sem o navegador do Playwright (integração contínua); no modo local, `npx playwright install chromium` basta.
**Critérios de aceite:** CT50 e CT51 (servidor), CT44 (chamadas literais), CT42 ajustado; **mutações** na moderação (`allowForeign`, o motivo obrigatório, a notificação ao dono, a recusa da reordenação alheia) e na revalidação (caminho antigo, caminho novo, descendentes), com o relato de quantas foram aplicadas e detectadas; `lint`, `build`, `npm test` e `test:e2e`; pedido de merge no modelo de `DESENVOLVEDORES.md` §4.

#### Parte 3 — páginas: espaços, portal, editor, `/admin/senha` e Proxy (`feat/core-espacos-paginas`; será detalhada depois da Parte 2 e da etapa 1 da A-015)
O layout raiz estático (sem dados do banco; ADR-030); `/[handle]` e `/[handle]/[...slug]` com `generateStaticParams` só dos publicados e sem dados no *build* (a aparência do dono entra no layout do espaço); o portal `/` (texto do administrador e diretório, `listPublicSpaces`); o Proxy para o `handle` inexistente e a medição do custo de consultar também o documento; `requireSession({ role?, path })`, com `notFound()` para papel insuficiente e o redirecionamento a `/admin/senha` quando há senha provisória (a página `/admin/senha` e o arquivo de rota são do Core, com o formulário da UI); as páginas do editor (P-012: dono antes de renderizar, `?pai=` só com coleção do próprio usuário, `version` nas *props*); CT43, CT45, CT46 e CT21/CT31 de ponta a ponta.

**Status:** **Parte 2 ABERTA** (2026-10-04). A Parte 3 aguarda.

---

### A-015 · [TAREFA] Arquiteto → @UI · 2026-10-03 (aberta em 2026-10-04) · ETAPA 1 ABERTA — M18 (base) e ajustes do editor e do login; as etapas 2 a 5 aguardam

**Estado.** O Dados (M15) e a Parte 1 do Core (M16) estão na `main`: o banco, a autorização e as rotas de que a UI precisa existem. A etapa 1 **não depende da Parte 2 do Core** e pode andar em paralelo com ela (arquivos diferentes: UI em `src/components/**`, `globals.css`, `theme.js`). As etapas 2 a 5 são detalhadas e abertas depois.

**Primeiro passo (modo local; `DESENVOLVEDORES.md` §3):** `git worktree add ../vitrine-ui -b feat/ui-aparencia-base main`; no *worktree*, `npm ci`, `cp .env.example .env` (valores fictícios) e `npx prisma generate`. Sem *push*; o mural se edita na cópia principal. **Leiam (só estas seções):** Cap. 5 §5.9 (`cap5/tema.tex`: Tabelas de paletas padrão e de neutros, aplicação por envoltório, script do modo de cor, contraste por modo), §5.11 (`rotas.tex`, só o inventário), §5.12 (`seguranca.tex`, só a CSP, `sec:arq-csp`) · Cap. 4: RN08, RN09, RN18, RN27, RF31, RF32 · ADR-025, ADR-031 · Cap. 6, M17 e M18 · `DESENVOLVEDORES.md` §6 (UI). (Se mexer no editor, as notas 10 a 15 da A-010 e a R-004, em `doc/ref/mural-arquivo.md`, ainda valem: leia-as só nesse caso.)

**Tarefas da etapa 1 (`feat/ui-aparencia-base`)**
1. **Tokens e neutros por modo (M18):** em `globals.css`, os neutros noturnos da Tabela do Cap. 5 §5.9 sob `.dark` (com o foco e o halo por modo), `color-scheme` por modo, as variáveis `--vitrine-light-*` e `--vitrine-dark-*` e as regras do envoltório `.vitrine-tema` (Código do §5.9, no **mesmo elemento** do atributo `style`), e `--vitrine-on-primary` e `--vitrine-on-secondary` **por modo**. Todo componente existente usa só tokens e fica legível nos dois modos.
2. **`src/lib/theme.js` por modo (P-013, CT48, CT24):** `contrastWarnings(paleta, modo)` (ou assinatura equivalente que o Core possa chamar) com os pares da Tabela do §5.9 (a clara contra `#FFFFFF`, a noturna contra `#0A0A0A`), a mesma forma `{ code, field, ratio, minimum, message }` e o `field` distinguindo a paleta (`darkPrimaryColor` etc.); `readableTextOn` por modo; as paletas padrão não geram aviso (teste). Avise o Core quando chegar à `main` (pelo mural): é o que destrava as notificações de contraste.
3. **Modo de cor do leitor (RF32, RN27, CT47):** o *script* do `<head>` (Código do §5.9) como constante de um módulo da UI, que o Core importa no layout raiz, e o seletor Claro, Escuro, Automático (`ColorModeToggle`, `localStorage` na chave `vitrine:modo`), com testes de interação; **verificado no navegador, sobre o *build* de produção, sem violação de CSP e sem piscar na primeira pintura**.
4. **Ajustes que a API do M16 exige (R-009):** o `LoginForm` mostra o 403 `BANNED_USER` com o motivo e o prazo (`message`) e continua com a mensagem genérica nos demais erros; o editor (`ContentEditor`/`content-client.js`) envia `version` (o `updatedAt` aberto) no `PATCH` que altera o corpo e trata o 409 `VERSION_CONFLICT` (a versão atual vem em `details[0].value`): **mostra o texto do servidor e o do autor e deixa o autor escolher qual enviar**, sem perder nenhum (RN18, CT53, parte do editor); o 403 do conteúdo alheio e o 422 sem `version` têm mensagem em português.
**Critérios de aceite:** CT24, CT47, CT48, CT53 (editor) e o que for da RN27; **mutações** nos pontos de segurança e de contraste (os pares por modo, o texto sobre cada cor, o *script* do modo, o envio da `version`, o conflito), com o relato; `lint`, `build`, `npm test`; e o ensaio no navegador sobre `npm run build` e `npm run start`; pedido de merge no modelo de `DESENVOLVEDORES.md` §4, com as capturas nos dois modos em `doc/tex/figuras/` nos caminhos dos *placeholders*.

**Ordem prevista das etapas seguintes:** (2) layout do espaço, leitura pública por espaço, portal e diretório (M17, reescopo do M07), junto da Parte 3 do Core; (3) formulário de aparência com as duas paletas e o aviso por modo (M18, reescopo do M11); (4) notificações (M19); (5) painel por dono, usuários, moderação e troca de senha (M20, reescopo do M10).

**Status:** **Etapa 1 ABERTA** (2026-10-04).

---

### A-016 · [TAREFA] Arquiteto → @Dados · 2026-10-04 · ABERTO (pequena) — tornar `ownerId` obrigatório (P-014)

Condição do P-014 cumprida: o M-013 está na `main` e todas as chamadas em `src/` já passam o dono (`contents/route.js`, `contents/[id]/route.js`, `contents/reorder/route.js`, `_lib/contents.js`). **Tarefa:** em `src/lib/db.js`, `getContentTree({ ownerId, onlyPublished })` e `reorderContents(items, { ownerId })` passam a exigir `ownerId` (`INVALID_INPUT` se faltar), sem a ramificação "todos os donos"; atualize os testes do Dados que ainda chamam sem dono e acrescente o teste da recusa. **Primeiro passo (modo local):** `git worktree add ../vitrine-dados -b feat/dados-owner-obrigatorio main`, `npm ci`, `cp .env.example .env` (valores fictícios) e `npx prisma generate`; sem *push*. **Fora do escopo:** qualquer outra mudança de dados. **Verificação:** `lint`, `build`, `npm test` (e confira com `grep -rn "getContentTree\|reorderContents" src` que nenhuma chamada deixou de passar o dono) e as mutações do teste novo; pedido de merge no modelo de `DESENVOLVEDORES.md` §4. Não toca `src/app/**`: pode andar em paralelo com a Parte 2 do Core e com a etapa 1 da UI.

**Status:** **ABERTO** (2026-10-04).

---

---

## Solicitações de merge

*(nenhum pedido aberto)*

## Pedidos entre domínios

*(nenhum pedido aberto)*

## Respostas do Arquiteto

*(nenhuma ativa; R-001 a R-009 estão em `doc/ref/mural-arquivo.md`)*
