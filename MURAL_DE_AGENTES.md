# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.
> **O que já foi atendido está em `doc/ref/mural-arquivo.md`** (somente leitura; use `grep -n` pelo identificador, não o leia inteiro). **Leia neste arquivo só a sua tarefa (`A-nnn`), os `[MERGE]` e os `[PEDIDO]` que lhe dizem respeito.**

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto o remove e o move para o arquivo).

**Fases** (Cap. 3 §3.2): F1 Especificação, F2 Fundação e a especificação multiusuário (F2b) **concluídas**; F2b em implementação: A-013 a A-019 **integradas** (M-012 a M-037, 2026-10-04 a 2026-10-06: banco, autorização, moderação, notificações, modo noturno, layouts, editor, espaços públicos, portal, Proxy, senha provisória, formulários e páginas de aparência e de configuração, notificações na interface, backup do SQLite); **o épico v1 (aparência, mídia e navegação; A-025 a A-030, decidido em 07/10/2026) é a última fase de funcionalidades**; A-024 (Core) está **pausada**. F5 (a instalação em uma VPS limpa com HTTPS, CT29, a cargo do Engenheiro Chefe; a imagem já foi verificada em contêiner) e a documentação final vêm depois do épico.

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

O Engenheiro Chefe trouxe 10 mudanças e **aprovou** as decisões **D-30 a D-38** (imagens como BLOB no SQLite reencodadas com `sharp`, sem SVG; modo por cookie lido só pelo *script* do `<head>`, sem "automático"; topbar e logo no site **e** em cada espaço; o par de ícones do botão de modo escolhido pelo administrador; rodapé por ícones, até 8 por dono, um por ícone, preenchido por cada usuário; avatar; título do diretório). **Nada disto está no LaTeX nem no código ainda** (a documentação vem antes: A-025). **Congelamento de escopo:** depois desta lista, ideia nova vai para o backlog "v1.1". **Os prompts de cada agente estão em `doc/ref/prompts/{arquiteto,dados,ui,core}.md`.** **Ordem de lançamento:** (1) **Arquiteto A-025** (passo 1 primeiro; a escrita do LaTeX é leve) **e UI A-027** em paralelo; (2) com o passo 1 na `main`: **Dados A-026** (a UI A-027 continua); (3) com o passo 2 na `main` e a A-027 integrada: **UI A-028** (o mesmo agente da UI, o pedido 2); (4) com a A-026, a A-027 e a A-028 integradas: **Core A-024** (independente: pode ir antes de tudo, quando o Engenheiro Chefe o liberar), **A-031** e **A-029**, nesta ordem (**o Core não roda agora**); (5) **Arquiteto A-030**, a integração e o fechamento. **No máximo dois agentes pesados ao mesmo tempo** (o Arquiteto só escrevendo documentação não conta). **No máximo dois agentes pesados ao mesmo tempo.** **Revisão do Engenheiro Chefe CONCLUÍDA (08/10/2026): o gate foi levantado.** Alterações de 08/10: o **administrador mantém handle, espaço e conteúdo** (a limitação proposta em 07/10 foi retirada); a tela de aparência ganha o **seletor Sistema/Minha página** para o administrador; o **limite pelo peso do DOM** é backlog v1.1 (§12 do documento-fonte).

### A-024 · [TAREFA] Arquiteto → @Core · 2026-10-06 · **PAUSADA** (o Core não roda agora; **independente** do épico, pode ir primeiro) — o LCP do RNF02 (P-017) e o *log* do 503
**Estado.** O Lighthouse móvel (M-037, reproduzido pelo Arquiteto): desempenho ≥ 90 nas quatro páginas, mas o **LCP simulado** passa de 2,5 s no documento (2,76 a 2,89 s) e no `/login` (2,58 s); o espaço passa por pouco (2,43 s); o LCP real, com rede e CPU estranguladas, é de ~1 s. O que pesa está em `src/app/**`: o `favicon.ico` de 26 KiB e a fonte Geist Mono pré-carregada em toda página. **Itens (só estes; o prompt é `doc/ref/prompts/core.md`, pedido 1):** (1) `Geist_Mono({ preload: false })`; (2) um favicon de poucos KiB, neutro, que será o **padrão de reserva** do épico; (3) o *log* do 503 `BUSY` em nível baixo e sem a pilha (os demais 5xx seguem); (4) as figuras `teste-isr-cabecalhos` e `teste-suite-automatizada` (capturas reais). **Os candidatos extras de LCP ficam para o fim do épico** (as imagens mudam o LCP). Meça antes e depois (`npm run lighthouse`, mediana de 3). O Arquiteto e o Engenheiro Chefe decidem, com os números, como o RNF02 fica documentado.
**Status:** **PAUSADA** (2026-10-07).

