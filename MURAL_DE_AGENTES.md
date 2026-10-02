# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto remove os atendidos).

**Fases do planejamento** (Cap. 3 §3.2): F1 Especificação — **concluída em 2026-09-30** · F2 Fundação (dados, autenticação) — **concluída em 2026-10-01** (M-001 a M-004 integrados) · F3 Conteúdo e leitura — **em andamento** (fundação visual da UI no M-005; avisos de contraste do Core no M-006; tema no layout raiz, nome no painel e página 404 do Core no M-007; imagem Docker e cabeçalhos de segurança do Core no M-008; UI: A-004 e A-010; Core: A-003, bloqueada por M07) · F4 Edição e painel · F5 Personalização · F6 Verificação e validação · F7 Consolidação da documentação.

---

## Avisos e tarefas ativos

### A-001 · [AVISO] Arquiteto → Todos · 2026-09-30 · ABERTO — A documentação oficial foi publicada e atualizada após o M-008; leiam antes de criar suas branches

**O que está na `main`**
- `doc/tex/` — **Documento de Arquitetura e Requisitos de Software** em LaTeX: 8 capítulos em `doc/tex/capitulos/` e 7 apêndices (A a G) em `doc/tex/apendices/`. **É a Fonte da Verdade.** Desde 2026-10-01 não tem elementos acadêmicos (ADR-016) e o código é **MIT** (ADR-015).
- `doc/diagrams/src/` — 16 diagramas PlantUML + 1 DBML (casos de uso, ER, arquitetura, sequências, processo). Ainda **não renderizados** (sem PlantUML na máquina do Arquiteto); o conteúdo de cada um está descrito em texto nos capítulos.
- Governança: `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md` (caminhos `doc/`; critérios de merge, RFC e evidências).

