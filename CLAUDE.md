# Bem-vindo ao Projeto Vitrine (Monolito Next.js)

Você está operando em um ambiente simulado de múltiplos agentes autônomos. Este projeto segue as diretrizes do **Documentation-Driven Development (DDD)** e utiliza um fluxo de trabalho baseado no Git e em comunicação assíncrona. (Aqui **DDD = *Documentation*-Driven Development**: a documentação é escrita antes do código, é a Fonte da Verdade e é conferida no *merge*. Não confunda com *Domain*-Driven Design.)

## 1. Descubra sua Persona
Sempre que o usuário (Engenheiro Chefe) iniciar uma conversa, ele informará qual é o seu papel nesta sessão. Com base nisso, você deve OBRIGATORIAMENTE ler o arquivo de diretrizes correspondente antes de fazer qualquer coisa:

- Se você for convocado como **Arquiteto / Redator Técnico**: Leia o arquivo `ARQUITETO.md`.
- Se você for convocado como **Arquiteto de Dados**, **Desenvolvedor Core** ou **Engenheiro de UI**: Leia o arquivo `DESENVOLVEDORES.md`.
- Se o papel **não** foi informado, pergunte antes de tocar em qualquer arquivo.

| Papel | Sigla na documentação | Domínio (resumo) |
|---|---|---|
| Arquiteto / Redator Técnico / Merge Master | Arquiteto | `doc/**`, governança, merges, limpeza do mural |
| Arquiteto de Dados | Dados | `prisma/**`, `src/lib/db.js`, `src/lib/content-tree.js` |
| Desenvolvedor Core | Core | `src/app/api/**`, `src/proxy.js`, autenticação, validação, revalidação, arquivos de rota |
| Engenheiro de UI | UI | `src/components/**`, estilos globais, editor, tema |

O detalhamento de propriedade de arquivos está em `DESENVOLVEDORES.md` (§1).

