# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto remove os atendidos).

**Fases do planejamento** (Cap. 3 §3.5): F1 Especificação — **concluída em 2026-09-30** · F2 Fundação (dados, autenticação) — **pronta para iniciar** · F3 Conteúdo e leitura · F4 Edição e painel · F5 Personalização · F6 Verificação e validação · F7 Redação final.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · 2026-09-30 · ABERTO — A documentação oficial foi publicada; leiam antes de criar suas branches

**O que foi publicado na `main`**
- `doc/tex/` — documentação oficial em LaTeX (TCC, ABNT): 9 capítulos em `doc/tex/capitulos/` e 8 apêndices em `doc/tex/apendices/`. **É a Fonte da Verdade.**
- `doc/diagrams/src/` — 16 diagramas PlantUML + 1 DBML (casos de uso, ER, arquitetura, sequências, processo). Ainda **não renderizados** (sem PlantUML na máquina do Arquiteto); o conteúdo de cada um está descrito em texto nos capítulos.
- Governança revisada: `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md` (caminhos corrigidos de `docs/` para `doc/`; novos critérios de merge, RFC e evidências).

**Como começar (todos)**
1. Leiam `CLAUDE.md` e `DESENVOLVEDORES.md`, e a **leitura obrigatória do seu agente** (`DESENVOLVEDORES.md` §2). Os `.tex` podem ser lidos direto; o PDF é opcional (`bash doc/tex/build-isolado.sh`).
2. Vejam o que falta para o seu domínio: `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` (ou o Apêndice G). Cada item tem o **arquivo exato** a criar.
3. Criem a branch **a partir da `main`** com o nome indicado na sua tarefa (A-002 a A-004) e implementem **conforme a especificação**, citando os IDs (RF, RN, UC, M, CT) nos commits.
4. O que a documentação não cobrir: `[RFC]` aqui no mural. Não improvisem requisito, rota ou coluna.
5. Ao terminar, peçam merge com o **modelo** de `DESENVOLVEDORES.md` §4 (na `main`, commit só do mural).

**Achados da revisão inicial do Arquiteto** (detalhes e recomendações na documentação)

| # | Achado | Dono | Onde está documentado |
|---|---|---|---|
| 1 | Prisma 7: arquivo `prisma7.config.ts` (o padrão é `prisma.config.ts`), gerador `prisma-client-js` (legado), `url` no `datasource`, **sem *driver adapter*** (`sqlite3` não é adapter do Prisma), `@prisma/client` em `devDependencies` | Dados | Cap. 6 §6.3 (Tabela de conformidade) · D-09 |
| 2 | Schema: `slug` sem unicidade; sem índice em `parentId`; `Content.author` com cascata (excluir usuário apaga conteúdo); `Configuration` sem registro único; `type` como texto livre | Dados | Cap. 5 §5.5.4 (Tabela de observações) · D-05, D-06, D-14 |
| 3 | `.gitignore` tem `.env*`, o que também ignora `.env.example` | Core | Cap. 6 §6.10 · `DESENVOLVEDORES.md` §6 |
| 4 | `src/app/layout.js` com `lang="en"` e metadados do *scaffold*; `globals.css` com modo escuro automático do *scaffold* | Core (rota) + UI | Cap. 5 §5.9 · D-17 |
| 5 | `remark-gfm` e biblioteca de realce de sintaxe não estão instalados (RF10, RF11) | UI | D-07, D-08 |
| 6 | Comentários com o nome "VITREO CMS" em `prisma/schema.prisma` (o projeto é **Vitrine**) | Dados (ao mexer no schema) | D-01 (decisão do Autor) |
| 7 | O rodapé dos protótipos tem links sociais, mas o schema não tem onde guardá-los | Dados + UI | D-19 |

**Ordem e dependências recomendadas (F2 → F3):** Dados (`M01`) primeiro → em seguida Core (`M03`–`M06`) e UI (`M07`). Enquanto `M01` não é integrada: Core faz `.env.example` e validadores/revalidação (independentes do banco) e UI faz `M08`/`M09` (independentes do banco).

---

### A-002 · [TAREFA] Arquiteto → @Dados · 2026-09-30 · ABERTO — Fundação dos dados (M01 e M02)

**Leiam:** Cap. 5 §5.4–§5.5 (inclusive a Tabela de observações do schema) · Cap. 6 §6.3 · Cap. 4 §4.6 (RN02, RN03, RN05, RN06, RN08) · Apêndices A e B · Apêndice F (D-05, D-06, D-09, D-14, D-19) · skills `.claude/skills/prisma-*`.

**Branch 1:** `feat/dados-schema-inicial` (módulo M01). Escopo:
1. Resolver **D-09** (Tabela de conformidade do Prisma 7): nome do arquivo de configuração, gerador com `output` coerente com o `.gitignore`, `url` movida para a configuração, *driver adapter* (`better-sqlite3` ou libSQL — **decidam e justifiquem no pedido**), remover `sqlite3`, mover `@prisma/client` para `dependencies`. Declarem as dependências no pedido.
2. Tratar os itens 1 a 5 da Tabela de observações do schema. Onde discordarem da recomendação, abram `[RFC]` antes.
3. Gerar a **primeira migração** e um *seed* **idempotente**: configuração padrão (RF23) e administrador inicial (RF22). O mecanismo do administrador (D-03) é do Core: combinem por `[PEDIDO]`/`[RFC]` antes de implementar credenciais. Nunca coloquem segredos no repositório.
4. Criar `src/lib/db.js` — **único** ponto de instância do cliente — com funções nomeadas, no mínimo: `getContentTree()`, `getContentByPath(slugs)`, `createContent`, `updateContent`, `deleteContent`, `reorderContents` (transacional) e `getConfiguration`/`updateConfiguration` (registro único, *upsert*). Proponham as assinaturas no pedido.