---

### A-025 · [TAREFA] Chefe → @Arquiteto · 2026-10-07 · **ABERTA** — transformar o documento-fonte em especificação (DDD)
**Passo 1 (dados, commitado primeiro; libera o Dados):** `dados.tex`, Apêndice A, `er-vitrine.dbml`, **ADR-034** (mídia) e **ADR-035** (rodapé por ícones, substitui a ADR-013). **Passo 2:** Cap. 4 (RF24 e RN17 substituídos; RF/RN novos), Cap. 5 (`api`, `rotas`, `seguranca`, `tema`, `isr`, `autenticacao`), Apêndices D, E (**ADR-036** modo por cookie; **ADR-037** topbar, par de ícones, título, avatar e navegação) e G, Cap. 6, Cap. 7 (CT56 em diante) e `CLAUDE.md`. **Passo 3:** abrir A-027 a A-030 no mural. Prompt: `doc/ref/prompts/arquiteto.md`.
**Status:** **EM ANDAMENTO.** Passo 1 **concluído** em 2026-10-08 (`1973d40`: `dados.tex`, Apêndice A, `er-vitrine.dbml`, ADR-034, ADR-035 e ADR-038). Faltam o passo 2 (o resto da especificação; libera a A-028) e o passo 3.

---

### A-026 · [TAREFA] Arquiteto → @Dados · 2026-10-07 · **ABERTA** (passo 1 da A-025 na `main`, commit `1973d40`, 2026-10-08) — esquema e funções (branch `feat/dados-midia`)
**Leiam:** Cap. 5 `dados.tex`, `sec:arq-dados-v1` (a especificação completa deste pedido) e `sec:arq-indice-parcial`; Apêndice A, `tab:dicionario-v1` e `tab:indices-v1`; `er-vitrine.dbml`; Apêndice E, **ADR-034**, **ADR-035** e **ADR-038**. **Onde a especificação fixou o que o prompt deixava aberto:** (a) o modelo do site é `Configuration` (tabela `configurations`), não `SiteConfiguration`; (b) `Image.ownerId` é chave estrangeira para `User` com `Cascade` (nulo = site), tabelas `images` e `footer_links`; (c) `footer_links`: `@@unique([ownerId, icon])` **mais** o índice parcial `footer_links_site_icon_key` (`WHERE ownerId IS NULL`, SQL manual na migração; conferir em `tests/dados/indexes.test.js`), pois `NULL` é distinto de `NULL`; (d) as listas fechadas (18 ícones, 4 pares de ícones do modo) ficam no módulo puro novo `src/lib/footer-icons.js`; (e) além das funções do prompt: `removeImage(kind, ownerId)` e `removeAvatar(userId, { notification })` (apaga e notifica na mesma transação: `MODERATION`, `WARNING`, `data.event = "AVATAR_REMOVED"`, `data.reason`); (f) `getAppearance` sem linha devolve **nulos** (não preenche o nome com o do usuário) e `updateAppearance` **não** preenche `siteName` ao criar a linha; um modo com uma ou duas cores nulas é `INVALID_INPUT`; `showLogo` e `showName` não podem ficar ambos falsos (estado resultante, na transação); (g) `getEffectiveAppearance` devolve também `inherits` e **nunca** o padrão embutido (é do Core); (h) `listPublicSpaces` ganha `avatarImageId` e **mantém** `Appearance.siteName ?? User.name` como nome; (i) a migração gera os ids de `footer_links` em SQL e só converte para `footer_links` os links `https://` (ver a Seção de migração do Cap. 5). Dúvida de modelagem: abra `[RFC]` aqui (por exemplo, se o Prisma recusar a relação circular `User` ↔ `Image`).
`Image`, `User.avatarImageId`, `FooterLink`, os campos novos de `SiteConfiguration` e `Appearance` (`logoImageId`, `faviconImageId`, `showLogo`, `showName`, `modeIconPair`, `directoryTitle`) e a **remoção** de `logoUrl`, `faviconUrl` e dos seis campos sociais; migração que **converte** os seis em `FooterLink` e **descarta** as URLs; **rodada 2 revista (D-40 e D-41): as paletas e o `siteName` de `Appearance` anuláveis (nulo = herda o sistema) e `getEffectiveAppearance`; o administrador mantém handle, espaço e conteúdo**; funções (`saveImage`, `replaceImage`, `deleteOwnedImages`, `replaceFooterLinks`...); **backup e restauração com imagens**; testes e mutações. Prompt: `doc/ref/prompts/dados.md`.
**Status:** **ABERTA** (pode ser lançada; a UI A-027 segue em paralelo).