## 2. Regras Universais do Repositório
Independentemente do seu papel, estas regras se aplicam a você:
- **Stack:** Next.js 16 (App Router), Prisma ORM 7 com o *driver adapter* `better-sqlite3` (SQLite em arquivo, ex.: `DATABASE_URL=file:./dev.db`), Tailwind CSS 4, `better-auth`, `react-markdown` + `remark-math` + `rehype-katex`. Linguagem: JavaScript com JSDoc (sem TypeScript). Implantação: imagem Docker em VPS tradicional, com volume para o SQLite (D-04, ADR-011).
- **GitFlow:** É expressamente proibido fazer commits de código fonte diretamente na branch `main`. Todo desenvolvimento de software deve ser feito em branches nomeadas `tipo/dominio-tema` (ex.: `feat/dados-schema-inicial`, `fix/core-sessao-expirada`). **Cada agente trabalha em um *worktree* próprio, criado no primeiro passo** (`git worktree add ../vitrine-<agente> -b <branch> main`), mesmo sem ver outro agente ativo; a cópia principal fica sempre na `main` e só serve ao mural e ao Arquiteto, e ninguém troca a branch dela. Confira `git branch --show-current` antes de cada commit (`DESENVOLVEDORES.md` §3; incidente de 2026-10-02).
- **Comunicação:** A coordenação entre as áreas é feita através do arquivo `MURAL_DE_AGENTES.md`. Você só tem permissão para editar este mural estando na branch `main`, em commit exclusivo do mural.
- **Documentação:** A fonte da verdade do projeto são os arquivos LaTeX na pasta `doc/tex/` (capítulos em `doc/tex/capitulos/`, apêndices em `doc/tex/apendices/`) e os diagramas como código em `doc/diagrams/src/`. Nunca invente regras de negócio que não estejam documentadas lá: se faltar algo, abra um `[RFC]` no mural.
- **Escritor único:** somente o Arquiteto edita `doc/**` e os arquivos de governança. Desenvolvedores apenas **adicionam imagens** (capturas de tela e evidências) em `doc/tex/figuras/`, nos caminhos exatos exigidos pelos *placeholders* do LaTeX.
- **Segredos:** nunca leia, imprima ou commite `.env*`, chaves ou tokens. Os nomes das variáveis ficam em `.env.example`. Não use dados reais em testes ou capturas de tela.
- **Commits:** Conventional Commits em português, com os identificadores afetados no rodapé (ex.: `feat(dados): adiciona índice (parentId, order)` + `Refs: RF03, RN05`).
- **Versões novas:** o Next.js 16 e o Prisma 7 mudaram em relação ao conhecimento comum. Antes de codificar, leia `node_modules/next/dist/docs/` (Next.js) e as *skills* em `.claude/skills/prisma-*` (Prisma). Observe, por exemplo, que `middleware` agora se chama `proxy` e que `params` das páginas é assíncrono. O bloco `nextjs-agent-rules`, no fim deste arquivo, é mantido pelo `next dev` (Next.js 16.3.7) e já está versionado: não o edite nem o remova, ou o `next dev` o reescreve e suja a árvore.
- **Build sem banco:** o `next build` não pode consultar o banco (o estágio de *build* da imagem Docker não o tem; ADR-021). Quem ler dados do banco em um *layout* ou página que possa ser pré-renderizado deve passar pela guarda de `getSiteConfiguration` (`src/app/_lib/site.js`, que não consulta quando `NEXT_PHASE` é `phase-production-build`) ou por outra equivalente, sob pena de quebrar o `build`.
- **CSP só em produção:** o `next build`/`next start` envia a *Content-Security-Policy* de `security-headers.mjs` (sem *nonce*; ADR-022), mas o `next dev` não. Todo recurso novo que carregue *script*, estilo, fonte, imagem, quadro ou conexão deve ser verificado no navegador sobre `npm run build` e `npm run start`, com o console aberto e sem violações de CSP (Cap. 5 §5.12); mudar a política é um `[PEDIDO]` ao Core.
- **Escopo multiusuário (ADR-023 a ADR-027, desde 2026-10-02):** o produto terá vários usuários (papéis `admin` e `user`), um espaço público por usuário em `/{handle}` e a página `/` como portal do administrador, aparência por proprietário com modo noturno, notificações internas e moderação. Os capítulos 3 a 7 e os Apêndices A, B, D, E e G já foram reconciliados (2026-10-03; ADR-023 a ADR-032) e distinguem, em cada seção, o que está integrado do que é *alvo* (M15 a M20): **onde ainda houver conflito, vale a ADR mais recente.** **Trava de segurança (ADR-023, item 8): cumprida em 2026-10-04** (merge M-013, autorização por dono integrada); só o administrador cria contas, por `/api/users`. A moderação do conteúdo alheio (escrita do administrador, com motivo e aviso ao dono) e as páginas por espaço são a Parte 2 da A-014.
- **Modo de execução: local (desde 2026-10-04; a nuvem está suspensa, `ARQUITETO.md` §8).** Os agentes rodam na máquina do Engenheiro Chefe, ao mesmo tempo e sem se ver: cada desenvolvedor trabalha em um *worktree* próprio (regra acima), e a cópia principal fica na `main` e só serve ao mural e ao Arquiteto. **Ninguém faz `git push`** sem pedido explícito do Engenheiro Chefe; quando ele o pedir, o Arquiteto envia a `main` e as tags, sem `--force`. O trabalho das sessões na nuvem de 2026-10-03 e 2026-10-04 está na `origin/main`, e a cópia principal local o recebe por `git merge --ff-only origin/main` (`ARQUITETO.md` §7).
- **Fim de linha:** `.gitattributes` (`* text=auto eol=lf`); o índice é 100% LF. Configure o editor para LF.
- **Idioma:** documentação, commits, mural, comentários e textos de interface em português do Brasil; identificadores de código em inglês.

## 3. Comandos Úteis do Projeto
- Instalar dependências: `npm install` (Node.js 24, o da imagem Docker; o `jsdom` dos testes de interação exige 22.22.2, 24.15 ou superior: em um Node mais antigo o npm só avisa, `EBADENGINE`)
- Rodar o servidor de desenvolvimento: `npm run dev`
- Verificar antes de pedir merge: `npm run lint`, `npm run build` e `npm test` (Vitest, banco SQLite temporário; ADR-017)
- Testes de ponta a ponta (Playwright; Core; M-010): `npm run test:e2e` sobe `next build` e `next start` com um banco SQLite temporário fora do repositório e variáveis fictícias, e falha se o navegador registrar violação de CSP. Exige o Chromium (`npx playwright install chromium`, uma vez por máquina; ~700 MB) e uma porta livre. Os *specs* ficam em `e2e/` (do Core), fora de `tests/`; o `npm test` não os coleta. Não rode `npm run dev` no mesmo diretório durante o teste (ambos usam `.next/`)
- Gerar o cliente do Prisma (necessário após `npm install` e antes de `npm run build`; `src/generated/prisma` não é versionado): `npx prisma generate`
- Aplicar migrações do banco (apenas Arquiteto de Dados): `npx prisma migrate dev` (a conformidade com o Prisma 7 já foi integrada, D-09 e ADR-014; no Prisma 7 esse comando **não** roda `generate` nem o *seed*: execute `npx prisma generate` e `npx prisma db seed` explicitamente)
- Criar o administrador inicial (Core): `npm run admin:create`; lê `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` (opcional) do ambiente; é idempotente e **não** faz parte do *seed* (ADR-018; passo a passo no Apêndice D)
- Construir e executar a imagem Docker (Core): `docker compose build` e `docker compose up -d`; a construção exige **6 GB livres** no disco do Docker, e o roteiro completo (migrações, *seed* e `admin:create` em contêineres descartáveis) está no Apêndice D
- Visualizar banco de dados: `npx prisma studio`
- Ler/compilar a documentação: os `.tex` são texto e podem ser lidos direto; para gerar o PDF use `bash doc/tex/build-isolado.sh`
- Ver o que falta documentar ou ilustrar: `cd doc/tex && make pendentes AGENTE=<Core|Dados|UI|Arquiteto>`

