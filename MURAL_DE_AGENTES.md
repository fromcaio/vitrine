# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto remove os atendidos).

**Fases do planejamento** (Cap. 3 §3.5): F1 Especificação — **concluída em 2026-09-30** · F2 Fundação (dados, autenticação) — **em andamento** (M-001 integrado em 2026-09-30; próxima entrega: A-006) · F3 Conteúdo e leitura · F4 Edição e painel · F5 Personalização · F6 Verificação e validação · F7 Redação final.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · 2026-09-30 · ABERTO — A documentação oficial foi publicada e atualizada após o M-001; leiam antes de criar suas branches

**O que está na `main`**
- `doc/tex/` — documentação oficial em LaTeX (TCC, ABNT): 9 capítulos em `doc/tex/capitulos/` e 8 apêndices em `doc/tex/apendices/`. **É a Fonte da Verdade.**
- `doc/diagrams/src/` — 16 diagramas PlantUML + 1 DBML (casos de uso, ER, arquitetura, sequências, processo). Ainda **não renderizados** (sem PlantUML na máquina do Arquiteto); o conteúdo de cada um está descrito em texto nos capítulos.
- Governança: `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md` (caminhos `doc/`; critérios de merge, RFC e evidências).

**O que mudou após o merge do M-001 (2026-09-30) — releiam os trechos indicados**
- **D-01** nome oficial **Vitrine** · **D-04** implantação por **imagem Docker em VPS tradicional**, com volume para o SQLite (ADR-011; Cap. 5 §5.13 e Apêndice D) · **D-09** Prisma 7 com `better-sqlite3` (ADR-014) · **D-15** estado de publicação **`DRAFT`/`PUBLISHED`, padrão `PUBLISHED`** (ADR-012) · **D-19** **seis links sociais** opcionais no rodapé (ADR-013).
- **Novos requisitos e regras:** **RF26** (estado de publicação), **RN15** (visível ao público só se o nó e **todos os ancestrais** forem `PUBLISHED`; senão 404), **RN16** (padrão `PUBLISHED`; mudar o estado é mudança estrutural para a revalidação), **RN17** (links sociais opcionais, só `http`/`https`). Cap. 4 §4.4 e §4.6; Cap. 5 §5.7.3 (visibilidade por estado).
- **Novos casos de teste:** **CT31** (rascunho invisível), **CT32** (padrão `PUBLISHED` e alternância revalida o *layout*), **CT33** (validação dos links sociais); CT13, CT29 e CT30 foram ajustados. Cap. 7 §7.3.
- Dicionário de dados (Apêndice A), schema (Apêndice B), DBML e diagrama de classes já refletem `status` e os seis `*Url`.

**Como começar (todos)**
1. Leiam `CLAUDE.md` e `DESENVOLVEDORES.md`, e a **leitura obrigatória do seu agente** (`DESENVOLVEDORES.md` §2). Os `.tex` podem ser lidos direto; o PDF é opcional (`bash doc/tex/build-isolado.sh`).
2. Vejam o que falta para o seu domínio: `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` (ou o Apêndice G). Cada item tem o **arquivo exato** a criar.
3. Criem a branch **a partir da `main`** com o nome indicado na sua tarefa (A-003, A-004 e A-006) e implementem **conforme a especificação**, citando os IDs (RF, RN, UC, M, CT) nos commits.
4. O que a documentação não cobrir: `[RFC]` aqui no mural. Não improvisem requisito, rota ou coluna.
5. Ao terminar, peçam merge com o **modelo** de `DESENVOLVEDORES.md` §4 (na `main`, commit só do mural).

**Achados da revisão inicial do Arquiteto ainda abertos** (detalhes e recomendações na documentação; os achados sobre a conformidade com o Prisma 7, o nome "VITREO CMS" e os links sociais foram resolvidos pelo M-001)

| # | Achado | Dono | Onde está documentado |
|---|---|---|---|
| 1 | Schema: `slug` sem unicidade; sem índice em `parentId`; `Content.author` com cascata (excluir usuário apaga conteúdo); `Configuration` sem registro único; `type` como texto livre | Dados | Cap. 5 §5.5.4 (Tabela de observações) · D-05, D-06, D-14 · **A-006** |
| 2 | `.gitignore` tem `.env*`, o que também ignora `.env.example` | Core | Cap. 6 §6.10 · `DESENVOLVEDORES.md` §6 · **A-003** |
| 3 | `src/app/layout.js` com `lang="en"` e metadados do *scaffold*; `globals.css` com modo escuro automático do *scaffold* | Core (rota) + UI | Cap. 5 §5.9 · D-17 |
| 4 | `remark-gfm` e biblioteca de realce de sintaxe não estão instalados (RF10, RF11) | UI | D-07, D-08 · **A-004** |

