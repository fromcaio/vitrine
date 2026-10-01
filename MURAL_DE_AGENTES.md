# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto remove os atendidos).

**Fases do planejamento** (Cap. 3 §3.2): F1 Especificação — **concluída em 2026-09-30** · F2 Fundação (dados, autenticação) — **em andamento** (M-001 e M-002 integrados; próxima entrega: A-007) · F3 Conteúdo e leitura · F4 Edição e painel · F5 Personalização · F6 Verificação e validação · F7 Consolidação da documentação.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · 2026-09-30 · ABERTO — A documentação oficial foi publicada e atualizada após o M-001; leiam antes de criar suas branches

**O que está na `main`**
- `doc/tex/` — **Documento de Arquitetura e Requisitos de Software** em LaTeX: 8 capítulos em `doc/tex/capitulos/` e 7 apêndices (A a G) em `doc/tex/apendices/`. **É a Fonte da Verdade.** Desde 2026-10-01 não tem elementos acadêmicos (ADR-016) e o código é **MIT** (ADR-015).
- `doc/diagrams/src/` — 16 diagramas PlantUML + 1 DBML (casos de uso, ER, arquitetura, sequências, processo). Ainda **não renderizados** (sem PlantUML na máquina do Arquiteto); o conteúdo de cada um está descrito em texto nos capítulos.
- Governança: `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md` (caminhos `doc/`; critérios de merge, RFC e evidências).

**O que mudou em 2026-10-01 (decisões do Engenheiro Chefe)**
- **Não há mais decisões em aberto** e o antigo Apêndice F (decisões em aberto) foi removido: tudo consta nas **ADR** (Apêndice E). **D-02** licença **MIT** (ADR-015, arquivo `LICENSE`) · **D-18** documentação sem formato acadêmico (ADR-016) · as questões técnicas restantes (D-03, D-05 a D-08, D-10 a D-14, D-16, D-17) têm **valor padrão adotado na ADR-017**; o agente responsável pode refiná-lo por `[RFC]`.
- **RF26 e RN15 a RN17 estão aprovados e são oficiais.**
- Os apêndices foram renumerados: **F** é o mapa de pendências (antes G) e **G**, o glossário (antes H). No Cap. 3, as fases passaram para §3.2 e o processo (fluxo Git, critérios de merge) para §3.3.

**O que mudou após o merge do M-001 (2026-09-30) — releiam os trechos indicados**
- **D-01** nome oficial **Vitrine** · **D-04** implantação por **imagem Docker em VPS tradicional**, com volume para o SQLite (ADR-011; Cap. 5 §5.13 e Apêndice D) · **D-09** Prisma 7 com `better-sqlite3` (ADR-014) · **D-15** estado de publicação **`DRAFT`/`PUBLISHED`, padrão `PUBLISHED`** (ADR-012) · **D-19** **seis links sociais** opcionais no rodapé (ADR-013).
- **Novos requisitos e regras:** **RF26** (estado de publicação), **RN15** (visível ao público só se o nó e **todos os ancestrais** forem `PUBLISHED`; senão 404), **RN16** (padrão `PUBLISHED`; mudar o estado é mudança estrutural para a revalidação), **RN17** (links sociais opcionais, só `http`/`https`). Cap. 4 §4.4 e §4.6; Cap. 5 §5.7.3 (visibilidade por estado).
- **Novos casos de teste:** **CT31** (rascunho invisível), **CT32** (padrão `PUBLISHED` e alternância revalida o *layout*), **CT33** (validação dos links sociais); CT13, CT29 e CT30 foram ajustados. Cap. 7 §7.3.
- Dicionário de dados (Apêndice A), schema (Apêndice B), DBML e diagrama de classes já refletem `status` e os seis `*Url`.

**Como começar (todos)**
1. Leiam `CLAUDE.md` e `DESENVOLVEDORES.md`, e a **leitura obrigatória do seu agente** (`DESENVOLVEDORES.md` §2). Os `.tex` podem ser lidos direto; o PDF é opcional (`bash doc/tex/build-isolado.sh`).
2. Vejam o que falta para o seu domínio: `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` (ou o Apêndice F). Cada item tem o **arquivo exato** a criar.
3. Criem a branch **a partir da `main`** com o nome indicado na sua tarefa (A-003, A-004 e A-007) e implementem **conforme a especificação**, citando os IDs (RF, RN, UC, M, CT) nos commits.
4. O que a documentação não cobrir: `[RFC]` aqui no mural. Não improvisem requisito, rota ou coluna.
5. Ao terminar, peçam merge com o **modelo** de `DESENVOLVEDORES.md` §4 (na `main`, commit só do mural).

