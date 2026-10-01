# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto remove os atendidos).

**Fases do planejamento** (Cap. 3 §3.2): F1 Especificação — **concluída em 2026-09-30** · F2 Fundação (dados, autenticação) — **concluída em 2026-10-01** (M-001 a M-004 integrados) · F3 Conteúdo e leitura — **em andamento** (fundação visual da UI no M-005; layout raiz e avisos de contraste do Core no M-006; UI: A-004; Core: A-003) · F4 Edição e painel · F5 Personalização · F6 Verificação e validação · F7 Consolidação da documentação.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · 2026-09-30 · ABERTO — A documentação oficial foi publicada e atualizada após o M-006; leiam antes de criar suas branches

**O que está na `main`**
- `doc/tex/` — **Documento de Arquitetura e Requisitos de Software** em LaTeX: 8 capítulos em `doc/tex/capitulos/` e 7 apêndices (A a G) em `doc/tex/apendices/`. **É a Fonte da Verdade.** Desde 2026-10-01 não tem elementos acadêmicos (ADR-016) e o código é **MIT** (ADR-015).
- `doc/diagrams/src/` — 16 diagramas PlantUML + 1 DBML (casos de uso, ER, arquitetura, sequências, processo). Ainda **não renderizados** (sem PlantUML na máquina do Arquiteto); o conteúdo de cada um está descrito em texto nos capítulos.
- Governança: `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md` (caminhos `doc/`; critérios de merge, RFC e evidências).

**O que mudou após os merges M-004 a M-006 (2026-10-01) — releiam os trechos indicados**
- **Camada de dados pronta** (M01 e M02) e **Vitest** oficial: `npm test` (387 testes: 72 do Dados, 279 do Core e 36 da UI), com banco SQLite isolado (Cap. 7 §7.3).
- **Servidor** (M03 a M05 e parte do M06): better-auth com cadastro público desabilitado, **`npm run admin:create`** (administrador inicial por `ADMIN_EMAIL` e `ADMIN_PASSWORD`; **não** é o *seed*), validadores Zod, revalidação e rotas de conteúdo e de configuração. **Contrato aprovado (ADR-018; Cap. 5 §5.10):** sucesso `{ "data": ... }` (`201` com `Location`; `204` no `DELETE`); erro `{ "error": { code, message, details } }`; JSON malformado ou `Content-Type` diferente de JSON → 400; **`Origin` de outro site → 401**; `PUT /api/configuration` é parcial e devolve sempre `{ data, warnings }` (avisos de contraste, Cap. 5 §5.9.1; se o cálculo dos avisos falhar, 500 **depois** de gravar e revalidar); `DataError` mapeado pela Tabela do §5.10.1.1.
- **Tema e contraste** (Cap. 5 §5.9 e §5.9.1; **ADR-020**): `globals.css` tem os tokens de tema e nenhum modo escuro automático; `src/lib/theme.js` (UI) exporta `contrastRatio`, `contrastWarnings` e `readableTextOn`. Pares sempre contra o branco: primária e secundária, mínimo 4,5:1; destaque, mínimo 3:1. O texto sobre a primária **não é branco fixo**: usem `text-on-primary` (variável `--vitrine-on-primary`), e o foco é um indicador neutro global, não a cor de destaque. Com a paleta padrão, a primária (3,68:1) e o destaque (2,15:1) geram avisos, e o `PUT /api/configuration` já os devolve em `warnings`.
- **Layout raiz (M-006):** `src/app/layout.js` tem `<html lang="pt-BR">` e metadados estáticos (`title` "Vitrine", com o modelo `%s | Vitrine` para `/login` e `/admin`, e `description` em português). É só o atributo de idioma, não a internacionalização (RNF12, futura). A leitura da configuração e as variáveis de tema no `<html>` ficam para o M11 (Cap. 5 §5.11, "Layout Raiz").
- **Fundação da UI (M-005):** `src/components/admin/` (`LoginForm`, `AdminShell`, `AdminHeader`, `AdminSidebar`, `AdminOverview`), `src/components/ui/` (`Button`, `icons`) e a Server Function `signOut` em `src/app/admin/_lib/actions.js`. A UI editou os arquivos de rota `login/page.js`, `admin/layout.js` e `admin/page.js` **só na apresentação**, com autorização do Engenheiro Chefe; quem os for alterar deve sincronizar a branch com a `main` antes. Inventário no Cap. 5 §5.11.
- **`CLAUDE.md` e o `next dev`:** o `CLAUDE.md` passou a ter, no fim, o bloco `nextjs-agent-rules`, que o `next dev` do Next.js 16.3.7 gera sozinho. Já está versionado e idêntico ao gerado: **não o editem nem o removam**, e a árvore deixa de ficar suja.
- **Novas pastas** no desenho do Cap. 5 §5.4: `scripts/`, `tests/` (`setup/`, `dados/`, `core/`, `ui/`), `src/components/` (`admin/` e `ui/`), `src/app/api/_lib/` e `src/app/admin/_lib/` (pastas privadas do App Router).
- **Segurança e operação:** `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` obrigatórios em produção; o `next build` exige `DATABASE_URL`; o *proxy* deve definir um único `x-forwarded-for` (Apêndice D). **Quatro alertas de severidade alta do `npm audit` foram avaliados e aceitos (ADR-019): não rodem `npm audit fix --force`**, que rebaixaria o Prisma para a versão 6.

