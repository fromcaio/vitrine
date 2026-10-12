# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.
> **O que já foi atendido está em `doc/ref/mural-arquivo.md`** (somente leitura; use `grep -n` pelo identificador, não o leia inteiro). **Leia neste arquivo só a sua tarefa (`A-nnn`), os `[MERGE]` e os `[PEDIDO]` que lhe dizem respeito.**

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto o remove e o move para o arquivo).

**Fases** (Cap. 3 §3.2): F1 Especificação, F2 Fundação e a especificação multiusuário (F2b) **concluídas**; F2b em implementação: A-013 a A-019 **integradas** (M-012 a M-037, 2026-10-04 a 2026-10-06: banco, autorização, moderação, notificações, modo noturno, layouts, editor, espaços públicos, portal, Proxy, senha provisória, formulários e páginas de aparência e de configuração, notificações na interface, backup do SQLite); **o épico v1 (aparência, mídia e navegação; A-025 a A-030, decidido em 07/10/2026) é a última fase de funcionalidades**; a A-024 (Core) foi integrada em 09/10 (M-043) e resta o fechamento (A-030). F5 (a instalação em uma VPS limpa com HTTPS, CT29, a cargo do Engenheiro Chefe; a imagem já foi verificada em contêiner) e a documentação final vêm depois do épico.

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

## Épico v1: aparência, mídia e navegação (decidido em 07/10/2026; **fonte: `doc/ref/epico-v1-aparencia-midia.md`**)

**ÉPICO v1 CONCLUÍDO em 10/10/2026: todas as tarefas (A-024 a A-031) e o fechamento (A-030) estão ATENDIDOS; ver o R-036 no arquivo (estado final, contagens e pendências declaradas). O texto abaixo é o histórico da decisão.** O Engenheiro Chefe trouxe 10 mudanças e **aprovou** as decisões **D-30 a D-38** (imagens como BLOB no SQLite reencodadas com `sharp`, sem SVG; modo por cookie lido só pelo *script* do `<head>`, sem "automático"; topbar e logo no site **e** em cada espaço; o par de ícones do botão de modo escolhido pelo administrador; rodapé por ícones, até 8 por dono, um por ícone, preenchido por cada usuário; avatar; título do diretório). **Está especificado no LaTeX desde 08/10/2026 (A-025, atendida; `1973d40` e `2cbf264`; o que é *alvo* está assim marcado) e, no código, só a parte dos Dados e da UI (M21, M22 e M23 integradas em 08/10; no Core, a M25/A-031, a M24/A-029 e a A-024 em 09/10; falta só o fechamento, A-030).** **Decisão do Engenheiro Chefe (08/10/2026; ADR-034, item 11, opção B): a CSP da v1 MANTÉM `https:` no `img-src` (`'self' data: https:`)** e o `MarkdownRenderer` **não muda**: as imagens externas dos documentos continuam carregando (o IP do leitor segue vazando a quem hospeda a imagem, como hoje; risco aceito). Logo, favicon e avatar saem **só** de `/media`. **Backlog v1.1:** upload de imagens de conteúdo e CSP sem `https:`. **Congelamento de escopo:** depois desta lista, ideia nova vai para o backlog "v1.1". **Os prompts de cada agente estão em `doc/ref/prompts/{arquiteto,dados,ui,core}.md`.** **Ordem de lançamento:** (1) ~~Arquiteto A-025~~ (**feita**) **e UI A-027** em paralelo; (2) ~~Dados A-026~~ (**feita**, M-039; a UI A-027 também, M-038); (3) ~~UI A-028~~ (**feita**, M-040, 09/10); (4) com a A-026, a A-027 e a A-028 integradas: **Core: ~~A-031~~ (feita, M-041, 09/10), ~~depois A-029~~ (feita, M-042, 09/10) e por último ~~A-024~~** (feita, M-043, 09/10; **um pedido por sessão**, decisão do Engenheiro Chefe) (**o Core não roda agora**); (5) **Arquiteto A-030**, a integração e o fechamento. **No máximo dois agentes pesados ao mesmo tempo** (o Arquiteto só escrevendo documentação não conta). **No máximo dois agentes pesados ao mesmo tempo.** **Revisão do Engenheiro Chefe CONCLUÍDA (08/10/2026): o gate foi levantado.** Alterações de 08/10: o **administrador mantém handle, espaço e conteúdo** (a limitação proposta em 07/10 foi retirada); a tela de aparência ganha o **seletor Sistema/Minha página** para o administrador; o **limite pelo peso do DOM** é backlog v1.1 (§12 do documento-fonte).

---

## Solicitações de merge