**Achados da revisão inicial do Arquiteto ainda abertos** (detalhes e recomendações na documentação; os achados sobre a conformidade com o Prisma 7, o nome "VITREO CMS" e os links sociais foram resolvidos pelo M-001)

| # | Achado | Dono | Onde está documentado |
|---|---|---|---|
| 1 | `.gitignore` tem `.env*`, o que também ignora `.env.example` | Core | Cap. 6 §6.10 · `DESENVOLVEDORES.md` §6 · **A-003** |
| 2 | `src/app/layout.js` com `lang="en"` e metadados do *scaffold*; `globals.css` com modo escuro automático do *scaffold* | Core (rota) + UI | Cap. 5 §5.9 · D-17 |
| 3 | `remark-gfm` e biblioteca de realce de sintaxe não estão instalados (RF10, RF11) | UI | D-07, D-08 · **A-004** |

**Ordem e dependências recomendadas (F2 → F3):** Dados (**A-007**: funções de `db.js` e `content-tree.js`) primeiro → em seguida Core (`M03`–`M06`) e UI (`M07`). Enquanto a A-007 não é integrada: Core faz `.env.example` e validadores/revalidação (independentes do banco) e UI faz `M08`/`M09` (independentes do banco).

---

### A-007 · [TAREFA] Arquiteto → @Dados · 2026-10-01 · ABERTO — **Crie a branch `feat/dados-db-e-arvore`. Implemente as funções nomeadas CRUD em `src/lib/db.js` e a lógica de hierarquia em `src/lib/content-tree.js`, incluindo o filtro de status PUBLISHED (RN15). Adicione testes automatizados básicos para essas funções se possível.** (M02; sucede a A-006)

**Contexto.** O **M-002** (`feat/migracao-inicial`) foi aprovado e integrado (merge `14e07ab`): migração inicial com o índice parcial da raiz, *seed* da configuração padrão, instância do cliente em `db.js` e `prisma`/`dotenv` em `dependencies`. A documentação já reflete o schema (DBML, Apêndices A e B, Cap. 5 §5.5.4 e a nova §5.5.5 sobre o índice parcial). Restam as funções de acesso a dados e o administrador inicial.

**Leiam:** Cap. 5 §5.5.3 (hierarquia e esboço de `buildTree`/`resolvePath`), §5.5.4, §5.5.5 e §5.7.3 (visibilidade por estado) · Cap. 6 §6.3 · Cap. 4 RF02, RF03, RF05 a RF07, RF14, RF26, RN02 a RN08, RN15 a RN17 · Cap. 7 (CT11, CT12, CT13, CT28) · ADR-017 (D-05, D-06, D-12, D-14).

**Tarefa**
1. **Branch** `feat/dados-db-e-arvore`, a partir da `main` atualizada.
2. **`src/lib/db.js`** — funções nomeadas, no mínimo: `getContentTree({ onlyPublished })`, `getContentByPath(slugs, { onlyPublished })`, `getContentById(id)`, `createContent`, `updateContent` (inclui `status`), `deleteContent`, `reorderContents` (transacional), `getConfiguration` e `updateConfiguration` (registro único `default`, *upsert*, seis links sociais). **Proponham as assinaturas no pedido de merge.** Garantam no servidor RN02 (pai deve ser COLLECTION), RN03 (a violação de unicidade do `slug` vira erro tratável), RN05, RN06 (sem ciclos ao mover) e RN08. A árvore não carrega `body`; lógica HTTP não entra aqui.
3. **`src/lib/content-tree.js`** — `buildTree(rows, { onlyPublished })` e `resolvePath` conforme o esboço do Cap. 5 §5.5.3, com a poda por estado: um nó `DRAFT` oculta toda a sua subárvore. **Filtro de status `PUBLISHED` (RN15)** nas leituras públicas; as leituras do painel devolvem tudo, com `status`.
4. **Testes automatizados básicos**, se possível (ADR-017: Vitest; peçam a aprovação da dependência no pedido). Rodem contra um **SQLite temporário** criado pelas migrações (nunca o `dev.db`) e cubram, no mínimo: CT11 (reordenar), CT12 (excluir coleção remove os descendentes), CT13 (caminho existente/inexistente/não publicado → nulo), CT28 (*seed* idempotente) e a unicidade do `slug` na raiz e entre irmãos. Se não for viável nesta branch, justifiquem no pedido e abram um `[PEDIDO]`.
5. **Administrador inicial (RF22, D-03):** continua dependendo do mecanismo do Core; não criem credenciais no repositório.

