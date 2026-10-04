# Ferramentas de revisão do Arquiteto

Scripts reutilizáveis para a **verificação por amostragem independente** (`ARQUITETO.md` §2.4). São do Arquiteto; os desenvolvedores não os editam. O ESLint os ignora (`doc/**`), e só valores **fictícios** são usados.

| Arquivo | Para quê |
|---|---|
| `ensaio-http.sh <worktree> [ensaio.mjs]` | Constrói o *build* de produção do *worktree* de revisão, sobe-o em banco novo (migração, *seed*, `admin:create` fictício) e roda o ensaio adversarial; imprime só a contagem `OK`/`FALHA` e as falhas. Porta: `ENSAIO_PORTA` (padrão 3100). |
| `ensaio-autorizacao.mjs` | As 84 verificações do M-013 sobre a API: rotas brutas do *plugin*, origem alheia, senha provisória, dois usuários, `authorId` forjado, lote misto, RN18, corpos grandes, suspensão, último administrador, taxa. **Ao integrar uma mudança de contrato, atualize as expectativas aqui, no mesmo ciclo.** |
| `mutacoes.py --dominio core\|dados --repo <worktree>` | Aplica uma mutação por vez nos pontos de segurança (16 do Core, 10 dos Dados), roda `npx vitest run tests/<domínio>`, restaura o arquivo e imprime `DETECTADA`/`ESCAPOU`. `NÃO ACHOU` = o código mudou, atualize a lista. Uma mutação que escapa é um achado (teste fraco) ou é equivalente (justifique). |

Uso típico, depois de `git worktree add --detach ../vitrine-review <branch>`, `npm ci` e `npx prisma generate` nele:

```bash
bash doc/revisao/ensaio-http.sh ../vitrine-review
python3 doc/revisao/mutacoes.py --dominio core --repo ../vitrine-review
git worktree remove --force ../vitrine-review
```

Para a **migração em banco legado**, monte um banco só com a migração `init`, popule-o com casos de borda (donos misturados na mesma árvore, e-mails com ponto e sublinhado, cor personalizada ao lado de cor padrão, sessão e conta), aplique `npx prisma migrate deploy` e confira `PRAGMA foreign_key_check` e `integrity_check`; o roteiro está descrito na R-008 de `doc/ref/mural-arquivo.md`.
