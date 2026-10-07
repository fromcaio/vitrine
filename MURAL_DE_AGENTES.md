# Mural de Agentes — Vitrine

> **Canal oficial de comunicação e de pedidos de merge** (o "Pull Request" do time).
> **Regras de ouro:** (1) este arquivo **só é editado na branch `main`**; (2) toda edição é um commit **só do mural** (`chore(mural): …`); (3) **só o Arquiteto apaga** mensagens resolvidas ou de terceiros; (4) assine com o seu domínio (Dados, Core, UI, Arquiteto).
> Procedimento completo: `DESENVOLVEDORES.md` §4 e `ARQUITETO.md` §2. Regras gerais: `CLAUDE.md`.
> **O que já foi atendido está em `doc/ref/mural-arquivo.md`** (somente leitura; use `grep -n` pelo identificador, não o leia inteiro). **Leia neste arquivo só a sua tarefa (`A-nnn`), os `[MERGE]` e os `[PEDIDO]` que lhe dizem respeito.**

**Tipos de mensagem:** `[MERGE]` pedido de integração · `[PEDIDO]` tarefa para outro domínio · `[RFC]` lacuna/mudança na especificação · `[BLOQUEIO]` · `[DÚVIDA]` · `[AVISO]` / `[TAREFA]` (Arquiteto).
**Identificadores:** `A-nnn` avisos/tarefas do Arquiteto · `M-nnn` pedidos de merge · `P-nnn` pedidos entre domínios · `R-nnn` respostas do Arquiteto.
**Status de um item:** `ABERTO` → `EM REVISÃO` → `VETADO` / `REABERTO` → `ATENDIDO` (o Arquiteto o remove e o move para o arquivo).

**Fases** (Cap. 3 §3.2): F1 Especificação, F2 Fundação e a especificação multiusuário (F2b) **concluídas**; F2b em implementação: A-013 a A-019 **integradas** (M-012 a M-037, 2026-10-04 a 2026-10-06: banco, autorização, moderação, notificações, modo noturno, layouts, editor, espaços públicos, portal, Proxy, senha provisória, formulários e páginas de aparência e de configuração, notificações na interface, backup do SQLite); **aberta (Core): A-024 (o LCP do RNF02 e o *log* do 503)**; a UI não tem tarefa aberta. F5 (a instalação em uma VPS limpa com HTTPS, CT29, a cargo do Engenheiro Chefe; a imagem já foi verificada em contêiner) e a documentação final seguem depois (Cap. 6).

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

### A-024 · [TAREFA] Arquiteto → @Core · 2026-10-06 · **ABERTA** — o LCP simulado do Lighthouse (RNF02; atende o P-017 da UI) e a higiene do *log* do 503 `BUSY`

