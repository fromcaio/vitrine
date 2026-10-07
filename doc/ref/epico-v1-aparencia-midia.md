# Épico de fechamento (v1): aparência, mídia e navegação — documento-fonte

> **Status (2026-10-07):** decisões **aprovadas pelo Engenheiro Chefe** (D-30 a D-38, abaixo). **Nada disto está escrito na documentação LaTeX nem no código ainda.** Este arquivo é a fonte para o Arquiteto transformar em ADRs, RF/RN/UC/CT e dicionário de dados (A-025) e para os agentes implementarem. Quem o ler deve tratá-lo como **especificação aprovada, ainda não normativa**; quando o Arquiteto a transferir para o LaTeX, a documentação passa a ser a fonte e este arquivo vira histórico. **Congelamento de escopo:** depois desta lista, ideia nova vai para o backlog "v1.1".

## 0. Origem

Em 06/10/2026, depois do M-037, o Engenheiro Chefe trouxe 10 mudanças (esboço sem curadoria). O Arquiteto as conferiu contra o código e a especificação, propôs as decisões abaixo, e o Engenheiro Chefe respondeu **"de acordo"** a todas (7 perguntas). Item 6 virou um **defeito** a investigar.

## 1. Os itens e o que cada um é

| # | Item | Camadas | Decisão |
|---|---|---|---|
| 1 | Popout das notificações no sino | UI | §6.1 |
| 2 | Upload de **logo** e **favicon** (site e cada espaço) | Dados, Core, UI | D-30 a D-32, §3 |
| 3 | Rodapé por **ícones** de uma lista (inclui e-mail), preenchido pelos usuários | Dados, Core, UI | D-36 |
| 4 | Botão de modo claro/escuro **sem "automático"**, com **cookie**, e o **par de ícones** escolhido pelo administrador | UI, Core, Dados | D-33, D-35 |
| 5 | Navegação: usuário logado chega ao painel a partir do site; o nome do site no painel leva a `/` | UI | §6.2 |
| 6 | **Defeito:** a cor do sistema não muda o painel depois de salva | Core, UI | §6.3 |
| 7 | Alternar claro/escuro no painel | UI | §6.4 |
| 8 | **Avatar** no perfil, mostrado na `/` com nome e handle | Dados, Core, UI | D-30, D-37 |
| 9 | Título "Espaços" da `/` editável | Dados, Core, UI | D-38 |
| 10 | Topbar: só logo, só nome, ou os dois (logo primeiro) | Dados, Core, UI | D-34 |

## 2. Decisões aprovadas