**Branch 2 (pode ser separada):** `feat/dados-db-e-arvore` (módulo M02): `src/lib/content-tree.js` conforme o esboço do Cap. 5 §5.5.3.

**Aceite:** RN02, RN03, RN05, RN06, RN08 garantidas no servidor; casos **CT11, CT12, CT13, CT28** (Cap. 7 §7.3). Figura esperada: `doc/tex/figuras/testes/teste-migracoes.png`.

---

### A-003 · [TAREFA] Arquiteto → @Core · 2026-09-30 · ABERTO — Servidor: ambiente, validação, autenticação e API (M03 a M06, M13)

**Leiam:** Cap. 4 §4.3.3 (UC08, UC05, UC07, UC11) · Cap. 5 §5.6, §5.7, §5.10, §5.12, §5.13 · Cap. 6 §6.4, §6.5, §6.10 · Apêndice D · Apêndice F (D-03, D-04, D-10, D-11, D-13) · `node_modules/next/dist/docs/` (**Proxy**, ISR, `revalidatePath`, autenticação).

**Ordem das branches**
1. `feat/core-env-example` *(pequena, pode começar já)*: criar `.env.example` **só com nomes** (`DATABASE_URL`, segredo e URL base do better-auth — confirmem os nomes na documentação da versão 1.7.6) e ajustar o `.gitignore` com `!.env.example`.
2. `feat/core-validators-revalidate` *(independe do banco)*: `src/lib/validators.js` (proponham Zod como dependência direta — D-11) e `src/lib/revalidate.js` com as regras da **RN10** (página × *layout* raiz) como funções testáveis. Casos **CT24**.
3. `feat/core-auth` *(depois do merge de M01)*: better-auth com adaptador do Prisma, *handler* `/api/auth/[...all]`, cliente, `src/proxy.js` (verificação otimista), página de login, *logout* e **bootstrap do administrador com cadastro público desabilitado** — enviem um `[RFC]` com o mecanismo escolhido (D-03) antes de implementar. Casos **CT01 a CT06**.
4. `feat/core-api-conteudo` (M04) e `feat/core-api-configuracao` (M05): rotas do contrato do Cap. 5 §5.10, com sessão em cada *handler* (RF21), formato de erro padrão e chamada a `revalidate.js`. Casos **CT07 a CT10, CT21, CT22**.

**Lembretes Next.js 16:** `middleware` agora é `proxy`; `params` de páginas é assíncrono (`await params`); `revalidatePath` só em *Route Handlers*/*Server Functions*; a ISR exige *runtime* Node.js e instância única.

---

### A-004 · [TAREFA] Arquiteto → @UI · 2026-09-30 · ABERTO — Renderização de Markdown, editor e leitura pública (M08, M09, M07)

**Leiam:** Cap. 4 §4.8 (protótipos da IC, em `doc/tex/figuras/ic/`) e os RF de UI (RF08 a RF13, RF15, RF19, RF24) · Cap. 5 §5.3.3 (regras de dependência), §5.8 (pipeline Markdown), §5.9 (tema), §5.11 (rotas e inventário de componentes) · Cap. 6 §6.6 a §6.9 · Apêndice F (D-07, D-08, D-16, D-17, D-19).

**Ordem das branches**
1. `feat/ui-markdown` (M08): `MarkdownRenderer` com `react-markdown` + `remark-math` + `rehype-katex` (já instalados) + **`remark-gfm`** (D-08) + **realce de sintaxe** (D-07). **Peçam no pedido** a aprovação das duas dependências novas. **Sem HTML bruto** (RN11); folha de estilos do KaTeX importada uma vez. Casos **CT15, CT16, CT17, CT18**.
2. `feat/ui-editor` (M09): editor em painel dividido com barra de ferramentas, **rascunho local** e envio à API; a pré-visualização usa o **mesmo** `MarkdownRenderer`. Casos **CT19, CT20**.
3. `feat/ui-leitura-publica` (M07), **depois do merge de M02** (Dados): `Navbar`, `Sidebar` (item ativo, recolher níveis, teclado), `Footer`. Enquanto isso, construam os componentes em `src/components/layout/` com **dados simulados**, sem importar `db.js`. Casos **CT26, CT27**.
4. `globals.css` com os tokens de tema (Cap. 5 §5.9) sem fixar cores. `lang="pt-BR"` e o *layout* raiz são arquivos de rota do Core: combinem por `[PEDIDO]`.

**Evidências:** `cd doc/tex && make pendentes AGENTE=UI` lista as capturas de tela esperadas (`doc/tex/figuras/telas/…png`). Salvem-nas na sua branch; **não editem `.tex`**.

---

### A-005 · [AVISO] Arquiteto → Todos (ciência) · 2026-09-30 · ABERTO — Decisões que cabem ao Autor (não bloqueiam as primeiras branches)

Registradas no Apêndice F e levadas ao Engenheiro Chefe: **D-01** nome oficial (Vitrine × "Vitreo" nos comentários de referência) · **D-02** licença de código aberto · **D-18** dados do TCC (título, orientador, banca) · **D-04** alvo de implantação (servidor com disco persistente × plataforma *serverless* com banco remoto) · **D-15** estados de publicação/versionamento. Não tomem essas decisões no código; se uma delas bloquear a sua tarefa, marquem `[BLOQUEIO]`.

---

## Solicitações de merge

_(nenhuma)_

## Pedidos entre domínios

_(nenhum)_

## Respostas do Arquiteto

_(nenhuma)_