**Estado.** A UI mediu (A-023, M-037) o Lighthouse móvel sobre o `build` de produção: desempenho ≥ 90 nas quatro páginas, mas o **LCP simulado passa de 2,5 s** (RNF02) no **documento com matemática (2,89 s)** e no **`/login` (2,59 s)**; o portal (1,82 s) e o espaço (1,87 s) passam. Com a rede e a CPU **aplicadas de verdade** no Chromium, o LCP é de 0,93 a 1,16 s nas quatro; os 2,6 a 2,9 s são da **simulação** (que soma o peso de tudo o que carrega antes do LCP, cerca de 250 a 300 KiB). O que pesa está em `src/app/**` (Core): um `favicon.ico` de **26 KiB com prioridade alta** e a fonte **Geist Mono** (23 KiB) pré-carregada em **toda** página, embora só blocos de código e campos `font-mono` a usem. O experimento da UI (já revertido) levou o documento a **2,68 s** e o `/login` a **2,51 s**: ajuda, mas **não basta sozinho para o documento**. **O Arquiteto reproduziu a medição** (mesma máquina, mediana de 3): portal 1,82 s, **espaço 2,43 s** (2,37 a 2,44: passa por **0,07 s**), documento 2,76 s (2,19 a 2,82), `/login` 2,58 s; a variação entre execuções chega a 0,5 s, então a **margem do espaço e do portal é estreita** e os ajustes devem melhorá-los também (confira que **nenhum** regride). O texto completo do pedido está em `doc/ref/mural-arquivo.md` (`grep -n 'P-017' doc/ref/mural-arquivo.md`).
**Primeiro passo (modo local):** `git worktree add ../vitrine-core-desempenho -b feat/core-desempenho main`; no *worktree*, `npm ci`, `printf 'DATABASE_URL=file:./dev.db\nBETTER_AUTH_SECRET=segredo-ficticio-local-0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\n' > .env` (`.env` fictício; **não** copie o `.env.example`) e `npx prisma generate`. Sem *push*. **Leia:** Cap. 4 RNF02; Cap. 5 §5.7 (ISR) e §5.12 (a CSP); `src/app/layout.js`, `src/app/favicon.ico` e `security-headers.mjs`; **`scripts/lighthouse.mjs`** (da UI; `npm run lighthouse` mede **3 rodadas** por página e dá a **mediana**; **só o use**) e o relatório do M-037 no arquivo do mural.
**Tarefas (`feat/core-desempenho`)** — **meça antes e depois de cada mudança** (`npm run lighthouse`, as mesmas quatro páginas, mediana de 3; um por vez, o Lighthouse é pesado) e **fique só com o que ganha sem regredir**; não arredonde nem fabrique resultado.
1. **`Geist_Mono({ preload: false })`** em `src/app/layout.js` (a fonte continua carregando, sob demanda, onde for usada).
2. **O favicon:** troque o `src/app/favicon.ico` de 26 KiB por um de **poucos KiB** (ou um `icon.svg` de 1 a 2 KiB com um ícone ICO mínimo de reserva): uma marca **neutra** do projeto (a letra "V" ou uma forma simples), **sem logotipo de terceiros**, que funcione em fundo claro e escuro; confira que o navegador o pede e o mostra.
3. **Os candidatos seguintes** (só se a mediana do documento ainda passar de 2,5 s; cada um com o ganho **medido**, e **descarte o que não ganhar**): (a) *preload* das três fontes do KaTeX **só** nas páginas com matemática (a cadeia CSS → fontes custa cerca de 50 KiB; use a API de *preload* do React/Next, com a CSP intacta); (b) uma lista de navegadores moderna (`browserslist` no `package.json`; arquivo compartilhado, declare-o no pedido) para tirar os 14 KiB de *Legacy JavaScript* que o Lighthouse aponta; (c) o *render-blocking* da folha de estilos (o relatório estima 760 ms): diga o que dá para fazer **sem** quebrar a CSP (o `inlineCss` do Next **não serve**: `style-src 'self'` o bloqueia). **Não** mexa no `LoginForm` (é da UI: tirar o cliente do `better-auth`, −13,7 KiB, muda o tratamento de erro da suspensão): se medir que seria decisivo, **diga o número** e abra um `[PEDIDO]` à UI.
4. **Higiene do *log* (backlog da R-025):** `src/app/api/_lib/http.js` registra **todo** status ≥ 500 com `console.error("[api] erro não previsto:", error)`, inclusive o 503 `BUSY`, que é **esperado** sob carga (no contêiner, sete linhas com a pilha depois do ensaio). Registre o `BUSY` (e só ele) em nível baixo e **sem a pilha**; os demais 5xx continuam como estão. Teste: o `BUSY` não chama `console.error`; um 500 de verdade chama.
**Critérios de aceite:** a tabela **antes e depois** das quatro páginas (móvel e desktop: desempenho, LCP, CLS, TBT; mediana e dispersão); o que foi aplicado e o que foi **descartado** (com o número); `lint`, `build` (também com `DATABASE_URL` de diretório inexistente e de banco vazio), `npm test -- --maxWorkers=4`, `test:e2e` e `test:a11y` (**uma vez** cada; o favicon e a fonte não podem regredir a acessibilidade nem a CSP: console sem violação sobre `build` + `start`); **mutações** do item 4 (o `BUSY` volta a registrar a pilha; um 500 deixa de registrar). **Não** edite `doc/**` (o Arquiteto decide, com os seus números, como o RNF02 fica documentado); imagens novas só se um *placeholder* pedir. **Memória:** o Vitest já está limitado a 4 processos; **um** `build`, `test:e2e`, `test:a11y`, `lighthouse` ou Docker por vez.

**Status:** **ABERTA** (2026-10-06).

---

## Solicitações de merge

*(nenhum pedido aberto)*

## Pedidos entre domínios

*(nenhum pedido aberto)*

## Respostas do Arquiteto

*(nenhuma ativa; R-001 a R-026 estão em `doc/ref/mural-arquivo.md`)*