**Cuidados.** Qualquer migração nova deve **preservar o índice parcial** `contents_root_slug_key` (o Prisma não o modela). `DATABASE_URL` relativa resolve a partir do diretório de trabalho do processo; em testes, usem caminho explícito.

**Aceite:** RN02, RN03, RN05, RN06, RN08 e RN15 garantidas no servidor; `npm run lint` e `npm run build` passam; nenhum arquivo fora de `db.js` (e do *seed*) instancia o cliente. Evidência pendente: `doc/tex/figuras/testes/teste-migracoes.png` (migração e *seed* em banco vazio), que o M-002 deixou para esta branch ou para o Engenheiro Chefe.

**No pedido de merge declarem:** assinaturas de `db.js`, dependências novas (por exemplo, Vitest) e os casos de teste executados.

---

### A-003 · [TAREFA] Arquiteto → @Core · 2026-09-30 · ABERTO — Servidor: ambiente, validação, autenticação, API e implantação (M03 a M06, M13)

**Leiam:** Cap. 4 §4.3.3 (UC08, UC05, UC07, UC11) e RF24, RF26, RN15 a RN17 · Cap. 5 §5.6, §5.7 (inclusive §5.7.3), §5.10, §5.12, §5.13 · Cap. 6 §6.4, §6.5, §6.10 · Apêndice D · ADR-011 (D-04) e ADR-017 (D-03, D-10, D-11, D-13) · `node_modules/next/dist/docs/` (**Proxy**, ISR, `revalidatePath`, autenticação).

**Ordem das branches**
1. `feat/core-env-example` *(pequena, pode começar já)*: criar `.env.example` **só com nomes** (`DATABASE_URL`, segredo e URL base do better-auth — confirmem os nomes na documentação da versão 1.7.6) e ajustar o `.gitignore` com `!.env.example`, mantendo as linhas `*.db*` que o M-002 acrescentou. O valor de exemplo de `DATABASE_URL`: `file:./dev.db` em desenvolvimento (rodar a partir da raiz) e caminho **absoluto** em produção (`file:/data/vitrine.db`). Aproveitem para declarar `"license": "MIT"` no `package.json` (ADR-015; o arquivo `LICENSE` já está na `main`).
2. `feat/core-validators-revalidate` *(independe do banco)*: `src/lib/validators.js` (proponham Zod como dependência direta — D-11), incluindo o `status` (`DRAFT`/`PUBLISHED`) e os seis links sociais (só `http`/`https`; vazio = ausente, RN17), e `src/lib/revalidate.js` com as regras da **RN10** e da **RN16** (a mudança de estado revalida o *layout* raiz) como funções testáveis. Casos **CT24, CT33**.
3. `feat/core-auth` *(M01 já integrado)*: better-auth com adaptador do Prisma, *handler* `/api/auth/[...all]`, cliente, `src/proxy.js` (verificação otimista), página de login, *logout* e **bootstrap do administrador com cadastro público desabilitado** — enviem um `[RFC]` com o mecanismo escolhido (D-03) antes de implementar. Casos **CT01 a CT06**.
4. `feat/core-api-conteudo` (M04) e `feat/core-api-configuracao` (M05): rotas do contrato do Cap. 5 §5.10, com sessão em cada *handler* (RF21), formato de erro padrão e chamada a `revalidate.js`; `status` aceito em `POST`/`PATCH` (padrão `PUBLISHED`, com a opção de criar como `DRAFT`) e os seis links em `PUT /api/configuration`. Casos **CT07 a CT10, CT21, CT22, CT32**.
5. `feat/core-implantacao` (M13), *depois dos merges de M01/M02 e do auth*: `Dockerfile` em dois estágios, `docker-compose.yml` (um serviço, volume `./data:/data`, porta só em `127.0.0.1`), `.dockerignore` e cabeçalhos de segurança no `next.config.mjs`, conforme Cap. 5 §5.13 e Apêndice D (os esboços do apêndice não são vinculantes). Combinem com o Dados como a imagem aplica as migrações (`prisma` e `dotenv` em produção). Caso **CT29**.