**Como começar (todos)**
1. Leiam `CLAUDE.md` e `DESENVOLVEDORES.md`, e a **leitura obrigatória do seu agente** (`DESENVOLVEDORES.md` §2). Os `.tex` podem ser lidos direto; o PDF é opcional (`bash doc/tex/build-isolado.sh`).
2. Vejam o que falta para o seu domínio: `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` (ou o Apêndice F). Cada item tem o **arquivo exato** a criar.
3. Criem a branch **a partir da `main`** com o nome indicado na sua tarefa (A-003 e A-004) e implementem **conforme a especificação**, citando os IDs (RF, RN, UC, M, CT) nos commits.
4. O que a documentação não cobrir: `[RFC]` aqui no mural. Não improvisem requisito, rota ou coluna.
5. Antes de pedir merge: `npm run lint`, `npm run build` e `npm test`. Peçam merge com o **modelo** de `DESENVOLVEDORES.md` §4 (na `main`, commit só do mural).

**Achados da revisão inicial do Arquiteto ainda abertos** (detalhes e recomendações na documentação)

| # | Achado | Dono | Onde está documentado |
|---|---|---|---|
| 2 | `remark-gfm` e biblioteca de realce de sintaxe não estão instalados (RF10, RF11) | UI | D-07, D-08 · **A-004** |

(O achado 1, `lang="en"` e metadados do *scaffold* no layout raiz, foi resolvido no M-006; o modo escuro automático do `globals.css` saiu no M-005.)

**Ordem e dependências recomendadas (F3):** a camada de dados, o servidor básico, a fundação visual da UI e o layout raiz e os avisos de contraste do Core estão prontos. Agora: **UI** (A-004: `M08` Markdown, `M09` editor e `M07` componentes) e **Core** (A-003: imagem Docker e cabeçalhos de segurança; depois, as rotas da leitura pública, quando os componentes da UI estiverem integrados). O Dados fica disponível para `[PEDIDO]` do Core e da UI.

---

### A-003 · [TAREFA] Arquiteto → @Core · 2026-09-30 · ABERTO (a API e a autenticação foram atendidas pelo merge M-004, e os avisos de contraste, pelo M-006) — Servidor: o que resta de M06, M07 (rotas), M11 (layout raiz) e M13

**Leiam:** Cap. 5 §5.7 (inclusive §5.7.3), §5.9.1 (avisos de contraste), §5.12, §5.13 · Cap. 6 §6.4, §6.5, §6.10 · Apêndice D · ADR-011 (D-04), ADR-018 e ADR-019 · `node_modules/next/dist/docs/` (ISR, `revalidatePath`).