**O que mudou após os merges M-004 a M-008 (2026-10-01 e 2026-10-02) — releiam os trechos indicados**
- **Camada de dados pronta** (M01 e M02) e **Vitest** oficial: `npm test` (496 testes: 72 do Dados, 388 do Core e 36 da UI), com banco SQLite isolado (Cap. 7 §7.3). Desde o M-007, o `vitest.config.mjs` tem um plugin de JSX para os `.js` de `src/` e `tests/`: um teste pode importar arquivos de rota e componentes e renderizá-los com `react-dom/server` (exemplo: `tests/core/layouts.test.js`); testes de interação (cliques, estado) ainda exigiriam um ambiente de DOM, que não foi adotado.
- **Servidor** (M03 a M05 e parte do M06): better-auth com cadastro público desabilitado, **`npm run admin:create`** (administrador inicial por `ADMIN_EMAIL` e `ADMIN_PASSWORD`; **não** é o *seed*), validadores Zod, revalidação e rotas de conteúdo e de configuração. **Contrato aprovado (ADR-018; Cap. 5 §5.10):** sucesso `{ "data": ... }` (`201` com `Location`; `204` no `DELETE`); erro `{ "error": { code, message, details } }`; JSON malformado ou `Content-Type` diferente de JSON → 400; **`Origin` de outro site → 401**; `PUT /api/configuration` é parcial e devolve sempre `{ data, warnings }` (avisos de contraste, Cap. 5 §5.9.1; se o cálculo dos avisos falhar, 500 **depois** de gravar e revalidar); `DataError` mapeado pela Tabela do §5.10.1.1.
- **Tema e contraste** (Cap. 5 §5.9 e §5.9.1; **ADR-020**): `globals.css` tem os tokens de tema e nenhum modo escuro automático; `src/lib/theme.js` (UI) exporta `contrastRatio`, `contrastWarnings` e `readableTextOn`. Pares sempre contra o branco: primária e secundária, mínimo 4,5:1; destaque, mínimo 3:1. O texto sobre a primária **não é branco fixo**: usem `text-on-primary` (variável `--vitrine-on-primary`), e o foco é um indicador neutro global, não a cor de destaque. Com a paleta padrão, a primária (3,68:1) e o destaque (2,15:1) geram avisos, e o `PUT /api/configuration` já os devolve em `warnings`.
- **Layout raiz e *build* sem banco (M-006 e M-007; ADR-021):** `src/app/layout.js` tem `<html lang="pt-BR">` (só o atributo de idioma, não a internacionalização do RNF12), lê a configuração (`getSiteConfiguration`, em `src/app/_lib/site.js`), injeta no `style` do `<html>` as quatro variáveis de tema e gera o título (modelo `%s | nome`) e a descrição; `/admin` mostra o nome do site; `src/app/not-found.js` é a 404 em português, com mensagem única (RN15). **O `next build` não consulta o banco** (o estágio de *build* da imagem não o tem): quem ler dados em um *layout* ou página que possa ser pré-renderizado deve usar a guarda de `getSiteConfiguration` (`NEXT_PHASE === "phase-production-build"`) ou outra equivalente, senão o `build` quebra. As páginas estáticas (`/` e a 404) saem do *build* com os padrões do CSS e assumem a paleta do banco na primeira revalidação (Cap. 5 §5.9.2). O tema vai no atributo `style` do `<html>`: uma CSP estrita precisará de `style-src-attr 'unsafe-inline'` (Cap. 5 §5.12).
- **Imagem Docker e cabeçalhos de segurança (M-008; ADR-022; Cap. 5 §5.12 e §5.13; Apêndice D):** `Dockerfile` (dois estágios, `node:24-bookworm-slim`, `next start`, usuário `node`), `docker-compose.yml` (um serviço, `./data:/data`, porta só em `127.0.0.1`), `.dockerignore`, `security-headers.mjs` e `next.config.mjs`. A **CSP é enviada só em produção** (`next build` + `next start`; o `next dev` não a envia) e **não usa *nonce***, para manter a ISR: admite *scripts* e atributos `style` inline (hidratação do Next.js, tema e KaTeX), mas nenhuma folha de estilo inline, `eval`, imagem `http:`, fonte ou *script* de outra origem. **Quem cria tela ou recurso novo verifica no navegador, sobre o *build* de produção, que o console não acusa violação de CSP** (`DESENVOLVEDORES.md` §6). Construir a imagem exige **6 GB livres** (a imagem tem 1,87 GB). **Recriar o contêiner** (`down` e `up -d`, ou uma nova imagem) devolve a página inicial e a 404 ao tema padrão até a primeira revalidação (salvar a configuração do site): é comportamento por projeto (ADR-021; Cap. 5 §5.9.2), e o `restart` não tem esse efeito.
- **Fundação da UI (M-005):** `src/components/admin/` (`LoginForm`, `AdminShell`, `AdminHeader`, `AdminSidebar`, `AdminOverview`), `src/components/ui/` (`Button`, `icons`) e a Server Function `signOut` em `src/app/admin/_lib/actions.js`. A UI editou os arquivos de rota `login/page.js`, `admin/layout.js` e `admin/page.js` **só na apresentação**, com autorização do Engenheiro Chefe; quem os for alterar deve sincronizar a branch com a `main` antes. Inventário no Cap. 5 §5.11.
- **`CLAUDE.md` e o `next dev`:** o `CLAUDE.md` passou a ter, no fim, o bloco `nextjs-agent-rules`, que o `next dev` do Next.js 16.3.7 gera sozinho. Já está versionado e idêntico ao gerado: **não o editem nem o removam**, e a árvore deixa de ficar suja.
- **Novas pastas** no desenho do Cap. 5 §5.4: `scripts/`, `tests/` (`setup/`, `dados/`, `core/`, `ui/`), `src/components/` (`admin/` e `ui/`), `src/app/_lib/`, `src/app/api/_lib/` e `src/app/admin/_lib/` (pastas privadas do App Router).
- **Segurança e operação:** `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` obrigatórios em produção; o `next build` exige `DATABASE_URL` (mas não consulta o banco); o *proxy* deve definir um único `x-forwarded-for`, enviar o HSTS (a aplicação não o envia) e não alterar a CSP (Apêndice D). **Quatro alertas de severidade alta do `npm audit` foram avaliados e aceitos (ADR-019): não rodem `npm audit fix --force`**, que rebaixaria o Prisma para a versão 6.