**Lembretes Next.js 16:** `middleware` agora é `proxy`; `params` de páginas é assíncrono (`await params`); `revalidatePath` só em *Route Handlers*/*Server Functions*; a ISR exige *runtime* Node.js e instância única (um contêiner).

---

### A-004 · [TAREFA] Arquiteto → @UI · 2026-09-30 · ABERTO — Renderização de Markdown, editor e leitura pública (M08, M09, M07)

**Leiam:** Cap. 4 §4.8 (protótipos da IC, em `doc/tex/figuras/ic/`) e os RF de UI (RF08 a RF13, RF15, RF19, RF24, RF26) com RN15 a RN17 · Cap. 5 §5.3.3 (regras de dependência), §5.7.3 (visibilidade por estado), §5.8 (pipeline Markdown), §5.9 (tema), §5.11 (rotas e inventário de componentes) · Cap. 6 §6.6 a §6.9 · ADR-013 (D-19) e ADR-017 (D-07, D-08, D-16, D-17).

**Ordem das branches**
1. `feat/ui-markdown` (M08): `MarkdownRenderer` com `react-markdown` + `remark-math` + `rehype-katex` (já instalados) + **`remark-gfm`** (D-08) + **realce de sintaxe** (D-07). **Peçam no pedido** a aprovação das duas dependências novas. **Sem HTML bruto** (RN11); folha de estilos do KaTeX importada uma vez. Casos **CT15, CT16, CT17, CT18**.
2. `feat/ui-editor` (M09): editor em painel dividido com barra de ferramentas, **rascunho local** e envio à API (o envio substitui o conteúdo vigente, sem histórico de versões — D-15); a pré-visualização usa o **mesmo** `MarkdownRenderer`; o editor **exibe o estado de publicação** (`DRAFT`/`PUBLISHED`), com destaque para rascunho, e permite alterná-lo (RF26). Casos **CT19, CT20**.
3. `feat/ui-leitura-publica` (M07), **depois do merge de M02** (Dados): `Navbar`, `Sidebar` (item ativo, recolher níveis, teclado) e `Footer` com os ícones **só das redes que têm link preenchido** (Discord, GitHub, YouTube, Instagram, LinkedIn e Twitch; `noopener noreferrer`; RN17) e o texto de direitos gerado do nome do site e do ano. Enquanto isso, construam os componentes em `src/components/layout/` com **dados simulados**, sem importar `db.js`. Casos **CT26, CT27, CT33**.
4. `globals.css` com os tokens de tema (Cap. 5 §5.9) sem fixar cores. `lang="pt-BR"` e o *layout* raiz são arquivos de rota do Core: combinem por `[PEDIDO]`.

*(O seletor de estado na árvore do painel — M10 — e o formulário dos links sociais — M11 — ficam para as fases F4 e F5.)*

**Evidências:** `cd doc/tex && make pendentes AGENTE=UI` lista as capturas de tela esperadas (`doc/tex/figuras/telas/…png`). Salvem-nas na sua branch; **não editem `.tex`**.

---

### A-005 · [AVISO] Arquiteto → Todos (ciência) · 2026-10-01 · ABERTO — Decisões encerradas pelo Engenheiro Chefe

**Todas as decisões iniciais estão resolvidas** e constam nas ADR (Apêndice E); o antigo registro de decisões em aberto foi removido.

- **Em 2026-09-30:** **D-01** nome oficial **Vitrine** · **D-04** Docker em VPS tradicional, com volume para o SQLite (ADR-011) · **D-15** estado `DRAFT`/`PUBLISHED`, padrão `PUBLISHED` (ADR-012) · **D-19** seis campos opcionais de links sociais (ADR-013) · **D-09** Prisma 7 com `better-sqlite3`, proposta pelo Dados e aprovada pelo Arquiteto (ADR-014).
- **Em 2026-10-01:** **D-02** licença **MIT** (ADR-015; arquivo `LICENSE`) · **D-18** documentação sem formato acadêmico (ADR-016) · as demais questões técnicas têm **valor padrão na ADR-017**.
- **Regras aprovadas e oficiais:** **RF26** e **RN15 a RN17** — rascunho responde 404 por URL direta; um ancestral em rascunho oculta toda a subárvore; o painel exibe tudo; links sociais só `http`/`https`.

Se um valor padrão da ADR-017 ou uma regra aprovada se mostrar inadequado na implementação, abram um `[RFC]`; não o contornem no código.

---

## Solicitações de merge

_(nenhuma)_

## Pedidos entre domínios

_(nenhum)_

## Respostas do Arquiteto

_(nenhuma)_
