# Histórico da governança — Vitrine

> **Somente leitura; histórico.** Registro do que a governança já dispensou, para consulta sob demanda (não leia por padrão). Acrescentado pelo Arquiteto em 2026-10-04.

## A. Modo nuvem do Arquiteto (suspenso desde 2026-10-04; antes `ARQUITETO.md` §8)

Em 2026-10-03 e 2026-10-04 os agentes rodaram em sessões na nuvem (VM Ubuntu 24.04, clone próprio e privado do repositório). Esta seção registra o que diferia do trabalho local, caso o Engenheiro Chefe volte a usá-las.

**Git (autorização do Engenheiro Chefe, concedida sessão a sessão).**
- O Arquiteto continua sendo a **única** área que escreve código, documentação, governança e mural na `main`. Com a autorização da sessão, pode `git push origin main` (sempre depois de `git pull --rebase origin main`) e `git push origin <sua-branch>`.
- **Nunca `--force`**, nunca reescrever a `main`. O *proxy* do GitHub recusa a exclusão de branches: as já integradas são apagadas pelo Engenheiro Chefe, a quem se pede ao fim de cada etapa.
- O mural segue só na `main`, em commit exclusivo: rebaseie imediatamente antes de editar e envie logo; em conflito, preserve os dois lados.
- **Sem *worktrees*:** o clone da nuvem é só do Arquiteto. Para verificar uma branch, use `git switch --detach origin/<branch>` (ou um segundo clone descartável) e **volte à `main` antes de qualquer commit**. Os desenvolvedores continuam obrigados a usar o *worktree* (`DESENVOLVEDORES.md` §3).
- Commits no padrão de sempre (Conventional Commits em português, `Refs:` no rodapé) e, quando o ambiente exigir, os *trailers* de atribuição. Commit e envio a cada marco.

**Ambiente.** A VM usa o Node 22 (a imagem Docker, o 24): o `npm ci` avisa `EBADENGINE` por causa do `jsdom` (22.22.0 em vez de 22.22.2 ou superior), e a suíte passa mesmo assim. Rotina: `git fetch origin`, `npm ci`, `npx prisma generate`, `.env` com valores fictícios (nunca ler, imprimir nem versionar `.env*`), `npm run lint`, `npm run build`, `npm test`.

**Docker.** A VM não tem serviço do Docker em execução: o `dockerd` é iniciado à mão, em segundo plano (sem `systemd`; *overlayfs* e *cgroups* v1), com o registro fora do repositório. Isto **revoga, para a nuvem**, a regra de não iniciar o Docker (§2.1, item 5), que continua valendo na máquina local. Desde 04/10/2026 o ambiente libera `deb.debian.org`, e a imagem do produto **constrói sem trocar a base**, com o `Dockerfile` e a `node:24-bookworm-slim` do repositório (141 s, 1,95 GB, verificado em 04/10/2026). Duas particularidades do ambiente, sem efeito sobre o repositório: o *proxy* só aceita `CONNECT` (o `apt` por `http` recebe 405) e usa um CA próprio, que a imagem `slim` não tem. A verificação usa por isso uma base de **uma camada** sobre a mesma `node:24-bookworm-slim` (fora do repositório, passada pelo `ARG NODE_IMAGE`): `sed` trocando `http://` por `https://` em `/etc/apt/sources.list.d/debian.sources`, `Acquire::https::CaInfo` apontando para o CA do ambiente (`/root/.ccr/ca-bundle.crt`, copiado para a imagem) e `NODE_EXTRA_CA_CERTS`; o `docker build` usa `--network host` e repassa `HTTPS_PROXY`, `HTTP_PROXY` e `NO_PROXY` como `--build-arg`. Foi isso que substituiu o contorno anterior (a imagem completa `node:24-bookworm`, sem fontes do `apt`).

**Navegador.** O Chromium do Playwright vem em `/opt/pw-browsers` (revisão mais antiga que a do `@playwright/test` do projeto; não rode `playwright install`). Os ensaios usam uma configuração auxiliar **fora do repositório** (excluída em `.git/info/exclude`) que herda a `playwright.config.js` e acrescenta `launchOptions.executablePath: "/opt/pw-browsers/chromium"`. Se o ambiente não tiver Chromium, diga ao Engenheiro Chefe qual domínio liberar.

**PDF.** Instalar, sob demanda e como `root`: `latexmk texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra texlive-pictures texlive-publishers texlive-lang-portuguese texlive-bibtex-extra poppler-utils` **e `lmodern`** (o único acréscimo: sem ele falta o `lmodern.sty`). Depois, `bash doc/tex/build-isolado.sh --limpar`, com `TMPDIR` fora do repositório. Estado de 2026-10-03: 252 páginas, sem referência indefinida, com avisos de largura (*overfull*) só cosméticos.

**Diagramas.** `apt-get install plantuml default-jre-headless graphviz` (PlantUML 1.2020.02 do Ubuntu 24.04, suficiente para os 15 `.puml`). Validar: `plantuml -charset UTF-8 -syntax < arquivo.puml`; renderizar: `plantuml -charset UTF-8 -tpng -o <saída fora do repositório> doc/diagrams/src/*.puml`. O DBML não tem renderizador local (dbdiagram.io).

**Limite de uso.** A conta é compartilhada: trabalhe em passos curtos, não releia arquivos grandes sem necessidade e, perto do limite, registre o estado no mural e encerre.

## B. Modo nuvem dos desenvolvedores (suspenso; antes `DESENVOLVEDORES.md` §3)
Clone próprio e privado do repositório, **sem *worktree***; `git fetch origin` e `git switch -c <branch> origin/main`; `npm ci`; `npx prisma generate`; `.env` fictício. Com a autorização do Engenheiro Chefe ao lançar a tarefa: `git push origin <sua-branch>` (só a sua; nunca `main`, nunca `--force`); o pedido de merge e o commit exclusivo do mural (só da própria entrada) eram enviados à `main` com `git pull --rebase origin main` imediatamente antes. O Arquiteto buscava a branch no `origin` para revisar.

## C. Incidente de 2026-10-02 (R-001)
Várias sessões compartilharam a cópia principal; um commit de código foi parar na `main` e outro, na branch de um colega. Decisão do Arquiteto: manter o commit `74aac43` (revisado, correto; **não** se reescreve a `main`), apagar a branch superada e passar a exigir *worktree* próprio **sempre**, mesmo sem ver outro agente ativo. A decisão completa está na R-001 de `doc/ref/mural-arquivo.md`; a regra vigente, em `DESENVOLVEDORES.md` §3 e Cap. 3 (risco R15).