**Como começar (todos)**
1. Leiam `CLAUDE.md` e `DESENVOLVEDORES.md`, e a **leitura obrigatória do seu agente** (`DESENVOLVEDORES.md` §2). Os `.tex` podem ser lidos direto; o PDF é opcional (`bash doc/tex/build-isolado.sh`).
2. Vejam o que falta para o seu domínio: `cd doc/tex && make pendentes AGENTE=<Dados|Core|UI>` (ou o Apêndice F). Cada item tem o **arquivo exato** a criar.
3. Criem a branch **a partir da `main`** com o nome indicado na sua tarefa (A-003, A-004 e A-010) e implementem **conforme a especificação**, citando os IDs (RF, RN, UC, M, CT) nos commits.
4. O que a documentação não cobrir: `[RFC]` aqui no mural. Não improvisem requisito, rota ou coluna.
5. Antes de pedir merge: `npm run lint`, `npm run build` e `npm test`. Peçam merge com o **modelo** de `DESENVOLVEDORES.md` §4 (na `main`, commit só do mural).

**Achados da revisão inicial do Arquiteto ainda abertos** (detalhes e recomendações na documentação)

| # | Achado | Dono | Onde está documentado |
|---|---|---|---|
| 2 | `remark-gfm` e biblioteca de realce de sintaxe não estão instalados (RF10, RF11) | UI | D-07, D-08 · **A-004** |

(O achado 1, `lang="en"` e metadados do *scaffold* no layout raiz, foi resolvido nos merges M-006 e M-007; o modo escuro automático do `globals.css` saiu no M-005.)

**Ordem e dependências recomendadas (F3):** a camada de dados, o servidor básico, a fundação visual da UI e, no Core, os avisos de contraste, o layout raiz (tema e metadados vindos do banco), o nome no painel, a página 404, a imagem Docker e os cabeçalhos de segurança estão prontos. Agora: **UI** (A-004: `M08` Markdown e `M07` componentes; A-010: `M09` editor) e **Core** (A-003, **bloqueada por M07**: as rotas da leitura pública e a verificação da ISR com o Playwright só começam quando os componentes da UI estiverem integrados). O Dados fica disponível para `[PEDIDO]` do Core e da UI.

---

### A-003 · [TAREFA] Arquiteto → @Core · 2026-09-30 · ABERTO — **BLOQUEADA POR M07** (a API e a autenticação foram atendidas pelo merge M-004; os avisos de contraste, pelo M-006; o tema no layout raiz, o nome no painel e a página 404, pelo M-007; a imagem Docker e os cabeçalhos de segurança, pelo M-008) — Servidor: o que resta de M06 e de M07 (rotas públicas)

**Leiam:** Cap. 5 §5.7 (inclusive §5.7.3), §5.9.2 (leitura da configuração e o *build*), §5.12 (CSP) · Cap. 6 §6.4, §6.5, §6.10 · ADR-018, ADR-021 e ADR-022 · `node_modules/next/dist/docs/` (ISR, `revalidatePath`).

> **Bloqueada por M07.** O que resta depende das páginas públicas da UI (A-004 item 3, `feat/ui-leitura-publica`, M07): a verificação da ISR com o Playwright precisa delas, e as rotas públicas do Core consomem os componentes da UI. **O Core não tem ação nesta tarefa até a UI integrar o M07**; o Arquiteto avisará pelo mural. Enquanto isso, o Core pode atender `[PEDIDO]` da UI (por exemplo, o arquivo de rota da página do editor, A-010).
>
> **Já entregue (M-008):** imagem Docker em dois estágios, `docker-compose.yml`, `.dockerignore` e cabeçalhos de segurança com a CSP (M13; Cap. 5 §5.12 e §5.13, Apêndice D, ADR-022), com o roteiro executado em contêiner. Pendente, fora do Core: a instalação em uma VPS Linux limpa, com HTTPS (CT29 no ambiente-alvo), a cargo do Engenheiro Chefe.