- **D-30 Imagens como BLOB no SQLite** (tabela `Image`), **reencodadas no servidor** com `sharp`; entram no backup (`VACUUM INTO`) e na restauração sem mudança; nenhum caminho de arquivo nem volume novo. Entrada: **PNG, JPEG e WebP** (**sem SVG e sem GIF**: D-31). Saída: **avatar** 256×256 (corte quadrado centralizado), WebP; **logo** no máximo 512 px no maior lado, proporção mantida, WebP (com alfa); **favicon** 64×64, PNG. Upload até **2 MB** e no máximo **25 megapixels** (`limitInputPixels`). Reencodar remove EXIF (um avatar pode ter GPS), neutraliza poliglotas e bombas de descompressão. Servidas em `GET /media/<id>` (público, sem sessão; `id` opaco), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Type` fixo da saída, `ETag`; **trocar a imagem gera um id novo** (URL imutável) e **apaga a antiga na mesma transação**. A **CSP** passa a `img-src 'self' data:` (tira `https:`: fecha o vazamento do IP do leitor a hosts de terceiros).
- **D-31 Sem SVG** (vetor de XSS) e sem GIF animado.
- **D-32 Dependência `sharp`** (Apache-2.0, nativa; binários pré-compilados para `linux-x64` glibc, que a imagem `node:24-bookworm-slim` serve; entra no `allowScripts` do `package.json`); ~30 MB a mais na imagem. **O CT29 (Docker) tem de ser repetido** depois.
- **D-33 Modo por cookie, sem "automático".** Cookie `vitrine-modo` = `light` | `dark`, `Path=/`, `Max-Age` de 1 ano, `SameSite=Lax`, **não-HttpOnly**, `Secure` quando HTTPS; **escrito pelo cliente** e **lido só pelo *script* inline do `<head>`** (nunca no servidor: **ler cookie no layout o torna dinâmico e mata o ISR e o LCP**). Primeira visita (sem cookie): **claro**. O `localStorage` `vitrine:modo` e o estado `auto` somem. É cookie funcional, sem dado pessoal. Altera ADR-025, ADR-031 e o CT47.
- **D-34 Topbar.** Dois interruptores, `showLogo` e `showName`, **no site e em cada espaço** (a mesma aparência compartilhada). Pelo menos um ligado (o servidor recusa os dois desligados); se `showName` está desligado, `showLogo` exige uma logo enviada. A logo vem **antes** do nome.
- **D-35 Par de ícones do botão de modo:** o administrador escolhe, **para o site inteiro**, um de um conjunto **fechado** (`sun_moon` padrão, `sun_moon_outline`, `lightbulb`, `contrast_half`); campo `modeIconPair` em `SiteConfiguration`. Os ícones são SVG inline do projeto.
- **D-36 Rodapé por ícones.** Tabela `FooterLink { id, ownerId (null = o site), icon, url, order }`, **no máximo 8 por dono (ou pelo site) e um por ícone** (`unique(ownerId, icon)`). Ícones (lista fechada): `github`, `linkedin`, `instagram`, `youtube`, `x`, `facebook`, `bluesky`, `mastodon`, `telegram`, `whatsapp`, `twitch`, `discord`, `lattes`, `orcid`, `researchgate`, `googlescholar`, `website`, `email`. URL: **`https://`**; o ícone `email` aceita só **`mailto:`** com e-mail válido (a interface avisa que **o e-mail fica público**). `target="_blank"` e `rel="noopener noreferrer"` nos `https`; o nome acessível é o do ícone ("GitHub"). Ícones de marcas do **Simple Icons (CC0)**, inline. **Cada usuário edita o rodapé do próprio espaço; o administrador edita só o do site (o portal).** Substitui os seis campos fixos da RN17/RF24 (Discord, GitHub, YouTube, Instagram, LinkedIn, Twitch): a migração os converte em linhas.
- **D-37 Avatar.** `User.avatarImageId` → `Image`; enviado em `/admin/perfil` (com "remover"); mostrado na `/` (diretório) junto ao nome e ao handle e, se couber, no cabeçalho do painel; sem avatar: **iniciais** em um círculo (tokens de cor). É dado pessoal (LGPD): **sai junto com a conta** (cascata). O administrador remove o avatar de outro usuário **com motivo** e o dono é **notificado** (`MODERATION`, como no conteúdo; RN19 e RN26).
- **D-38 Título do diretório.** `SiteConfiguration.directoryTitle`, texto simples de 1 a 40 caracteres, padrão `Espaços`; o `PortalDirectory` já aceita o `heading`.
- **Logo e favicon** (item 2): `logoImageId` e `faviconImageId` (em `SiteConfiguration` e em `Appearance` do proprietário) **substituem** `logoUrl` e `faviconUrl` (D-10), que **somem** (não há dados em produção; a migração os descarta). O favicon de cada espaço sai pelo `generateMetadata` (`icons`). Padrão de reserva: o `src/app/favicon.ico` pequeno (A-024).

## 3. Modelo de dados (esboço; o Dados e o Arquiteto o fecham)

- `Image { id (cuid, opaco), kind ("avatar"|"logo"|"favicon"), mime, bytes (Bytes), width, height, sha256, ownerId (String?, null = site), createdAt }`. Índice por `ownerId`.
- `User.avatarImageId String? @unique → Image (onDelete: SetNull)`; ao excluir o usuário, apagar também suas `Image` (a transação da exclusão de usuário).
- `SiteConfiguration`: **remove** `logoUrl`, `faviconUrl` e os seis campos sociais; **acrescenta** `logoImageId?`, `faviconImageId?`, `showLogo` (padrão true), `showName` (padrão true), `modeIconPair` (padrão `sun_moon`), `directoryTitle` (padrão `Espaços`).
- `Appearance` (por proprietário): **remove** `logoUrl`, `faviconUrl` e os seis sociais; **acrescenta** `logoImageId?`, `faviconImageId?`, `showLogo`, `showName`.
- `FooterLink` (acima). Migração: os seis campos antigos viram `FooterLink` (`icon` = discord, github, youtube, instagram, linkedin, twitch; só os preenchidos e com `https`).
- Funções do Dados (sem ler ambiente; o Core passa os limites): `saveImage`, `getImage`, `replaceImage(kind, ownerId)` (transacional, apaga a antiga), `deleteOwnedImages`, `listFooterLinks(ownerId|null)`, `replaceFooterLinks(ownerId|null, links)` (lote transacional, valida o teto e a unicidade), e as leituras de aparência e de configuração já devolvendo os novos campos. **O backup (`db:backup`) e a restauração continuam verificando o banco inteiro; conferir que as `Image` entram e que o teste de backup as cobre.** Atualiza `er-vitrine.dbml`.