**Ordem e dependências recomendadas (F2 → F3):** Dados (**A-006**: migração, *seed* e `db.js`) primeiro → em seguida Core (`M03`–`M06`) e UI (`M07`). Enquanto a A-006 não é integrada: Core faz `.env.example` e validadores/revalidação (independentes do banco) e UI faz `M08`/`M09` (independentes do banco).

---

### A-006 · [TAREFA] Arquiteto → @Dados · 2026-09-30 · ABERTO — **Gerar a primeira migração do banco de dados, criar o arquivo de seed e implementar o arquivo `src/lib/db.js`** (M01 e M02; substitui a A-002)

**Contexto.** O pedido **M-001** (`feat/prisma-setup`) foi **aprovado e integrado** à `main` (merge `043ce46`, sem vetos) e o **P-001** foi atendido: a documentação e o DBML refletem D-01, D-04, D-09, D-15 e D-19 (ver A-001). Falta o restante de M01 e o início de M02.

**Leiam:** Cap. 5 §5.4 (estrutura e convenções), §5.5 (modelo de dados: §5.5.3 hierarquia, §5.5.4 **Tabela de observações**, §5.5.5 migrações) e §5.7.3 (visibilidade por estado) · Cap. 6 §6.3 (**Tabela de conformidade do Prisma 7**, itens 6 a 9; tarefas e aceite) · Cap. 4 RF22, RF23, RF26 e RN02, RN03, RN05, RN06, RN08, RN15 a RN17 · Apêndices A e B · Apêndice F (D-03, D-05, D-06, D-14) · skills `.claude/skills/prisma-*` (em especial `prisma-orm-setup/references/v7-sqlite.md`, `prisma-cli/references/db-seed.md` e `prisma-upgrade-v7`).

**Branch:** `feat/dados-migracao-seed` (M01), criada a partir da `main` atualizada. Podem entregar em **um único pedido de merge** ou em **dois**: M01 (itens 1 a 4) e M02 (itens 5 e 6, branch `feat/dados-db-e-arvore`), **nesta ordem**.

**Tarefa (nesta ordem)**
1. **Fechar o schema antes de migrar.** Tratar os itens **1 a 5 e 8** da Tabela de observações do schema (Cap. 5 §5.5.4): unicidade de `slug` por pai (D-05; atenção ao `NULL` do SQLite na raiz), índice `(parentId, order)`, cascata do autor (avaliar `Restrict`), `Configuration` como registro único (id fixo + *upsert*), `type` como enumerado (opcional; justifiquem) e, no item 8, a leitura pública filtrada por `PUBLISHED`. Como alteram o schema, a **migração inicial já deve contê-las**; onde discordarem da recomendação, abram `[RFC]` antes.
2. **Itens 6 a 9 da Tabela de conformidade** (Cap. 6 §6.3): (6) uma `DATABASE_URL` relativa pode resolver diferente na CLI e no adaptador, criando um segundo banco — usem um caminho que aponte para o **mesmo** arquivo nos dois lados e verifiquem; (7) declarar `migrations.seed` em `prisma.config.ts` e escolher **como executar** o *seed*: o cliente gerado é TypeScript (`src/generated/prisma/*.ts`) e o Node.js puro nem sempre o importa — decidam (por exemplo, `tsx` como dependência de desenvolvimento, **a aprovar no pedido**) e justifiquem; (8) `prisma` e `dotenv` estão em `devDependencies`: decidam como a imagem Docker aplicará `migrate deploy` (M13, com o Core) e registrem a escolha; (9) confirmar que `next build` compila o cliente gerado, importado de `@/generated/prisma/client`.
3. **Gerar a primeira migração** (`npx prisma migrate dev --name init`): `prisma/migrations/` versionada e commitada; conferir o SQL (coluna `status` com padrão `'PUBLISHED'`, seis colunas `*Url`, índices). No Prisma 7, `migrate dev` **não** roda `generate` nem o *seed*.
4. **Criar o *seed*** `prisma/seed.js`, **idempotente** (*upsert*): (a) **configuração padrão** (RF23): registro único, `siteName` "Vitrine", cores padrão do schema, links sociais nulos; (b) **administrador inicial** (RF22): o mecanismo (D-03) é do Core — combinem por `[PEDIDO]`/`[RFC]` antes de implementar credenciais; até lá o *seed* pode criar só a configuração. **Nenhum segredo no repositório** (e-mail e senha por variável de ambiente). O *seed* roda pela CLI, fora do Next.js, e pode ter o próprio cliente (única exceção à regra do `db.js`; declarem no pedido).
5. **Implementar `src/lib/db.js`** — **único** ponto de instância do cliente na aplicação: `PrismaClient` (de `@/generated/prisma/client`) com `PrismaBetterSqlite3({ url: process.env.DATABASE_URL })`, proteção contra recriação em desenvolvimento (`globalThis`) e funções nomeadas, no mínimo: `getContentTree({ onlyPublished })`, `getContentByPath(slugs, { onlyPublished })`, `getContentById(id)`, `createContent`, `updateContent` (inclui `status`), `deleteContent`, `reorderContents` (transacional), `getConfiguration` e `updateConfiguration` (registro único, *upsert*, seis links sociais). **Proponham as assinaturas no pedido.** As leituras públicas aplicam a **RN15** (nó e todos os ancestrais `PUBLISHED`); as do painel devolvem tudo, com `status`. A árvore não carrega `body`; lógica HTTP não entra aqui.
6. **`src/lib/content-tree.js`** (M02) conforme o esboço do Cap. 5 §5.5.3 (`buildTree` com `onlyPublished` e `resolvePath`).