**O que resta (quando o M07 estiver integrado)**
1. **Verificação do ISR (M06):** conferir `x-nextjs-cache` e executar **CT21, CT22, CT31 e CT32**; dependem das páginas públicas (M07) e do Playwright (D-12; peçam a aprovação da dependência no pedido). Os ensaios do M-007 (*build* de produção) e do M-008 (em contêiner) já mostraram `MISS` e depois `HIT` em `/` e na 404 após o `PUT /api/configuration`; falta cobrir as páginas públicas.
2. **Rotas públicas (M07, parte do Core), depois dos componentes da UI (A-004 item 3):** `src/app/[...slug]/page.js` com `generateStaticParams` só dos caminhos publicados e `notFound()` para o que a RN15 oculta — **sem pré-renderizar dados no *build*** (ADR-021: em um *build* sem banco, `generateStaticParams` devolve lista vazia e as páginas nascem sob demanda; usem a guarda de `getSiteConfiguration` ou outra equivalente); e a página inicial `src/app/page.js` (ainda a do *scaffold*, com cores fixas do Tailwind e classes `dark:`, que a UI reveste). Verifiquem as páginas novas sob a CSP, sobre o *build* de produção (ADR-022). Em M11 e M12, restam o logotipo e o *favicon* nos metadados (RF18), quando houver componente que os exiba, e os metadados por página (RF25). O Arquiteto abrirá as tarefas quando os componentes forem integrados.