## 4. API e rotas (esboço; o Core fixa os nomes e o Arquiteto os documenta no §5.10)

- **Envio (multipart):** `PUT /api/appearance/logo` e `/favicon` (o próprio proprietário), `PUT /api/configuration/logo` e `/favicon` (administrador), `PUT /api/users/me/avatar`; cada um com `DELETE` para remover. Corpo `multipart/form-data` com `file`. **O envoltório `route()` hoje é JSON:** o Core acrescenta um modo `multipart` com **limite de leitura** (2 MB + sobrecarga; acima, 413), `Content-Type` conferido, **limite de taxa próprio** (por exemplo, 10 por minuto por usuário) e **no máximo um processamento por usuário e dois no total** (a lição da fila de validação de texto, ADR-033). O `sharp` roda fora do laço de eventos; **qualquer falha de decodificação, formato ou dimensão** é 422 `INVALID_IMAGE` (mensagem em português, **sem eco do arquivo**), nunca 500.
- **Moderação:** `DELETE /api/users/:id/avatar` (administrador, **`reason` obrigatório**, notificação `MODERATION` com um tipo novo, p. ex. `AVATAR_REMOVED`, no mesmo molde da moderação de conteúdo).
- **Rodapé:** `GET /api/footer-links` (o do próprio dono) e `PUT /api/footer-links` (o lote; substitui), e o equivalente do site para o administrador (`/api/configuration/footer-links`). Validação por Zod (ícone da lista, `https` ou `mailto`, teto de 8, unicidade, ordem).
- **Configuração e aparência:** `PUT /api/configuration` e `PUT /api/appearance` ganham os campos novos (`showLogo`, `showName`, `modeIconPair`, `directoryTitle`) e **perdem** as URLs e os links fixos; a regra "pelo menos um ligado" e "`showLogo` exige logo quando `showName` está desligado" é do servidor.
- **`GET /media/<id>`:** Route Handler público e dinâmico só na resposta (a imagem é imutável: `Cache-Control` imutável; 404 para id inexistente, sem distinguir). **Revalidação (ADR-030):** trocar logo, favicon ou avatar revalida o espaço e o portal por caminhos literais (o avatar entra no diretório da `/`).
- **CSP:** `img-src 'self' data:`; confira que nenhuma página carrega imagem `https:` externa (o `data:` é dos ícones e da pré-visualização).

## 5. Segurança (o que o upload exige; vira CT e mutações)

Recusa de SVG, GIF, HTML renomeado, ZIP, poliglota JPEG+HTML; arquivo de 0 byte; MIME declarado diferente do conteúdo; imagem de 30000×30000 (bomba de pixels); 2 MB + 1 byte (413); EXIF com GPS **removido** na saída (conferir por inspeção dos bytes); nome do arquivo nunca usado; `Content-Type` da resposta de `/media` sempre o da saída, com `nosniff`; um usuário não troca a imagem de outro (403, RN19) e o administrador só **remove** a de outro, com motivo; avatar e logo de uma conta suspensa continuam servidos? **Não**: o espaço suspenso responde 404 ao público (RN23), mas `/media/<id>` é público por id opaco: decidir e testar (o Arquiteto recomenda servir, pois o id não é listado em lugar algum além das páginas do espaço, que já dão 404). Limites de taxa e de concorrência contra abuso; **o `sharp` nunca roda no laço de eventos do servidor**.

## 6. Interface

### 6.1 Popout das notificações (item 1)
O sino abre um **painel não modal** (padrão *disclosure*: `aria-expanded`, `aria-controls`, **sem** `aria-modal`), ancorado ao botão; mostra até **8** notificações recentes (`GET /api/notifications?limit=8`), cada uma com ler e dispensar inline, "Marcar todas como lidas" e o link **"Ver todas"** para `/admin/notificacoes`. **Esc** fecha e devolve o foco ao sino; clique fora fecha; Tab sai do painel sem prender; abaixo de 640 px o painel ocupa a largura da tela. O contador, o rótulo acessível e a atualização por evento do sino não mudam. Reaproveita `NotificationList` e o cliente da API. Passa no axe e não causa salto de layout.

