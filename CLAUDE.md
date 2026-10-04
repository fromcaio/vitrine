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
- **Escopo multiusuário (ADR-023 a ADR-027, desde 2026-10-02):** o produto terá vários usuários (papéis `admin` e `user`), um espaço público por usuário em `/{handle}` e a página `/` como portal do administrador, aparência por proprietário com modo noturno, notificações internas e moderação. Os capítulos 3 a 7 e os Apêndices A, B, D, E e G já foram reconciliados (2026-10-03; ADR-023 a ADR-032) e distinguem, em cada seção, o que está integrado do que é *alvo* (M15 a M20): **onde ainda houver conflito, vale a ADR mais recente.** **Trava de segurança:** hoje toda rota da API só exige sessão (RF21); nenhuma conta além do administrador pode ser criada antes de a autorização por dono estar integrada à `main`.
- **Sessão na nuvem do Arquiteto (desde 2026-10-03; `ARQUITETO.md` §7):** o Engenheiro Chefe pode autorizar, **sessão a sessão**, que o Arquiteto faça `git push origin main` (depois de `git pull --rebase origin main`) e `git push origin <branch>`; nunca `--force`. Os desenvolvedores continuam sem `push`, salvo, em sessão na nuvem: (a) o da própria branch de feature, quando o Engenheiro Chefe o autoriza ao lançar a tarefa; e (b) **commits exclusivos do mural** (`chore(mural): …`) na `main`, só da própria entrada, com `git pull --rebase origin main` imediatamente antes (autorizado pelo Engenheiro Chefe em 2026-10-04). Nunca outro commit na `main`, nunca `--force`. Na nuvem o Docker é iniciado à mão, a imagem do produto constrói com o `Dockerfile` do repositório (a base de verificação só ajusta o `apt` ao *proxy* do ambiente; `ARQUITETO.md` §7) e o Chromium é o de `/opt/pw-browsers`.
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
Leia os `.tex` diretamente. Os números de seção podem mudar; os rótulos `\label{...}` (citados entre parênteses) são estáveis.

| Preciso saber… | Arquivo e seção |
|---|---|
| Requisitos (RF/RNF), regras de negócio (RN), casos de uso (UC) | `doc/tex/capitulos/cap4_requisitos.tex` (§4.3 a §4.8) |
| Arquitetura, regras de dependência, estrutura de pastas | `cap5_arquitetura.tex` §5.1 a §5.4 |
| Modelo de dados e observações sobre o schema atual | `cap5_arquitetura.tex` §5.5 (`sec:arq-dados`); `apendices/apendice_a_dicionario_dados.tex`; `doc/diagrams/src/er-vitrine.dbml` |
| Autenticação, cache/ISR, API HTTP, rotas, segurança | `cap5_arquitetura.tex` §5.6, §5.7, §5.10, §5.11, §5.12 |
| Pipeline de Markdown e tema dinâmico | `cap5_arquitetura.tex` §5.8 e §5.9 |
| O que fazer em cada módulo (M01–M14), critérios de aceite e status | `cap6_implementacao.tex` |
| Casos de teste (CT01–CT54) | `cap7_testes.tex` |
| Decisões de projeto (ADR-001 a ADR-032; os D-xx iniciais estão todos resolvidos) | `apendices/apendice_e_adr.tex` |
| Implantação e operação | `apendices/apendice_d_implantacao.tex` |
| Processo DDD, papéis, fluxo Git, critérios de merge | `cap3_metodologia.tex` §3.3, `ARQUITETO.md`, `DESENVOLVEDORES.md` |
| Pendências (figuras, trechos de código, textos) | `apendices/apendice_f_pendencias.tex` (gerado) |
| Como usar a documentação e os diagramas | `doc/tex/README.md`, `doc/diagrams/README.md` |

Material histórico, **somente leitura**, em `doc/ref/` (relatório de IC, `er.dbml`, `use-case-diagram.plantuml`).

## 5. Estado do Repositório (registro de 2026-10-03)
O projeto é licenciado sob a **MIT** (arquivo `LICENSE`; ADR-015) e a documentação em `doc/tex/` é um **Documento de Arquitetura e Requisitos de Software**, sem elementos acadêmicos (ADR-016); não há decisões de projeto em aberto (ADR-017). Existem o *scaffold* do Next.js 16, o `prisma/schema.prisma` (6 modelos, `ContentStatus`, seis links sociais e índices, inclusive o índice parcial da raiz na migração SQL), a migração inicial, o *seed* da configuração padrão, as funções de acesso a dados (`db.js`, `content-tree.js`), o better-auth com cadastro público desabilitado, o comando `npm run admin:create`, os validadores Zod, as regras de revalidação, as rotas de API de conteúdo e de configuração (envelope `{ data }`; ADR-018), o Proxy, o layout raiz com `lang="pt-BR"`, que lê a configuração e injeta o tema no `<html>` e os metadados (`src/app/_lib/site.js`; ADR-021), a página 404 em português, a página `/login` com o `LoginForm` definitivo, a casca do painel `/admin` (`AdminShell`, com o nome do site; a visão geral ainda é provisória), os tokens de tema em `globals.css` e as funções de contraste de `src/lib/theme.js` (ADR-020), os avisos de contraste no `PUT /api/configuration` (campo `warnings`), a imagem Docker (`Dockerfile` em dois estágios, `docker-compose.yml` e `.dockerignore`), os cabeçalhos de segurança com a CSP sem *nonce* (`security-headers.mjs`, aplicados por `next.config.mjs`; ADR-022), o `.env.example` o `MarkdownRenderer` (`src/components/markdown/`: `react-markdown`, GFM, KaTeX sem confiança e realce de código por classes, com tokens claros e noturnos) o editor Markdown (`src/components/editor/`: `Editor`, `Toolbar`, `Preview` e `ContentEditor`, com validação pelo Zod do servidor, rascunho local por usuário e tratamento de 401, 403, 409, 413, 422 e 429; M09, ainda sem página: P-012), 947 testes Vitest (72 do Dados, 388 do Core e 487 da UI, com jsdom nos de interação) e a base dos testes de ponta a ponta com o Playwright (`npm run test:e2e`: 4 testes de fumaça sobre a aplicação de produção, com guarda de CSP; ADR-017), integrados pelos merges M-001 a M-011. `prisma` e `dotenv` estão em `dependencies` (a imagem Docker aplica `prisma migrate deploy`). **Ainda não existem:** as páginas públicas (o M07 está suspenso até a especificação de espaços), as páginas do editor (do Core; P-012), a árvore de conteúdo e o formulário de tema (UI). **Pendente:** a instalação em uma VPS Linux limpa, com HTTPS (CT29 no ambiente-alvo); o roteiro foi executado em contêiner, no Docker Desktop. Os quatro alertas de severidade alta do `npm audit` (Prisma 7: `mysql2` e `deepmerge-ts`) foram avaliados e aceitos (ADR-019); não rode `npm audit fix --force`, que rebaixaria o Prisma para a versão 6. O escopo foi ampliado em 2026-10-02 (ADR-023 a ADR-027; fase F2b e módulos M15 a M20), **especificado por inteiro em 2026-10-03** e ainda sem código: a implementação segue em sequência (A-013 Dados, A-014 Core, A-015 UI), e o M07, o M10 e o M11 foram reescopados pelo M17, M20 e M18. O remoto `origin` (GitHub) está configurado: nenhum agente faz `git push` sem pedido explícito do Engenheiro Chefe (a exceção da sessão na nuvem do Arquiteto está no §2).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