> ⚠ Não compile `doc/tex` ao mesmo tempo em que um editor com *auto build* (LaTeX Workshop) está ativo: as duas compilações corrompem os arquivos `.aux`. Use `build-isolado.sh`.

## 4. Onde está a Fonte da Verdade
**Leia só o que a sua tarefa cita, e por seção** (`grep -n 'label{sec:...}'` e `Read` com `offset` e `limit`): nunca um capítulo inteiro. O Cap. 5 está em arquivos por tema, `doc/tex/capitulos/cap5/` (o `cap5_arquitetura.tex` só tem o título e os `\input`). O mural enxuto traz só o que está ativo; o histórico atendido está em `doc/ref/mural-arquivo.md` (leia por `grep -n <ID>`) e o da governança, em `doc/ref/governanca-historico.md`.

Leia os `.tex` diretamente. Os números de seção podem mudar; os rótulos `\label{...}` (citados entre parênteses) são estáveis.

| Preciso saber… | Arquivo e seção |
|---|---|
| Requisitos (RF/RNF), regras de negócio (RN), casos de uso (UC) | `doc/tex/capitulos/cap4_requisitos.tex` (§4.3 a §4.8) |
| Arquitetura, regras de dependência, estrutura de pastas | `capitulos/cap5/visao.tex` (§5.1 a §5.3) e `cap5/estrutura.tex` (§5.4) |
| Modelo de dados e observações sobre o schema atual | `cap5/dados.tex` (§5.5, `sec:arq-dados`); `apendices/apendice_a_dicionario_dados.tex`; `doc/diagrams/src/er-vitrine.dbml` |
| Autenticação, cache/ISR, API HTTP, rotas, segurança | `cap5/autenticacao.tex` (§5.6), `isr.tex` (§5.7), `api.tex` (§5.10), `rotas.tex` (§5.11), `seguranca.tex` (§5.12) |
| Pipeline de Markdown e tema dinâmico | `cap5/markdown.tex` (§5.8) e `cap5/tema.tex` (§5.9) |
| O que fazer em cada módulo (M01–M14), critérios de aceite e status | `cap6_implementacao.tex` |
| Casos de teste (CT01–CT54) | `cap7_testes.tex` |
| Decisões de projeto (ADR-001 a ADR-033; os D-xx iniciais estão todos resolvidos) | `apendices/apendice_e_adr.tex` |
| Implantação e operação | `apendices/apendice_d_implantacao.tex` |
| Processo DDD, papéis, fluxo Git, critérios de merge | `cap3_metodologia.tex` §3.3, `ARQUITETO.md`, `DESENVOLVEDORES.md` |
| Pendências (figuras, trechos de código, textos) | `apendices/apendice_f_pendencias.tex` (gerado) |
| Como usar a documentação e os diagramas | `doc/tex/README.md`, `doc/diagrams/README.md` |

Material histórico, **somente leitura**, em `doc/ref/` (relatório de IC, `er.dbml`, `use-case-diagram.plantuml`).