### 6.2 Navegação (item 5)
- **Páginas públicas** (portal, espaço, documento): um componente cliente mínimo, `AdminLink`, mostra **"Administração"** (→ `/admin`) à direita da barra **só para quem está logado**. Como essas páginas são estáticas (ISR), a decisão é do cliente: depois da hidratação, **só se existir o cookie-marcador `vitrine-logado=1`** (não-HttpOnly, sem segredo, escrito pelo `LoginForm` ao entrar e apagado ao sair e quando `GET /api/auth/get-session` devolver `null`), ele consulta `GET /api/auth/get-session` (`fetch` simples; **sem** o cliente do `better-auth`, por causa do LCP) para confirmar; visitantes anônimos **não fazem requisição alguma**. Sem salto de layout (o item aparece no fim da barra, sem deslocar o resto). Com senha provisória pendente, o link leva a `/admin/senha`.
- **Painel:** o nome (e a logo) do site no cabeçalho do painel passam a levar a **`/`** (hoje levam a `/admin`); o painel segue acessível pelo menu e pelo "Administração" do site.

### 6.3 Defeito: a cor do sistema não muda o painel (item 6)
Sintoma relatado: depois de alterar a paleta do **site** (`/admin/configuracoes`), as páginas do painel (por exemplo, `/admin/aparencia`) continuam com as cores antigas. **Hipótese (a confirmar):** o layout do painel (`src/app/admin/layout.js`, que envolve tudo em `SiteTheme` com a configuração do site, ADR-030) **persiste entre navegações do cliente** e não é renderizado de novo; o formulário grava por `PUT /api/configuration` e **nada chama `router.refresh()`** (o `ProfileForm` já tem esse envoltório, o `ConfigurationForm` não). **Correção:** o `ConfigurationForm` ganha `onSaved` (UI) e um envoltório Cliente em `src/app/admin/configuracoes/` chama `router.refresh()` (Core); **teste e2e:** salvar a paleta do site e navegar, **sem recarregar**, até `/admin/aparencia`, conferindo a variável `--vitrine-light-primary` (ou a cor computada de um botão primário). **Esclarecimento:** `/admin/aparencia` edita a aparência do **próprio** usuário (o espaço dele), e **não** altera o painel (ADR-030: o painel usa a paleta do **site**). Se o Engenheiro Chefe queria que o painel use a paleta do próprio usuário, é outra decisão (o Arquiteto pergunta antes de tocar).

### 6.4 Modo no painel (item 7)
O `ColorModeToggle` entra no cabeçalho do painel (mesmo componente, mesmo cookie, o par de ícones do site).

### 6.5 Demais
Componentes novos: `ImageUpload` (seletor, pré-visualização local, tamanho e formato aceitos, erro `INVALID_IMAGE` em português, remover), `IconPicker` e `FooterLinksEditor` (lista de até 8, um por ícone, validação local de `https`/`mailto`, aviso do e-mail público), `Footer` (renderiza `FooterLink`s com os ícones do Simple Icons inline), `Avatar` (imagem ou iniciais; `alt` vazio quando o nome está ao lado), o par de ícones do `ColorModeToggle`, a `Navbar` com `showLogo` e `showName`, e o campo `directoryTitle` no `ConfigurationForm`. Tudo por *props* (os componentes não leem banco nem sessão); só tokens de tema; mensagens em português; acessibilidade verificada de novo (A-023 vale como baseline: o `test:a11y` precisa continuar com **zero** violações e ganhar os estados novos).

## 7. Casos de teste a criar (o Arquiteto numera a partir de CT56)

Upload e processamento (aceita PNG/JPEG/WebP; recusa SVG, GIF, poliglota, 0 byte, bomba de pixels, 2 MB+1; EXIF removido; dimensões de saída; id novo e antiga apagada); `/media` (cabeçalhos, 404, imutável); a CSP sem `https:` em `img-src` e sem violações; moderação do avatar (motivo, notificação, escapado); rodapé (lote, teto de 8, um por ícone, `https`/`mailto`, `javascript:` recusado, migração dos seis campos antigos); modo por cookie (script, sem *flash*, sem "auto", primeira visita clara, o layout **continua estático**: o ensaio confere `x-nextjs-cache`/ISR das páginas públicas); popout (teclado, foco, Esc, axe); navegação (`AdminLink` só com o marcador; anônimo sem requisição; nome do painel → `/`); defeito 6 (e2e do refresh); avatar na `/` e iniciais; topbar (as três combinações, a regra "pelo menos um", logo primeiro); `directoryTitle`; **o ensaio HTTP do Arquiteto e o `mutacoes.py` ganham os casos e as mutações novas**.

