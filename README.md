# Vitrine

Plataforma de publicação de conteúdo em Markdown (com fórmulas em LaTeX e código com destaque), feita como um **monolito Next.js 16**. Cada usuário tem um espaço público em `/{handle}`; a página `/` é o portal do administrador. O administrador cria as contas, modera o conteúdo e define a aparência do sistema; cada usuário personaliza a própria página (cores, logotipo, *favicon*, avatar, rodapé por ícones, modo claro e escuro).

- **Stack:** Next.js 16 (App Router), React 19, Prisma 7 com o *driver adapter* `better-sqlite3` (SQLite em arquivo), `better-auth`, Tailwind CSS 4, `react-markdown` + `remark-math` + `rehype-katex`, `sharp`. JavaScript com JSDoc (sem TypeScript).
- **Estado:** versão inicial (v1) com o código e a documentação concluídos em 10/10/2026. Ainda não há *tag* de versão. O que falta está em [Pendências declaradas](#pendências-declaradas).
- **Documentação:** a fonte da verdade é o LaTeX em `doc/tex/` (o PDF sai de `bash doc/tex/build-isolado.sh`). A implantação completa está no Apêndice D (`doc/tex/apendices/apendice_d_implantacao.tex`).

---

## 1. Antes de começar

### Requisitos

| Para | Precisa de |
|---|---|
| Rodar sem Docker (Windows, Linux, WSL, macOS) | **Node.js 24** e npm (a versão da imagem Docker). Um Node mais antigo só gera o aviso `EBADENGINE`, mas os testes de interação exigem 22.22.2, 24.15 ou superior |
| Rodar com Docker | Docker com o plugin Compose (`docker compose`) e **6 GB livres** no disco do Docker para construir a imagem (a imagem final tem cerca de 2,2 GB) |
| Testes de ponta a ponta e de acessibilidade | O Chromium do Playwright: `npx playwright install chromium` (uma vez por máquina, cerca de 700 MB) |
| Compilar a documentação | Uma distribuição LaTeX; veja `doc/tex/README.md` |

### As variáveis de ambiente

Os nomes estão em `.env.example` (somente nomes, nunca valores). O arquivo `.env` **não é versionado**: nunca o envie ao Git.

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Arquivo SQLite. Fora do Docker: `file:./dev.db`. No Docker o Compose já define `file:/data/vitrine.db` |
| `BETTER_AUTH_SECRET` | Segredo que assina os cookies de sessão; 32 caracteres ou mais |
| `BETTER_AUTH_URL` | URL pública do site, sem barra final: `http://localhost:3000` localmente |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | O administrador inicial (a senha tem de 8 a 128 caracteres). Só o `admin:create` as lê |
| `ADMIN_NAME`, `ADMIN_HANDLE` | Opcionais. O `ADMIN_HANDLE` (3 a 30 caracteres de `a-z`, `0-9` e `-`) dá ao administrador um espaço público em `/{handle}`; sem ele o administrador não tem espaço público |

Para gerar um segredo (funciona em qualquer sistema com Node):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. Rodar localmente no Windows (PowerShell)

```powershell
# 1. Dependências (instala o necessário e gera o cliente do Prisma depois)
npm ci
npx prisma generate

# 2. Configuração: copie o modelo e edite o .env
Copy-Item .env.example .env
notepad .env
```

No `.env`, preencha pelo menos (valores de exemplo, troque-os):

```
DATABASE_URL=file:./dev.db
BETTER_AUTH_SECRET=<cole aqui o segredo gerado acima>
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=troque-esta-senha-123
ADMIN_NAME=Administrador
ADMIN_HANDLE=admin
```

```powershell
# 3. Banco: aplica as migrações e a configuração padrão
npx prisma migrate deploy
npx prisma db seed

# 4. Cria o administrador inicial (idempotente; lê o .env)
npm run admin:create

# 5. Servidor de desenvolvimento
npm run dev
```

Abra `http://localhost:3000/login` (veja [Primeiro acesso](#4-primeiro-acesso-como-administrador)). Se a porta 3000 estiver ocupada, use `$env:PORT=3001; npm run dev` e ajuste `BETTER_AUTH_URL` para a mesma porta.

> **Dica:** o `npm run dev` **não** envia a política de segurança de conteúdo (CSP). Para ver o site como ele é em produção, use o *build* de produção:
>
> ```powershell
> npm run build
> npm run start
> ```

Se o `npm run dev` ou o `npm run start` ficarem órfãos ao fechar o terminal, encerre o processo que ocupa a porta (`Get-NetTCPConnection -LocalPort 3000`, depois `Stop-Process -Id <PID>`).

---

## 3. Rodar localmente no Linux (e no WSL)

```bash
# 1. Dependências e cliente do Prisma
npm ci
npx prisma generate

# 2. Configuração
cp .env.example .env
nano .env        # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ADMIN_*

# 3. Banco
npx prisma migrate deploy
npx prisma db seed

# 4. Administrador inicial (idempotente)
npm run admin:create

# 5. Desenvolvimento ou produção
npm run dev                          # desenvolvimento
npm run build && npm run start       # produção (com a CSP)
```

Exemplo de `.env` mínimo, com o segredo gerado na hora (Linux/macOS):

```bash
printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:3000\nADMIN_EMAIL=admin@exemplo.com\nADMIN_PASSWORD=troque-esta-senha-123\nADMIN_HANDLE=admin\n' \
  "$(openssl rand -base64 32)" > .env
```

**No WSL**, prefira clonar o repositório dentro do sistema de arquivos do Linux (`~/vitrine`), e não em `/mnt/c` ou `/mnt/f`: o SQLite em modo WAL e o `npm ci` são muito mais lentos e menos confiáveis no disco do Windows. O Chromium do Playwright (testes e2e, de acessibilidade e Lighthouse) foi usado no Windows, e não no WSL.

---

## 4. Primeiro acesso como administrador

> **Atenção: a página inicial `/` não tem botão de entrar.** Visitante anônimo vê só o portal público. O link **"Administração"** só aparece no portal depois que há uma sessão ativa. **Para entrar, digite o caminho na barra de endereços: `http://localhost:3000/login`.**

1. Abra `http://localhost:3000/login`.
2. Entre com o `ADMIN_EMAIL` e o `ADMIN_PASSWORD` que você usou no `npm run admin:create`.
3. Você cai em `/admin` (o painel). Daí em diante o portal `/` passa a mostrar o link **Administração**, que leva de volta ao painel.
4. **Apague a linha `ADMIN_PASSWORD` do `.env`**: ela só serve ao `admin:create`.

O que fazer em seguida, pelo menu do painel:

| Para | Vá em |
|---|---|
| Escrever documentos e organizar a árvore | `/admin/conteudo` |
| Mudar nome, descrição e título do portal | `/admin/configuracoes` |
| Cores, logotipo, *favicon* e o rodapé por ícones (o sistema ou a sua página) | `/admin/aparencia` |
| Nome e avatar (o handle só o administrador altera) | `/admin/perfil` |
| Trocar a senha | `/admin/senha` |
| Criar contas, suspender e moderar o conteúdo de outros usuários | `/admin/usuarios` |
| Ver os avisos (suspensão, moderação, contraste) | `/admin/notificacoes` |

**Criando outros usuários:** não há cadastro público; só o administrador cria contas, em `/admin/usuarios`. A conta nova recebe uma **senha provisória**, mostrada uma única vez, e o usuário é obrigado a trocá-la no primeiro acesso (`/admin/senha`). O espaço público de cada usuário fica em `/{handle}`.

**Esqueceu a senha ou ficou sem administrador ativo?** Defina `ADMIN_EMAIL` (e `ADMIN_PASSWORD` com a nova senha) no `.env` e rode:

```
npm run admin:reset-password     # troca a senha de uma conta existente
npm run admin:create             # recupera o acesso quando não resta administrador ativo
```

Depois remova `ADMIN_PASSWORD` do `.env` outra vez.

> Se o login "não pega" (volta para `/login`) localmente, confira se a `BETTER_AUTH_URL` é exatamente o endereço e a porta que você está usando no navegador (`http://localhost:3000`, e não `127.0.0.1`).

---

## 5. Rodar com Docker

O Docker é o alvo de implantação do projeto: uma imagem com `next start`, um volume para o SQLite e uma **única instância** (o cache, o banco e o limite de tentativas de login dependem disso; não use réplicas nem `--scale`).

```bash
# 1. Configuração (.env na raiz, como na seção 2/3). Aqui NÃO defina DATABASE_URL:
#    o docker-compose.yml já usa file:/data/vitrine.db
cp .env.example .env
#    preencha BETTER_AUTH_SECRET, BETTER_AUTH_URL, ADMIN_EMAIL, ADMIN_PASSWORD (e ADMIN_HANDLE)

# 2. Diretório do volume do SQLite (o usuário "node" do contêiner tem UID 1000)
mkdir -p data
sudo chown 1000:1000 data        # só no Linux; no Docker Desktop (Windows) basta o mkdir

# 3. Construir a imagem (alguns minutos; exige 6 GB livres)
docker compose build

# 4. Migrações e configuração padrão (uma vez)
docker compose run --rm vitrine npx prisma migrate deploy
docker compose run --rm vitrine npx prisma db seed

# 5. Administrador inicial (uma vez; idempotente)
docker compose run --rm vitrine npm run admin:create
#    depois apague ADMIN_PASSWORD do .env

# 6. Subir o serviço
docker compose up -d

# 7. Conferir
curl -sI http://127.0.0.1:3000/login | head -n 1       # HTTP/1.1 200 OK
```

No PowerShell, crie o diretório com `New-Item -ItemType Directory -Force data` e confira com `curl.exe -I http://127.0.0.1:3000/login`.

Depois abra `http://localhost:3000/login` e entre como administrador (seção 4).

Comandos do dia a dia:

```bash
docker compose logs -f vitrine                 # acompanhar o servidor
docker compose restart                         # reiniciar
docker compose down                            # parar (o banco continua em ./data)
docker compose up -d                           # subir de novo
docker compose run --rm vitrine npm run admin:reset-password
```

Pontos de atenção:

- A porta é publicada só em `127.0.0.1:3000`. Para expor na internet, coloque na frente um *proxy* reverso com **HTTPS** (Caddy ou nginx), repasse o `Host` e defina um único `x-forwarded-for`; o `BETTER_AUTH_URL` passa a ser `https://seu-dominio` (o cookie de sessão ganha `Secure`). O roteiro está no Apêndice D, "Proxy Reverso e HTTPS".
- **Atualizar:** faça a cópia de segurança, depois `git pull`, `docker compose build`, `docker compose run --rm vitrine npx prisma migrate deploy` e `docker compose up -d`.
- **Cópia de segurança do banco** (consistente, com o servidor no ar): `docker compose run --rm vitrine npm run db:backup -- /data/backups --keep 14`. Copie a pasta `data/backups` para fora da máquina; ela está no mesmo disco do banco. A restauração está no Apêndice D, "Cópia de Segurança e Restauração".
- Em Windows com Docker Desktop, o volume em *bind mount* pode não ser confiável para o WAL do SQLite em uso real. Serve para testar; para produção use uma VPS Linux com disco local.
- Depois de **recriar** o contêiner (`up -d` com imagem nova), o portal `/` mostra o tema padrão até a configuração do site ser salva uma vez em `/admin/configuracoes` (comportamento por projeto, ADR-021).

---

## 6. Comandos do projeto

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (sem CSP) |
| `npm run build` / `npm run start` | *Build* e servidor de produção (com CSP). O `build` não consulta o banco |
| `npm run lint` | ESLint |
| `npm test` | Vitest (banco SQLite temporário) |
| `npm run test:e2e` | Playwright de ponta a ponta sobre o *build* de produção, com banco temporário; falha em violação de CSP |
| `npm run test:a11y` | Varredura de acessibilidade com axe (224 varreduras) |
| `npm run lighthouse` | Lighthouse móvel, 3 rodadas, mediana |
| `npm run admin:create` | Cria o administrador inicial ou recupera o acesso |
| `npm run admin:reset-password` | Redefine a senha de uma conta |
| `npm run db:backup -- <pasta>` | Cópia consistente e verificada do SQLite (ou use `BACKUP_DIR`) |
| `npx prisma migrate deploy` | Aplica as migrações |
| `npx prisma db seed` | Grava a configuração padrão |
| `npx prisma studio` | Navegar pelo banco |

Rode **um** `build`, `test:e2e`, `test:a11y` ou Docker por vez: três processos pesados em paralelo já esgotaram a memória da máquina de desenvolvimento. Não rode o `npm run dev` junto com o `build` ou o `test:e2e` no mesmo diretório (ambos usam `.next/`).

---

## 7. Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Não acho o botão de login em `/` | Não há botão para anônimos. Acesse **`/login`** pelo endereço |
| `/admin` volta para `/login` | Sem sessão. Entre em `/login` |
| Login volta para a tela de login | `BETTER_AUTH_URL` diferente do endereço usado no navegador, ou HTTPS sem TLS no *proxy* |
| Rotas `/api` respondem 500 | `BETTER_AUTH_SECRET` não definido |
| `admin:create` pede `ADMIN_EMAIL`/`ADMIN_PASSWORD` | As variáveis não estão no `.env` (ou já foram removidas); defina e repita, o comando é idempotente |
| `admin:create` recusa outro e-mail | Já há um administrador ativo; novas contas se criam no painel |
| Erro de tabela ou banco inexistente | Faltou `npx prisma migrate deploy` (e `npx prisma db seed`) |
| `build` ou e2e falha logo após trocar de branch | Rode `npx prisma generate` |
| Erro 429 no login | Limite de tentativas; aguarde um minuto. Atrás de um *proxy*, ele deve repassar um único `x-forwarded-for` |
| Falha de escrita no banco no Docker | `data/` precisa pertencer ao UID 1000 (`sudo chown 1000:1000 data`) |
| `no space left on device` ao construir a imagem | Libere espaço (`docker builder prune`); a construção exige 6 GB livres |
| Formulário de login recarrega a página e mostra a senha na URL | A página não hidratou; uma CSP própria do *proxy* bloqueou os *scripts* do Next.js. Remova a CSP do *proxy* e troque a senha exposta |

A tabela completa está no Apêndice D, "Solução de Problemas".

---

## 8. Pendências declaradas

O código e a documentação da v1 estão concluídos. Não foram feitos, por dependerem de ambiente ou de pessoas:

- Instalação em uma **VPS Linux limpa com HTTPS** (CT29 no ambiente-alvo). A imagem foi verificada em contêiner, com o ensaio de 496 verificações e o navegador sob a CSP.
- Medição em **aparelho real** e leitura por **leitor de tela**.
- **Validação de usabilidade** com participantes (RNF04: SUS e tarefas T1 a T6): **não medida** na v1.
- Desempenho (RNF02): o requisito está cumprido no LCP real; o indicador do Lighthouse simulado fica acima de 2,5 s no documento com matemática (2,68 s). Melhorias (CSS bloqueante e KaTeX) estão no *backlog* da v1.1 (ADR-039).
- Os 15 diagramas PlantUML aguardam a renderização dos PNG (`doc/diagrams/src/`).
- *Backlog* v1.1: `doc/ref/epico-v1-aparencia-midia.md` §12.

---

## 9. Para quem contribui

O projeto segue o *Documentation-Driven Development*: a documentação em `doc/tex/` é escrita antes do código e é a fonte da verdade. Leia `CLAUDE.md` e, conforme o papel, `ARQUITETO.md` ou `DESENVOLVEDORES.md`. A coordenação é feita em `MURAL_DE_AGENTES.md`. Regras principais: nada de commits de código na `main` (branches `tipo/dominio-tema`, cada agente no seu *worktree*), commits no padrão Conventional Commits em português, e nunca versionar `.env*`, chaves ou dados reais.

Licença: veja o arquivo `LICENSE`.