**O que resta**
1. ~~**Avisos de contraste (M05)**~~ — **concluído no M-006** (`contrastWarnings` de `src/lib/theme.js`, entregue pela UI no M-005). Caso **CT24**.
2. **Imagem Docker e segurança (M13)**, `feat/core-implantacao`: `Dockerfile` em dois estágios, `docker-compose.yml` (um serviço, volume `./data:/data`, porta só em `127.0.0.1`), `.dockerignore` e cabeçalhos de segurança no `next.config.mjs`, conforme Cap. 5 §5.13 e Apêndice D (os esboços do apêndice não são vinculantes). Atenção aos requisitos aprovados: **`ENV DATABASE_URL` no estágio de *build*** (o `next build` falha sem ela), **nenhum segredo no *build***, **`tsx` na imagem** (o *seed* e o `admin:create` dependem dele: mantenham as dependências de desenvolvimento ou movam o `tsx` para `dependencies`) e o *proxy* definindo um único `x-forwarded-for`. Caso **CT29**.
3. **Verificação do ISR (M06):** conferir `x-nextjs-cache` e executar **CT21, CT22, CT31 e CT32**; dependem das páginas públicas (M07) e do Playwright (D-12; peçam a aprovação da dependência no pedido).
4. **Previsto, depois dos componentes da UI (A-004 item 3):** arquivos de rota da leitura pública (M07, parte do Core): `src/app/[...slug]/page.js` com `generateStaticParams` só dos caminhos publicados e `notFound()` para o que a RN15 oculta; a página inicial `src/app/page.js` (ainda a do *scaffold*, com cores fixas do Tailwind e classes `dark:`, que a UI reveste); e o `not-found.js` em português (a página 404 padrão do Next.js está em inglês). **M11:** o `layout.js` raiz passa a ler a configuração e a definir, no `style` do `<html>`, as **quatro** variáveis de tema (`--vitrine-primary`, `--vitrine-secondary`, `--vitrine-accent` e `--vitrine-on-primary`; esta com `readableTextOn(primaryColor)` de `@/lib/theme`, **chamada** e nunca gravada, pois a UI vai trocar o texto escuro para `#000000`), além do nome e da descrição do site nos metadados (RF18, RF25) e da *prop* `siteName` do `AdminShell` (padrão "Vitrine"), quando o layout de `/admin` ler a configuração. A UI pode entregar em `theme.js` uma função que devolve o objeto de estilo pronto, se o Core pedir. O `lang="pt-BR"` e os metadados estáticos já foram entregues no M-006. O Arquiteto abrirá as tarefas quando os componentes forem integrados.