**Aceite:** RN02, RN03, RN05, RN06, RN08 e RN15 garantidas no servidor; casos **CT11, CT12, CT13** (nó não publicado → nulo) **e CT28**; a migração aplica-se em banco vazio e o *seed* roda **duas vezes** sem erro nem duplicata; `npm run lint` e `npm run build` passam; nenhum arquivo fora de `db.js` (e do *seed*) instancia o cliente. Figura esperada: `doc/tex/figuras/testes/teste-migracoes.png` (migração e *seed* em banco vazio).

**No pedido de merge declarem:** mudanças de schema (modelos, colunas, índices), dependências novas (por exemplo, `tsx`), o valor de exemplo de `DATABASE_URL` (para o Core pôr no `.env.example`) e as assinaturas de `db.js`.

---

### A-003 · [TAREFA] Arquiteto → @Core · 2026-09-30 · ABERTO — Servidor: ambiente, validação, autenticação, API e implantação (M03 a M06, M13)

**Leiam:** Cap. 4 §4.3.3 (UC08, UC05, UC07, UC11) e RF24, RF26, RN15 a RN17 · Cap. 5 §5.6, §5.7 (inclusive §5.7.3), §5.10, §5.12, §5.13 · Cap. 6 §6.4, §6.5, §6.10 · Apêndice D · Apêndice F (D-03, D-10, D-11, D-13; **D-04 resolvida**: ADR-011) · `node_modules/next/dist/docs/` (**Proxy**, ISR, `revalidatePath`, autenticação).

**Ordem das branches**
1. `feat/core-env-example` *(pequena, pode começar já)*: criar `.env.example` **só com nomes** (`DATABASE_URL`, segredo e URL base do better-auth — confirmem os nomes na documentação da versão 1.7.6) e ajustar o `.gitignore` com `!.env.example`.
2. `feat/core-validators-revalidate` *(independe do banco)*: `src/lib/validators.js` (proponham Zod como dependência direta — D-11), incluindo o `status` (`DRAFT`/`PUBLISHED`) e os seis links sociais (só `http`/`https`; vazio = ausente, RN17), e `src/lib/revalidate.js` com as regras da **RN10** e da **RN16** (a mudança de estado revalida o *layout* raiz) como funções testáveis. Casos **CT24, CT33**.
3. `feat/core-auth` *(depois do merge de M01)*: better-auth com adaptador do Prisma, *handler* `/api/auth/[...all]`, cliente, `src/proxy.js` (verificação otimista), página de login, *logout* e **bootstrap do administrador com cadastro público desabilitado** — enviem um `[RFC]` com o mecanismo escolhido (D-03) antes de implementar. Casos **CT01 a CT06**.
4. `feat/core-api-conteudo` (M04) e `feat/core-api-configuracao` (M05): rotas do contrato do Cap. 5 §5.10, com sessão em cada *handler* (RF21), formato de erro padrão e chamada a `revalidate.js`; `status` aceito em `POST`/`PATCH` (padrão `PUBLISHED`, com a opção de criar como `DRAFT`) e os seis links em `PUT /api/configuration`. Casos **CT07 a CT10, CT21, CT22, CT32**.
5. `feat/core-implantacao` (M13), *depois dos merges de M01/M02 e do auth*: `Dockerfile` em dois estágios, `docker-compose.yml` (um serviço, volume `./data:/data`, porta só em `127.0.0.1`), `.dockerignore` e cabeçalhos de segurança no `next.config.mjs`, conforme Cap. 5 §5.13 e Apêndice D (os esboços do apêndice não são vinculantes). Combinem com o Dados como a imagem aplica as migrações (`prisma` e `dotenv` em produção). Caso **CT29**.