## 5. Estado do Repositório (registro de 2026-10-04)
Detalhe por módulo: Cap. 6; resultados: Cap. 7 e Cap. 8; decisões: Apêndice E. Aqui só o essencial.
- **Integrado** (merges M-001 a M-029; o M-027 foi vetado e refeito no M-029): *scaffold* do Next.js 16; `prisma/schema.prisma` multiusuário e as migrações `init` e `20261004120000_multiusuario` (M15); funções de dados por dono (`db.js` em WAL, `content-tree.js`, `limits.js`); autorização por dono, contas, aparência e limites (M16: `authz.js`, `route()`, `/api/users`, `/api/appearance`); better-auth sem cadastro público; `npm run admin:create`; validadores Zod, revalidação e rotas de conteúdo e de configuração (envelope `{ data }`, ADR-018); Proxy; layout raiz estático com tema e metadados (`site.js`, ADR-021); 404; `/login`; casca de `/admin`; tokens de tema e contraste (ADR-020); imagem Docker, cabeçalhos de segurança e CSP sem *nonce* (ADR-022); `MarkdownRenderer` e editor Markdown (componentes, M08 e M09); moderação de conteúdo alheio com motivo, rotas de notificações e revalidação por caminhos literais (Core, M-015), com a moderação em **uma só transação** com a notificação, `getNotification` e o cursor por dono (Dados, M-016); base do modo noturno (neutros e paletas padrão por modo, `contrastWarnings` por modo, *script* do modo e `ColorModeToggle`, ainda sem página que os use), login com o motivo da suspensão e conflito de versão no editor (UI, M-017); medição de desempenho das leituras públicas (Dados, M-018, só testes, `MEDICAO=1`); espaço inteiro por evento estrutural, contraste por modo no servidor com a notificação `CONTRAST`, **layout raiz estático** com layouts do portal (`(portal)`), do login e do painel pelo envoltório `.vitrine-tema`, `requireSession({ role?, path })` e as páginas do editor com o dono conferido antes de renderizar (Core, M-019 e M-021); componentes do espaço público (`SpaceLayout`, `Navbar`, `Sidebar`, `Footer`, `PortalHome`, `DocumentView`…) e `PasswordChangeForm` (UI, M-020); **páginas públicas `/[handle]` e `/[handle]/[...slug]` e o portal real**, Proxy dos espaços (o que não é de um `handle` ativo ou não tem forma de `handle`/slug vai ao 404 dinâmico `/_nao-encontrado`), `/admin/senha` com o redirecionamento da senha provisória (Core, M-022 e M-024); `ColorField`, `AppearanceForm` e `ConfigurationForm` (UI, M-023) com as páginas `/admin/aparencia` e `/admin/configuracoes` e o portal com `revalidate` de 60 s (Core, M-025); `npm run db:backup` (Dados, M-026: cópia consistente e verificada do SQLite, `VACUUM INTO`; o roteiro de restauração está no Apêndice D); `NotificationBell`, `NotificationList`, o menu do painel por papel e por senha provisória e `SpaceHome` (UI, M-028, ainda sem a ligação no cabeçalho nem a página de notificações).
- **Testes (fechamento de 2026-10-05):** 2572 Vitest aprovados em 84 arquivos (269 Dados, 1316 Core, 987 UI), mais 33 *skipped* (as medições do Dados e do Proxy, `MEDICAO=1`), e 59 de ponta a ponta (`npm run test:e2e`), com guarda de CSP (ADR-017); o ensaio HTTP do Arquiteto (`doc/revisao/`) tem 198 verificações. O teste `api-moderation-atomic` (PATCH com `version` velha) é instável por resolução de relógio (o Core o conserta na Parte 3d). **Memória:** três agentes em paralelo já esgotaram a memória da máquina do Engenheiro Chefe (20 CPUs lógicas); o `vitest.config.mjs` limita o Vitest a 4 processos, e é preciso rodar **um `build`, `test:e2e` ou Docker por vez**. Depois de trocar de branch ou atualizar a `main`, rode `npx prisma generate`: um cliente velho em `src/generated/prisma` faz o e2e estourar o `webServer`. `prisma` e `dotenv` estão em `dependencies` (a imagem aplica `prisma migrate deploy`).
- **Ainda não existem:** a ligação do sino ao cabeçalho do painel e as páginas `/admin/notificacoes`, `/admin/perfil`, `/admin/conteudo` (árvore) e `/admin/usuarios` (Core, Parte 3d e seguintes); a árvore do painel, os usuários e a moderação na interface (UI, etapa 5); o limite do corpo de 64 KiB e a recusa, na gravação, do texto que não renderiza em 2 s (ADR-033; P-016: um documento comum de 256 KiB leva uns 6 s e os hostis, até 30 s; a A-021 implementa, depois que a UI extrair o módulo do *pipeline*); a verificação da imagem Docker com as rotas novas e a instalação na VPS (F5).
- **Escopo multiusuário (ADR-023 a ADR-032):** especificado por inteiro; em implementação em sequência. Integradas: A-013 a A-018 e a Parte 3b da A-014. **Próximas (mural):** A-014 Parte 3d (Core: o SEO refeito está integrado; falta ligar o sino, `/admin/notificacoes` e o `SpaceHome`) e A-015 etapa 5a (UI: árvore do conteúdo, perfil e visão geral); depois, a Parte 3e e a etapa 5b (usuários e moderação).
- **Pendente:** instalação em uma VPS Linux limpa, com HTTPS (CT29 no ambiente-alvo; o roteiro foi executado em contêiner). Os alertas altos do `npm audit` (Prisma 7 e `braces`) foram avaliados e aceitos (ADR-019 e ADR-032): não rode `npm audit fix --force`.
- **Remoto:** `origin` (GitHub) configurado; nenhum agente faz `git push` sem pedido explícito do Engenheiro Chefe.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