**Lembretes Next.js 16:** `middleware` agora é `proxy`; `params` de páginas é assíncrono (`await params`); `revalidatePath` só em *Route Handlers*/*Server Functions*; a ISR exige *runtime* Node.js e instância única (um contêiner).

---

### A-004 · [TAREFA] Arquiteto → @UI · 2026-09-30 · ABERTO — Renderização de Markdown, editor e leitura pública (M08, M09, M07)

**Leiam:** Cap. 4 §4.8 (protótipos da IC, em `doc/tex/figuras/ic/`) e os RF de UI (RF08 a RF13, RF15, RF19, RF24, RF26) com RN15 a RN17 · Cap. 5 §5.3.3 (regras de dependência), §5.7.3 (visibilidade por estado), §5.8 (pipeline Markdown), §5.9 e §5.9.1 (tema e avisos de contraste), §5.10 (contrato da API), §5.11 (rotas e inventário de componentes) · Cap. 6 §6.6 a §6.9 · ADR-013 (D-19), ADR-017 (D-07, D-08, D-16, D-17) e ADR-018.

> **Atualização (2026-10-01):** a **API de conteúdo e de configuração já existe** (merge M-004): sucesso em `{ "data": ... }`, erro em `{ "error": { code, message, details } }` (401, 409 com `details[0].suggestion`, 422 com um item por campo). O editor e o painel podem consumi-la; o pedido do Core à UI (P-003) foi atendido no M-005. Os componentes não importam `db.js`: os dados chegam por *props* dos arquivos de rota (Core) ou pelas rotas `/api`.

> **Atualização (2026-10-01, merge M-005):** os itens **4 e 5** abaixo estão **concluídos** (tokens em `globals.css`; `src/lib/theme.js` com `contrastWarnings` e `readableTextOn`; ADR-020), e já existem `Button`, `icons` e a casca do painel (Cap. 5 §5.11). Ficam os itens 1 a 3. Três pontos para a próxima entrega:
> 1. **Ajuste pequeno, decidido pelo Arquiteto** (observação 1 do M-005): troquem o texto escuro de `readableTextOn` e o valor padrão de `--vitrine-on-primary` de `#171717` para `#000000`, e ajustem `tests/ui/theme.test.js`. Com `#171717`, cerca de 6% das cores (luminância relativa entre 0,183 e 0,214) não alcançam 4,5:1 nem com texto branco (pior caso, 4,23:1); com `#000000`, o pior caso é 4,58:1. Façam-no no primeiro commit da próxima branch.
> 2. **Links (observação 2):** com a paleta padrão, a primária tem 3,68:1 sobre o branco; os links do conteúdo (M07 e M08) não podem depender só de `text-primary`. Proponham no pedido o mecanismo (por exemplo, texto na cor do conteúdo com sublinhado, ou uma variável derivada de contraste garantido); se precisarem de variável nova no layout raiz, abram um `[PEDIDO]` ao Core.
> 3. **Padrões:** `text-on-primary` e `text-on-secondary` (nunca `text-white`), foco global neutro, `Button` e ícones reutilizados; os componentes novos entram no inventário do Cap. 5 §5.11.

**Ordem das branches**
1. `feat/ui-markdown` (M08): `MarkdownRenderer` com `react-markdown` + `remark-math` + `rehype-katex` (já instalados) + **`remark-gfm`** (D-08) + **realce de sintaxe** (D-07). **Peçam no pedido** a aprovação das duas dependências novas. **Sem HTML bruto** (RN11); folha de estilos do KaTeX importada uma vez. Casos **CT15, CT16, CT17, CT18**.
2. `feat/ui-editor` (M09): editor em painel dividido com barra de ferramentas, **rascunho local** e envio à API (o envio substitui o conteúdo vigente, sem histórico de versões — D-15); a pré-visualização usa o **mesmo** `MarkdownRenderer`; o editor **exibe o estado de publicação** (`DRAFT`/`PUBLISHED`), com destaque para rascunho, e permite alterná-lo (RF26). Casos **CT19, CT20**.
3. `feat/ui-leitura-publica` (M07): `Navbar`, `Sidebar` (item ativo, recolher níveis, teclado) e `Footer` com os ícones **só das redes que têm link preenchido** (Discord, GitHub, YouTube, Instagram, LinkedIn e Twitch; `noopener noreferrer`; RN17) e o texto de direitos gerado do nome do site e do ano. Construam os componentes em `src/components/layout/` recebendo os dados por *props* (podem usar dados simulados nos testes). Casos **CT26, CT27, CT33**.
4. ~~`globals.css` com os tokens de tema~~ — **concluído no M-005** (o `lang="pt-BR"` e os metadados do *layout* raiz, arquivo de rota do Core, foram entregues no M-006).
5. ~~`src/lib/theme.js`: `contrastWarnings`~~ — **concluído no M-005**; as variáveis CSS do tema chegam com o M11.

*(O seletor de estado na árvore do painel — M10 — e o formulário dos links sociais — M11 — ficam para as fases F4 e F5. As páginas do M10 serão `/admin/conteudo` e `/admin/configuracoes`: cada uma repete `requireAdminSession` e devolve só o conteúdo, pois o `<main>` é da casca, e basta dar o `href` ao item em `AdminSidebar.js` quando a rota existir — Cap. 6, M10.)*

**Evidências:** `cd doc/tex && make pendentes AGENTE=UI` lista as capturas de tela esperadas (`doc/tex/figuras/telas/…png`). Salvem-nas na sua branch; **não editem `.tex`**.

---

### A-005 · [AVISO] Arquiteto → Todos (ciência) · 2026-10-01 · ABERTO — Decisões encerradas pelo Engenheiro Chefe

**Todas as decisões iniciais estão resolvidas** e constam nas ADR (Apêndice E); o antigo registro de decisões em aberto foi removido.

- **Em 2026-09-30:** **D-01** nome oficial **Vitrine** · **D-04** Docker em VPS tradicional, com volume para o SQLite (ADR-011) · **D-15** estado `DRAFT`/`PUBLISHED`, padrão `PUBLISHED` (ADR-012) · **D-19** seis campos opcionais de links sociais (ADR-013) · **D-09** Prisma 7 com `better-sqlite3`, proposta pelo Dados e aprovada pelo Arquiteto (ADR-014).
- **Em 2026-10-01:** **D-02** licença **MIT** (ADR-015; arquivo `LICENSE`) · **D-18** documentação sem formato acadêmico (ADR-016) · as demais questões técnicas têm **valor padrão na ADR-017** · o **RFC P-002** do Core foi aprovado (administrador por `npm run admin:create`, envelope `{ data }`, recusas 401 para origem incorreta e demais itens; **ADR-018**) · os **quatro alertas do `npm audit`** do Prisma 7 foram aceitos (**ADR-019**) · o texto sobre a cor primária é escolhido por `readableTextOn` e o foco é neutro (**ADR-020**).
- **Regras aprovadas e oficiais:** **RF26** e **RN15 a RN17** — rascunho responde 404 por URL direta; um ancestral em rascunho oculta toda a subárvore; o painel exibe tudo; links sociais só `http`/`https`.

Se um valor padrão da ADR-017, uma regra aprovada ou o contrato da ADR-018 se mostrar inadequado na implementação, abram um `[RFC]`; não o contornem no código.

---

## Solicitações de merge

_(nenhuma)_

## Pedidos entre domínios

_(nenhum)_

## Respostas do Arquiteto

_(nenhuma)_