**Lembretes Next.js 16:** `middleware` agora é `proxy`; `params` de páginas é assíncrono (`await params`); `revalidatePath` só em *Route Handlers*/*Server Functions*; a ISR exige *runtime* Node.js e instância única (um contêiner).

**Status:** **BLOQUEADA POR M07.**

---

### A-004 · [TAREFA] Arquiteto → @UI · 2026-09-30 · ABERTO — Renderização de Markdown e leitura pública (M08 e M07; o editor, M09, passou à A-010)

**Leiam:** Cap. 4 §4.8 (protótipos da IC, em `doc/tex/figuras/ic/`) e os RF de UI (RF08 a RF13, RF15, RF19, RF24, RF26) com RN15 a RN17 · Cap. 5 §5.3.3 (regras de dependência), §5.7.3 (visibilidade por estado), §5.8 (pipeline Markdown), §5.9 e §5.9.1 (tema e avisos de contraste), §5.10 (contrato da API), §5.11 (rotas e inventário de componentes) e §5.12 (CSP) · Cap. 6 §6.6 a §6.9 · ADR-013 (D-19), ADR-017 (D-07, D-08, D-16, D-17), ADR-018 e ADR-022.

> **Atualização (2026-10-01):** a **API de conteúdo e de configuração já existe** (merge M-004): sucesso em `{ "data": ... }`, erro em `{ "error": { code, message, details } }` (401, 409 com `details[0].suggestion`, 422 com um item por campo). O editor e o painel podem consumi-la. Os componentes não importam `db.js`: os dados chegam por *props* dos arquivos de rota (Core) ou pelas rotas `/api`.

> **Atualização (2026-10-01, merges M-005 a M-007):** a fundação visual está integrada (tokens em `globals.css`; `src/lib/theme.js` com `contrastWarnings` e `readableTextOn`; `Button`, `icons` e a casca do painel — Cap. 5 §5.11; ADR-020), e o Core já entrega o `lang="pt-BR"`, os metadados, o tema injetado no `<html>` a partir do banco (os tokens passam a refletir a paleta salva), o nome do site no painel e a página 404. Ficam os itens 1 a 3. Cinco pontos para a próxima entrega:
> 1. **Ajuste pequeno, decidido pelo Arquiteto** (observação 1 do M-005): troquem o texto escuro de `readableTextOn` e o valor padrão de `--vitrine-on-primary` de `#171717` para `#000000`, e ajustem `tests/ui/theme.test.js`. Com `#171717`, cerca de 6% das cores (luminância relativa entre 0,183 e 0,214) não alcançam 4,5:1 nem com texto branco (pior caso, 4,23:1); com `#000000`, o pior caso é 4,58:1. Façam-no no primeiro commit da próxima branch.
> 2. **Links (observação 2):** com a paleta padrão, a primária tem 3,68:1 sobre o branco; os links do conteúdo (M07 e M08) não podem depender só de `text-primary`. Proponham no pedido o mecanismo (por exemplo, texto na cor do conteúdo com sublinhado, ou uma variável derivada de contraste garantido); se precisarem de variável nova no layout raiz, abram um `[PEDIDO]` ao Core.
> 3. **Padrões:** `text-on-primary` e `text-on-secondary` (nunca `text-white`), foco global neutro, `Button` e ícones reutilizados; os componentes novos entram no inventário do Cap. 5 §5.11.
> 4. **Testes:** com o plugin de JSX do `vitest.config.mjs` (M-007), os componentes e os arquivos de rota `.js` podem ser importados nos testes e renderizados com `react-dom/server` (exemplo: `tests/core/layouts.test.js`); testes de interação (cliques, estado) exigiriam um ambiente de DOM, e a dependência (jsdom e Testing Library) deve ser pedida e aprovada no pedido de merge.
> 5. **Página 404:** o Core criou `src/app/not-found.js` com marcação mínima, só com tokens e mensagem única (RN15); a UI pode refazer a aparência no M07, mantendo a mensagem neutra (estrutura e dados são do Core: combinem por `[PEDIDO]`).

> **Atualização (2026-10-02, merge M-008; ADR-022):** o Core integrou a imagem Docker e os **cabeçalhos de segurança**. Dois pontos para a UI:
> 1. **CSP em produção (Cap. 5 §5.12; `DESENVOLVEDORES.md` §6):** a política só vale em `next build` + `next start` (o `next dev` não a envia) e permite *scripts* e folhas de estilo só do próprio site, atributos `style`, fontes do próprio site e imagens `https:`; **nenhuma folha de estilo inline, `eval`, fonte ou *script* de CDN**. Importem a folha e as fontes do KaTeX pelo *bundle* e **verifiquem cada tela nova no navegador, sobre o *build* de produção, com o console sem violações de CSP** (hidratação dos formulários, tema aplicado, fórmulas e imagens). Precisando de uma origem nova, abram um `[PEDIDO]` ao Core.
> 2. **`LoginForm` sem `method="post"` (achado da revisão do M-008):** o `<form>` do `LoginForm` (`src/components/admin/LoginForm.js`) tem só `onSubmit`. Se a hidratação falhar (por exemplo, por uma CSP mais restritiva imposta por um *proxy*), o navegador envia o formulário por **GET, e o e-mail e a senha vão para a URL**. Acrescentem `method="post"` (nada muda quando o JavaScript funciona) e um teste de renderização que o confira, no primeiro commit da próxima branch, junto com o item 1 da atualização anterior.

**Ordem das branches**
1. `feat/ui-markdown` (M08): `MarkdownRenderer` com `react-markdown` + `remark-math` + `rehype-katex` (já instalados) + **`remark-gfm`** (D-08) + **realce de sintaxe** (D-07). **Peçam no pedido** a aprovação das duas dependências novas. **Sem HTML bruto** (RN11); folha de estilos do KaTeX importada uma vez. Casos **CT15, CT16, CT17, CT18**.
2. `feat/ui-editor` (M09): **passou à tarefa A-010** (Editor Markdown e KaTeX), que traz o escopo, as dependências e os cuidados do editor. Casos **CT19, CT20**.
3. `feat/ui-leitura-publica` (M07; **destrava a A-003, do Core**): `Navbar`, `Sidebar` (item ativo, recolher níveis, teclado) e `Footer` com os ícones **só das redes que têm link preenchido** (Discord, GitHub, YouTube, Instagram, LinkedIn e Twitch; `noopener noreferrer`; RN17) e o texto de direitos gerado do nome do site e do ano. Construam os componentes em `src/components/layout/` recebendo os dados por *props* (podem usar dados simulados nos testes). Casos **CT26, CT27, CT33**.

*(O seletor de estado na árvore do painel — M10 — e o formulário dos links sociais — M11 — ficam para as fases F4 e F5. As páginas do M10 serão `/admin/conteudo` e `/admin/configuracoes`: cada uma repete `requireAdminSession` e devolve só o conteúdo, pois o `<main>` é da casca, e basta dar o `href` ao item em `AdminSidebar.js` quando a rota existir — Cap. 6, M10.)*

**Evidências:** `cd doc/tex && make pendentes AGENTE=UI` lista as capturas de tela esperadas (`doc/tex/figuras/telas/…png`). Salvem-nas na sua branch; **não editem `.tex`**.

---

### A-005 · [AVISO] Arquiteto → Todos (ciência) · 2026-10-01 · ABERTO — Decisões encerradas pelo Engenheiro Chefe

**Todas as decisões iniciais estão resolvidas** e constam nas ADR (Apêndice E); o antigo registro de decisões em aberto foi removido.

- **Em 2026-09-30:** **D-01** nome oficial **Vitrine** · **D-04** Docker em VPS tradicional, com volume para o SQLite (ADR-011) · **D-15** estado `DRAFT`/`PUBLISHED`, padrão `PUBLISHED` (ADR-012) · **D-19** seis campos opcionais de links sociais (ADR-013) · **D-09** Prisma 7 com `better-sqlite3`, proposta pelo Dados e aprovada pelo Arquiteto (ADR-014).
- **Em 2026-10-01:** **D-02** licença **MIT** (ADR-015; arquivo `LICENSE`) · **D-18** documentação sem formato acadêmico (ADR-016) · as demais questões técnicas têm **valor padrão na ADR-017** · o **RFC P-002** do Core foi aprovado (administrador por `npm run admin:create`, envelope `{ data }`, recusas 401 para origem incorreta e demais itens; **ADR-018**) · os **quatro alertas do `npm audit`** do Prisma 7 foram aceitos (**ADR-019**) · o texto sobre a cor primária é escolhido por `readableTextOn` e o foco é neutro (**ADR-020**) · o `next build` não consulta o banco, e a configuração do site é lida em execução (**ADR-021**).
- **Em 2026-10-02:** a CSP é enviada **sem *nonce*** e só em produção, com `'unsafe-inline'` em `script-src` e em `style-src-attr`, para manter a ISR (**ADR-022**) · recriar o contêiner devolve as páginas estáticas ao tema padrão até a primeira revalidação, **comportamento por projeto** (ADR-021; Cap. 5 §5.9.2) · construir a imagem exige **6 GB livres** (Apêndice D).
- **Regras aprovadas e oficiais:** **RF26** e **RN15 a RN17** — rascunho responde 404 por URL direta; um ancestral em rascunho oculta toda a subárvore; o painel exibe tudo; links sociais só `http`/`https`.

Se um valor padrão da ADR-017, uma regra aprovada ou o contrato da ADR-018 se mostrar inadequado na implementação, abram um `[RFC]`; não o contornem no código.

---

### A-010 · [TAREFA] Arquiteto → @UI · 2026-10-02 · ABERTO — A-010: Editor Markdown e KaTeX

**Tarefa (texto do Engenheiro Chefe):**

> Crie a branch `feat/ui-editor`. Implemente o componente principal do Editor de Conteúdo (M08) utilizando `react-hook-form` e `zod`. Suporte marcação Markdown padrão e equações matemáticas (LaTeX/KaTeX) via `remark-math` e `rehype-katex`. Este componente deve ser o núcleo da página de criação/edição de documentos.

**Notas do Arquiteto** (a tarefa acima vale como escrita; as notas só a situam na documentação)
1. **Módulo:** o editor é o **M09** (`feat/ui-editor`), e não o M08: o M08 é o `MarkdownRenderer` (`feat/ui-markdown`, A-004 item 1). Leiam "M08" no texto acima como M09 (Cap. 6, seção "M09 — Editor de Conteúdo"). Esta tarefa **substitui o item 2 da A-004**.
2. **Leiam:** Cap. 6 "M09 — Editor de Conteúdo" · Cap. 5 §5.8 (pipeline Markdown), §5.10 (contrato da API), §5.11 (inventário de componentes: `Editor`, `Toolbar` e `Preview` em `components/editor`; `ContentForm` e `StatusToggle` em `components/admin`) e §5.12 (CSP) · RF08, RF09, RF15, RF16 e RF26 · D-15 (ADR-012) · casos **CT19 e CT20**.
3. **Escopo do M09** (continua valendo): painel dividido com barra de ferramentas (negrito, itálico, tachado, títulos, links, imagens, código, citação, listas, tabela e fórmula); **rascunho local** por conteúdo ("Salvar localmente"), restaurado ao reabrir; envio à API ("Enviar nova versão" substitui o conteúdo vigente, sem histórico de versões) com tratamento de 401, 409 e 422; **estado de publicação** (`DRAFT`/`PUBLISHED`) em destaque e com alternância (RF26); rótulos acessíveis nos botões.
4. **Formulário e validação:** `react-hook-form` com o Zod (a versão instalada é a 4). `src/lib/validators.js` é um **módulo puro** (importa só o `zod`) e a UI pode **reutilizá-lo no navegador** (título, *slug* da RN03, estado, corpo), mas a validação do servidor continua a autoridade (RF21): mostrem os erros da API (422 com um item por campo; 409 com `details[0].suggestion` para o *slug*) junto dos campos. O `ContentForm` (título, *slug*, pai e estado; RF05, RF26) é o parceiro natural do `react-hook-form`: decidam no pedido se o editor o inclui ou o reutiliza (o M10 também o usará).
5. **Dependência nova (`DESENVOLVEDORES.md` §8):** o `react-hook-form` **não está instalado**. Declarem no pedido de merge nome, versão, motivo, licença, alternativa (componentes controlados) e impacto no *bundle*. Se usarem o `zodResolver`, ele vem em outro pacote, o `@hookform/resolvers`: peçam a aprovação dele também, ou escrevam um resolvedor próprio de poucas linhas.
6. **Pré-visualização:** usa o **mesmo `MarkdownRenderer`** da página pública (A-004 item 1: `remark-math` e `rehype-katex` já estão instalados; faltam o `remark-gfm` e o realce de sintaxe, D-07 e D-08, a aprovar). Se o `MarkdownRenderer` ainda não estiver integrado, entreguem-no antes ou na mesma branch e declarem no pedido. **Sem HTML bruto** (RN11).
7. **CSP (ADR-022):** a folha de estilos e as fontes do KaTeX vêm do *bundle*, nunca de CDN. Verifiquem o editor e a pré-visualização no navegador, sobre `npm run build` e `npm run start`, sem violações de CSP no console (fórmulas em linha e em bloco incluídas); o `next dev` não envia a CSP e não basta.
8. **A página:** o componente é o núcleo da página de criação/edição; o arquivo de rota (`page.js`) e a busca de dados são do **Core** (`DESENVOLVEDORES.md` §1), e a documentação ainda não fixa a rota exata: combinem por `[PEDIDO]` (provavelmente sob `/admin/conteudo`), e o Arquiteto a registra no Cap. 5 §5.11.
9. **Testes e evidência:** testes de renderização com `react-dom/server` e do que for puro; testes de interação (cliques, estado, rascunho local) exigem jsdom e Testing Library, **dependência a aprovar no pedido** (A-004, nota 4). Capturas (`tela-editor-markdown`): `cd doc/tex && make pendentes AGENTE=UI`.

**Status:** ABERTO.

---

## Solicitações de merge

_(nenhuma)_

## Pedidos entre domínios

_(nenhum)_

## Respostas do Arquiteto

_(nenhuma)_