---

### A-027 · [TAREFA] Chefe → @UI · 2026-10-07 · **ABERTA** (onda 0; não depende do esquema) — popout, navegação, modo por cookie, topbar, campos novos e o defeito do item 6 (branch `feat/ui-onda0`)
Itens 1, 5, 7, 4, 10, 9 e 6 do épico: o popout do sino; o `AdminLink` (cookie-marcador `vitrine-logado`) e o nome do site no painel levando a `/`; o `ColorModeToggle` de dois estados com o cookie `vitrine-modo` e o par de ícones (também no painel); `showLogo` e `showName`; `directoryTitle` e `modeIconPair` nos formulários; e o `router.refresh()` do `ConfigurationForm` e do `AppearanceForm` (**hipótese do item 6**: o layout do painel persiste entre navegações; **confirmar medindo**); **rodada 2 revista: a herança do sistema no `AppearanceForm` e o seletor Sistema/Minha página do administrador**. Exceção declarada: `e2e/tema.spec.js` (só os casos do "automático"). Prompt: `doc/ref/prompts/ui.md`, pedido 1.
**Status:** **ABERTA.**

---

### A-028 · [TAREFA] Chefe → @UI · 2026-10-07 · **AGUARDA** o passo 2 da A-025 — `ImageUpload`, `Avatar`, `IconPicker`, `FooterLinksEditor`, `Footer` e a moderação do avatar (branch `feat/ui-midia`)
Contra o contrato de API do documento-fonte (§4), com `fetch` simulado; ícones do Simple Icons (CC0) inline; a CSP sem `https:` em `img-src`. Prompt: `doc/ref/prompts/ui.md`, pedido 2.
**Status:** **AGUARDA.**

---

### A-029 · [TAREFA] Chefe → @Core · 2026-10-07 · **AGUARDA** a A-026, a A-027, a A-028 e a A-031 integradas (**o Core não roda agora**) — mídia, rodapé, favicon por espaço, CSP e ligações (branch `feat/core-midia`)
`sharp` (processamento, 422 `INVALID_IMAGE`, concorrência de um por usuário e dois no total), o modo `multipart` do `route()`, `PUT`/`DELETE` das imagens e do avatar, `DELETE /api/users/:id/avatar` com motivo, `GET /media/<id>` imutável, `/api/footer-links`, os campos novos, o `generateMetadata` do favicon, **`img-src 'self' data:`**, e2e e mutações. Prompt: `doc/ref/prompts/core.md`, pedido 2.
**Status:** **AGUARDA.**

---

### A-031 · [TAREFA] Chefe → @Core · 2026-10-07 (revista em 08/10) · **AGUARDA** a A-026 e a A-027 integradas (**o Core não roda agora**) — a aparência em duas camadas e o seletor do administrador (branch `feat/core-aparencia`)
**D-40 e D-41:** a aparência efetiva (a do usuário sobre a do sistema, com a cadeia de padrões embutidos) no espaço de cada usuário (inclusive o do administrador) e no painel do usuário comum; o painel do administrador, o `/login` e o portal só com a do sistema (**o espaço continua ISR**); `/admin/aparencia` com o seletor `?alvo=sistema|pagina` para o administrador; e2e do item 6 e da herança. **O administrador mantém handle, espaço e conteúdo: nada muda na matriz.** Prompt: `doc/ref/prompts/core.md`, pedido 2.
**Status:** **AGUARDA.**

---

### A-030 · [TAREFA] Chefe → @Arquiteto · 2026-10-07 · **AGUARDA** as entregas dos agentes — integrar e fechar
Integrar cada pedido (simulação em Linux, ensaio e mutações **ampliados**, e2e e `test:a11y`, mutações próprias no upload); **F6 de novo** (`test:a11y` e `lighthouse`: as imagens mudam o LCP; a decisão do RNF02 e a do **limite pelo peso do DOM** são do Engenheiro Chefe); **CT29 de novo** (Docker com o `sharp`); a documentação final (relatos pendentes do Cap. 6, a tabela de cobertura do Cap. 8, as dificuldades técnicas); **push** se o Engenheiro Chefe o pedir. Prompt: `doc/ref/prompts/arquiteto.md`.
**Status:** **AGUARDA.**

---

## Solicitações de merge

*(nenhum pedido aberto)*

## Pedidos entre domínios

*(nenhum pedido aberto)*

## Respostas do Arquiteto

*(nenhuma ativa; R-001 a R-026 estão em `doc/ref/mural-arquivo.md`)*
