# Ferramentas de revisão do Arquiteto

Scripts reutilizáveis para a **verificação por amostragem independente** (`ARQUITETO.md` §2.4). São do Arquiteto; os desenvolvedores não os editam. O ESLint os ignora (`doc/**`), e só valores **fictícios** são usados.

| Arquivo | Para quê |
|---|---|
| `ensaio-http.sh <worktree> [ensaio.mjs]` | Constrói o *build* de produção do *worktree* de revisão, sobe-o em banco novo (migração, *seed*, `admin:create` fictício) e roda o ensaio adversarial; imprime só a contagem `OK`/`FALHA` e as falhas. Porta: `ENSAIO_PORTA` (padrão 3100). |
| `ensaio-autorizacao.mjs` | As 489 verificações do M-013 a M-043 (API, a aparência em duas camadas e o ISR com herança, imagens, `/media`, avatar e rodapé por ícones, páginas do editor, HTML dos layouts, espaços públicos, Proxy, senha provisória, notificações, sino, menu por papel, o orçamento de renderização e a fila, e as páginas de conteúdo e de perfil): rotas brutas do *plugin*, origem alheia, senha provisória, dois usuários, `authorId` forjado, lote misto, RN18, corpos grandes, suspensão, último administrador, taxa. **Ao integrar uma mudança de contrato, atualize as expectativas aqui, no mesmo ciclo.** As escritas esperam o `Retry-After` do 429 (`write`, `login`): sem isso, uma leitura logo depois de uma escrita recusada parece cache velho (R-033). |
| `mutacoes.py --dominio core\|dados --repo <worktree>` | Aplica uma mutação por vez nos pontos de segurança (137 do Core, 29 dos Dados; `--somente M21,M30` roda um subconjunto e `--alvo tests/core/a.test.js,tests/core/b.test.js` limita os testes executados a esses arquivos), roda `npx vitest run tests/<domínio>`, restaura o arquivo e imprime `DETECTADA`/`ESCAPOU`. `NÃO ACHOU` = o código mudou, atualize a lista. Uma mutação que escapa é um achado (teste fraco) ou é equivalente (justifique). |
| `mutacoes-ui.mjs <worktree>` | Mutações do Arquiteto nos pontos novos da UI do épico v1 (34: cookies `vitrine-modo` e `vitrine-logado`, `AdminLink`, botão de modo, herança da aparência, validações, popout do sino); `--somente=U03,U10` roda um subconjunto. Não usa Python: `node doc/revisao/mutacoes-ui.mjs ../vitrine-review`. |
| `migracao-legada-epico-v1.mjs <worktree> <arquivo.db>` | Ensaio da migração `20261008120000_epico_v1_midia_rodape` sobre um banco **legado populado com casos de borda** (links `http`, `HTTPS` em caixa alta e com espaços, `javascript:`, paletas padrão e personalizadas, uma só cor mudada, conteúdo, sessão, conta, notificações): 31 verificações (contagens preservadas, `foreign_key_check`, `integrity_check`, conversão e ordem dos links, nulos da herança, índices). Roda em qualquer ambiente com o `node_modules` do worktree. |

**Windows:** o `ensaio-http.sh` exige o **WSL, com um clone próprio dentro do sistema de arquivos do WSL** (por exemplo `~/vitrine`; **não** em `F:\`): ele depende de `ps -eo`, `nohup` e `mktemp`, e o `better-sqlite3` e o Prisma são nativos, de modo que o `node_modules` precisa ser instalado no mesmo ambiente que o executa. O `mutacoes.py` roda também no Git Bash ou no PowerShell (o Python se chama `python`; o script acha o `npx.cmd` e preserva o LF dos arquivos). Não misture ambientes no mesmo clone. No WSL, instale o Node.js 24 (`nvm install 24`; o npm 10 do Node 23 não lê o `package-lock.json` deste projeto) e rode os scripts de dentro do clone ou apontando para ele (`bash <caminho>/doc/revisao/ensaio-http.sh ~/vitrine-review`); a versão mais recente dos scripts fica na `main` da cópia principal (`/mnt/f/...`), e o clone só precisa do código sob revisão.

Uso típico, depois de `git worktree add --detach ../vitrine-review <branch>`, `npm ci` e `npx prisma generate` nele:

```bash
bash doc/revisao/ensaio-http.sh ../vitrine-review
python3 doc/revisao/mutacoes.py --dominio core --repo ../vitrine-review
git worktree remove --force ../vitrine-review
```

Para a **migração em banco legado**, monte um banco só com a migração `init`, popule-o com casos de borda (donos misturados na mesma árvore, e-mails com ponto e sublinhado, cor personalizada ao lado de cor padrão, sessão e conta), aplique `npx prisma migrate deploy` e confira `PRAGMA foreign_key_check` e `integrity_check`; o roteiro está descrito na R-008 de `doc/ref/mural-arquivo.md`.