### [MERGE] feat/core-ver-pagina-publica · Core · P-025 · SHA f178cf5 (1 commit sobre 231c666)
**O que mudou:** (1) `viewHref` no `ContentEditor` de `/admin/conteudo/[id]` e de `/admin/usuarios/[id]/conteudo/[contentId]`: o caminho público `/{handle}/{slugs}` (cada segmento com `encodeURIComponent`) ou `null`; só o caminho vai ao cliente. (2) `modeIconPair={configuration?.modeIconPair ?? undefined}` no `AppearanceForm` de `/admin/aparencia` (alvo "página"; o alvo "sistema" não muda).
**Regra:** nova função `publicViewHref(ownerId, contentId)` em `src/app/admin/_lib/editor.js` (montagem de caminho, do Core): dono com `handle` (`findUserById`) e ativo (`getUserByHandle`, que trata a suspensão, RN23) e `getPublicPaths` (árvore podada: documento e TODOS os ancestrais PUBLISHED, RN15). Sem mudança em `db.js`, `content-tree.js`, API, esquema, dependência ou variável. Na moderação o dono é `owner.id`, nunca o administrador.
**Arquivos:** `src/app/admin/_lib/editor.js`, as 3 páginas acima, `tests/core/view-href.test.js` (novo, 12), ajustes em `editor-pages`, `admin-usuarios-pages` e `admin-forms-pages` (+1), `e2e/ver-pagina.spec.js` (novo, 3).
**Evidência:** lint limpo; `npm run build` sem banco e com banco migrado, ok; `npm test -- --maxWorkers=4`: 4054 aprovados + 40 *skipped* (140 arquivos); `npm run test:e2e`: 119 aprovados + 1 *skipped*, sem violação de CSP. Mutações (todas detectadas, linha de base verde, Vitest conferido): ignorar o estado do ancestral, ignorar a suspensão, usar o id do administrador na moderação, devolver o caminho em rascunho, tirar o `encodeURIComponent`. `test:a11y` não rodado (nenhum estado novo).
**Desvios:** nenhum. Escolha conservadora: o e2e cria contas fictícias próprias (`ver-dona`) e não as remove, como os demais specs.

*(Nenhuma outra solicitação de merge pendente.)*

*(M-001 a M-046 estão em `doc/ref/mural-arquivo.md`)*

## Pedidos entre domínios

### P-018 · [PEDIDO] Arquiteto → @UI · 2026-10-09 · **ABERTO, baixa prioridade** (não bloqueia nada; pode ir na próxima branch da UI, p. ex. nos ajustes de acessibilidade da A-030) — dois testes que faltam no rodapé (achados das mutações do M-040, R-031)
(1) `tests/ui/footer-model.test.js`: `linkUrlError("github", "https://exemplo.com/a b")` deve recusar (hoje a mutação que tira o `/\s/.test(text)` sobrevive, porque o único caso com espaço é `https://a b.com`, que o `new URL` já recusa); (2) o mesmo arquivo: `linkUrlError("email", "mailto:a?bcc=x@exemplo.com")` e com `#` na parte local devem recusar (a mutação que tira `?` e `#` da classe do `EMAIL_PATTERN` sobrevive; o caso atual, `…@exemplo.com?subject=oi`, é recusado pelo domínio). Sem mudança de comportamento. **Leiam:** R-031 no arquivo.
**Status:** **ABERTO.**


### P-025 · [PEDIDO] Arquiteto → @Core · 2026-10-11 · **ABERTO** — liga o `viewHref` e o `modeIconPair` (pendência do M-045)
(1) `viewHref` no `<ContentEditor>` de `src/app/admin/conteudo/[id]/page.js` e de `src/app/admin/usuarios/[id]/conteudo/[contentId]/page.js`: o caminho público `/{handle do dono}/{slugs da raiz ao documento}`, **só** quando o documento tem página pública pela regra da RN15 (espaço ativo e com `handle`; documento e todos os ancestrais publicados); senão `null`. Na moderação, o caminho é o do **dono**. (2) `modeIconPair={configuration.modeIconPair}` no `<AppearanceForm>` de `src/app/admin/aparencia/page.js`. Testes, mutações e e2e no prompt. **Leiam:** `doc/ref/prompts/core-ver-pagina-publica.md` (inteiro; branch `feat/core-ver-pagina-publica`). Prioridade: normal; não bloqueia nada.
**Status:** **ABERTO.**

### P-027 · [PEDIDO] Arquiteto → @UI · 2026-10-12 · **ABERTO** — o sino de notificações nas páginas públicas para quem está logado (pedido do Engenheiro Chefe)
Hoje, nas páginas públicas, o logado vê só o link "Administração"; o sino só existe no painel. O Chefe quer o sino também ali, ao lado do "Administração". **É da UI, não do Core:** as páginas públicas são estáticas e não sabem quem lê; a decisão é do navegador, como no `AdminLink` (cookie-marcador, um só `get-session`, depois o contador por `GET /api/notifications?limit=1`), com o `NotificationBell` reaproveitado e **carregado sob demanda** (o anônimo não paga nada: zero requisições e nenhum JavaScript novo). Sem sino com a senha provisória. Sem mudança de API, esquema nem requisito. O caso e2e correspondente é do Core, a pedir depois do merge. **Leiam:** `doc/ref/prompts/ui-sino-nas-paginas-publicas.md` (inteiro; branch `feat/ui-sino-publico`). Prioridade: normal; não bloqueia nada.
**Status:** **ABERTO.**

### P-028 · [PEDIDO] Arquiteto → @UI · 2026-10-12 · **ABERTO** — renomear coleção e subcoleção em `/admin/conteudo` (pedido do Engenheiro Chefe)
Ação "Renomear" nas linhas de coleção da árvore (não em documento nem na moderação), com diálogo de **título e endereço**: o endereço (`slug`) acompanha o título como na criação e muda a URL (`/maria/aeds-i/p1/x` → `/maria/aeds-ii/p1/x`); os links antigos deixam de funcionar (decisão do Chefe). **Só UI:** o `PATCH /api/contents/:id` já aceita `title` e `slug` (RF07) e os dois já são campos estruturais na revalidação. **Mesma sessão e mesma branch do P-027** (`feat/ui-sino-publico`), com um único `[MERGE]`. **Leiam:** `doc/ref/prompts/ui-renomear-colecao.md` (adendo; as regras da sessão são as do P-027). Prioridade: normal; não bloqueia nada.
**Status:** **ABERTO.**

## Respostas do Arquiteto

*(R-001 a R-039 estão em `doc/ref/mural-arquivo.md`)*