## 8. Documentos que o Arquiteto atualiza (A-025)

Cap. 4 (RF24 e RN17 substituídos; RF/RN novos; UC de perfil e de aparência; RNF02 se for o caso); Cap. 5: `dados.tex` (§5.5), `api.tex` (§5.10: multipart, `/media`, `INVALID_IMAGE`, rodapé), `rotas.tex` (§5.11: componentes e `/media`), `seguranca.tex` (§5.12: upload, a CSP nova, o cookie), `tema.tex` (§5.9: o modo por cookie e o par de ícones), `isr.tex` (o layout continua estático; revalidação de mídia), `autenticacao.tex` (o cookie-marcador); Apêndice A (dicionário: `Image`, `FooterLink`, campos novos e removidos) e `er-vitrine.dbml`; Apêndice D (`sharp`, backup com imagens, `img-src`); Apêndice E (**ADR-034** mídia; **ADR-035** rodapé por ícones, substitui a ADR-013; **ADR-036** modo por cookie, ajusta a ADR-025 e a ADR-031; **ADR-037** topbar, par de ícones, título do diretório, avatar e navegação); Apêndice G (glossário); Cap. 6 (módulos novos, M21 a M2x, e os relatos); Cap. 7 (CT novos); `CLAUDE.md` (estado); `doc/revisao/` (ensaio e mutações).

## 9. Ondas e tarefas

| Tarefa | Agente | Depende de | Conteúdo |
|---|---|---|---|
| **A-024** (já no mural) | Core | nada | favicon pequeno, `preload: false` na Geist Mono, *log* do 503, duas figuras de teste |
| **A-025** | Arquiteto | nada | especificação (LaTeX): **passo 1 = dados (§3), commitado primeiro, libera o Dados** |
| **A-026** | Dados | A-025 passo 1 | esquema, migração, funções, backup, testes |
| **A-027** | UI (onda 0) | nada (contrato por *props*) | itens 1, 5, 7, 4 (cookie, dois estados, par de ícones por *prop*), 10 (flags por *props*), 9 (campo por *prop*), 6 (`onSaved`) |
| **A-028** | UI (onda 1) | A-025 passo 2 (contrato de API) | `ImageUpload`, `IconPicker`, `FooterLinksEditor`, `Footer`, `Avatar`, a moderação do avatar |
| **A-029** | Core (épico) | A-026 integrada | `sharp`, multipart, `/media`, rotas, `generateMetadata` do favicon, CSP, envoltórios, páginas, marcador, e2e |
| **A-030** | Arquiteto | A-026, A-027..A-029 | integração, ensaio e mutações novos, F6 de novo (a11y e Lighthouse: as imagens mudam o LCP), CT29 de novo (Docker com `sharp`), documentação final, push |

Ordem de lançamento ao retomar: **(1) Arquiteto A-025 (passo 1 primeiro) + UI A-027 em paralelo** (a UI não depende do esquema); **(2)** quando o passo 1 estiver na `main`: **Dados A-026**; **(3)** quando o passo 2 estiver na `main`: **UI A-028**; **(4)** quando a A-026 estiver integrada: **Core A-024 e A-029**; **(5)** integração e fechamento (A-030). Memória: **no máximo dois agentes pesados ao mesmo tempo**; um `build`, `test:e2e`, `test:a11y`, `lighthouse` ou Docker por vez.

## 10. Riscos

O upload é a única mudança que cria **superfície de ataque nova** (revisão e mutações pesadas); o `sharp` é nativo (a imagem e o Windows de desenvolvimento precisam do binário; **CT29 de novo**); as imagens **mudam o LCP** (a medição final é depois do épico); o cookie-marcador pode ficar velho (o `get-session` confirma); migrar o rodapé e remover as URLs quebra quem usava URL externa (não há produção); o esforço é de **quatro a cinco rodadas** de agentes.