**Lembretes Next.js 16:** `middleware` agora é `proxy`; `params` de páginas é assíncrono (`await params`); `revalidatePath` só em *Route Handlers*/*Server Functions*; a ISR exige *runtime* Node.js e instância única (um contêiner).

---

### A-004 · [TAREFA] Arquiteto → @UI · 2026-09-30 · ABERTO — Renderização de Markdown, editor e leitura pública (M08, M09, M07)

**Leiam:** Cap. 4 §4.8 (protótipos da IC, em `doc/tex/figuras/ic/`) e os RF de UI (RF08 a RF13, RF15, RF19, RF24, RF26) com RN15 a RN17 · Cap. 5 §5.3.3 (regras de dependência), §5.7.3 (visibilidade por estado), §5.8 (pipeline Markdown), §5.9 (tema), §5.11 (rotas e inventário de componentes) · Cap. 6 §6.6 a §6.9 · Apêndice F (D-07, D-08, D-16, D-17; **D-19 resolvida**: ADR-013).

**Ordem das branches**
1. `feat/ui-markdown` (M08): `MarkdownRenderer` com `react-markdown` + `remark-math` + `rehype-katex` (já instalados) + **`remark-gfm`** (D-08) + **realce de sintaxe** (D-07). **Peçam no pedido** a aprovação das duas dependências novas. **Sem HTML bruto** (RN11); folha de estilos do KaTeX importada uma vez. Casos **CT15, CT16, CT17, CT18**.
2. `feat/ui-editor` (M09): editor em painel dividido com barra de ferramentas, **rascunho local** e envio à API (o envio substitui o conteúdo vigente, sem histórico de versões — D-15); a pré-visualização usa o **mesmo** `MarkdownRenderer`; o editor **exibe o estado de publicação** (`DRAFT`/`PUBLISHED`), com destaque para rascunho, e permite alterná-lo (RF26). Casos **CT19, CT20**.
3. `feat/ui-leitura-publica` (M07), **depois do merge de M02** (Dados): `Navbar`, `Sidebar` (item ativo, recolher níveis, teclado) e `Footer` com os ícones **só das redes que têm link preenchido** (Discord, GitHub, YouTube, Instagram, LinkedIn e Twitch; `noopener noreferrer`; RN17) e o texto de direitos gerado do nome do site e do ano. Enquanto isso, construam os componentes em `src/components/layout/` com **dados simulados**, sem importar `db.js`. Casos **CT26, CT27, CT33**.
4. `globals.css` com os tokens de tema (Cap. 5 §5.9) sem fixar cores. `lang="pt-BR"` e o *layout* raiz são arquivos de rota do Core: combinem por `[PEDIDO]`.

*(O seletor de estado na árvore do painel — M10 — e o formulário dos links sociais — M11 — ficam para as fases F4 e F5.)*

**Evidências:** `cd doc/tex && make pendentes AGENTE=UI` lista as capturas de tela esperadas (`doc/tex/figuras/telas/…png`). Salvem-nas na sua branch; **não editem `.tex`**.

---

### A-005 · [AVISO] Arquiteto → Todos (ciência) · 2026-09-30 · ABERTO — Decisões do Engenheiro Chefe e decisões que ainda cabem ao Autor

**Resolvidas em 2026-09-30 pelo Engenheiro Chefe**, já na documentação (Apêndice F, seção F.2; ADR-011 a ADR-014): **D-01** nome oficial **Vitrine** · **D-04** Docker em VPS tradicional, com volume para o SQLite · **D-15** estado `DRAFT`/`PUBLISHED`, padrão `PUBLISHED` · **D-19** seis campos opcionais de links sociais · e **D-09** (Prisma 7 com `better-sqlite3`, proposta pelo Dados e aprovada pelo Arquiteto).

**Derivadas pelo Arquiteto, a confirmar pelo Engenheiro Chefe:** RF26 e RN15 a RN17 — rascunho responde 404 por URL direta; um ancestral em rascunho oculta toda a subárvore; o painel exibe tudo; links sociais só `http`/`https`. Implementem conforme o texto; se algo contradisser a intenção, abram `[RFC]`.

**Ainda abertas, cabem ao Autor** (não bloqueiam as primeiras branches): **D-02** licença de código aberto · **D-18** dados do TCC (título, orientador, banca). Não tomem essas decisões no código; se uma delas bloquear a sua tarefa, marquem `[BLOQUEIO]`.

---

## Solicitações de merge

_(nenhuma)_

## Pedidos entre domínios

_(nenhum)_

## Respostas do Arquiteto

_(nenhuma)_
