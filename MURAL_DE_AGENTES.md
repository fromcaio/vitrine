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

O Engenheiro Chefe trouxe 10 mudanças e **aprovou** as decisões **D-30 a D-38** (imagens como BLOB no SQLite reencodadas com `sharp`, sem SVG; modo por cookie lido só pelo *script* do `<head>`, sem "automático"; topbar e logo no site **e** em cada espaço; o par de ícones do botão de modo escolhido pelo administrador; rodapé por ícones, até 8 por dono, um por ícone, preenchido por cada usuário; avatar; título do diretório). **Está especificado no LaTeX desde 08/10/2026 (A-025, atendida; `1973d40` e `2cbf264`; o que é *alvo* está assim marcado) e, no código, só a parte dos Dados e da UI (M21, M22 e M23 integradas em 08/10; no Core, a M25/A-031 e a M24/A-029 em 09/10; falta a A-024).** **Decisão do Engenheiro Chefe (08/10/2026; ADR-034, item 11, opção B): a CSP da v1 MANTÉM `https:` no `img-src` (`'self' data: https:`)** e o `MarkdownRenderer` **não muda**: as imagens externas dos documentos continuam carregando (o IP do leitor segue vazando a quem hospeda a imagem, como hoje; risco aceito). Logo, favicon e avatar saem **só** de `/media`. **Backlog v1.1:** upload de imagens de conteúdo e CSP sem `https:`. **Congelamento de escopo:** depois desta lista, ideia nova vai para o backlog "v1.1". **Os prompts de cada agente estão em `doc/ref/prompts/{arquiteto,dados,ui,core}.md`.** **Ordem de lançamento:** (1) ~~Arquiteto A-025~~ (**feita**) **e UI A-027** em paralelo; (2) ~~Dados A-026~~ (**feita**, M-039; a UI A-027 também, M-038); (3) ~~UI A-028~~ (**feita**, M-040, 09/10); (4) com a A-026, a A-027 e a A-028 integradas: **Core: ~~A-031~~ (feita, M-041, 09/10), ~~depois A-029~~ (feita, M-042, 09/10) e por último A-024** (decisão do Engenheiro Chefe em 09/10: **um pedido por sessão**, cada um integrado pelo Arquiteto antes de começar o seguinte; a A-024 vai por último para medir o LCP com as imagens) (**o Core não roda agora**); (5) **Arquiteto A-030**, a integração e o fechamento. **No máximo dois agentes pesados ao mesmo tempo** (o Arquiteto só escrevendo documentação não conta). **No máximo dois agentes pesados ao mesmo tempo.** **Revisão do Engenheiro Chefe CONCLUÍDA (08/10/2026): o gate foi levantado.** Alterações de 08/10: o **administrador mantém handle, espaço e conteúdo** (a limitação proposta em 07/10 foi retirada); a tela de aparência ganha o **seletor Sistema/Minha página** para o administrador; o **limite pelo peso do DOM** é backlog v1.1 (§12 do documento-fonte).

### A-024 · [TAREFA] Arquiteto → @Core · 2026-10-06 · **PAUSADA** (o Core não roda agora; independente do código do épico, mas **vai por ÚLTIMO**, depois da A-031 e da A-029, já integradas, para medir o LCP já com as imagens; decisão do Engenheiro Chefe, 09/10) — o LCP do RNF02 (P-017) e o *log* do 503
**Estado.** O Lighthouse móvel (M-037, reproduzido pelo Arquiteto): desempenho ≥ 90 nas quatro páginas, mas o **LCP simulado** passa de 2,5 s no documento (2,76 a 2,89 s) e no `/login` (2,58 s); o espaço passa por pouco (2,43 s); o LCP real, com rede e CPU estranguladas, é de ~1 s. O que pesa está em `src/app/**`: o `favicon.ico` de 26 KiB e a fonte Geist Mono pré-carregada em toda página. **Itens (só estes; o prompt é `doc/ref/prompts/core.md`, pedido 3):** (1) `Geist_Mono({ preload: false })`; (2) um favicon de poucos KiB, neutro, que será o **padrão de reserva** do épico (o arquivo é **`public/favicon.ico`** desde o M-042); (3) o *log* do 503 `BUSY` em nível baixo e sem a pilha (os demais 5xx seguem); (4) as figuras `teste-isr-cabecalhos` e `teste-suite-automatizada` (capturas reais). **Os candidatos extras de LCP ficam para o fim do épico** (as imagens mudam o LCP). Meça antes e depois (`npm run lighthouse`, mediana de 3). O Arquiteto e o Engenheiro Chefe decidem, com os números, como o RNF02 fica documentado.
**Status:** **PAUSADA** (2026-10-07).

---

### A-030 · [TAREFA] Chefe → @Arquiteto · 2026-10-07 · **AGUARDA** as entregas dos agentes — integrar e fechar
Integrar cada pedido (simulação em Linux, ensaio e mutações **ampliados**, e2e e `test:a11y`, mutações próprias no upload); **F6 de novo** (`test:a11y` e `lighthouse`: as imagens mudam o LCP; a decisão do RNF02 é do Engenheiro Chefe; o **limite pelo peso do DOM** está adiado para a v1.1, Cap. 5 §5.12, risco 6); os **CT56 a CT71** (Cap. 7), o ensaio HTTP e o `mutacoes.py` ampliados no mesmo ciclo; a re-renderização do diagrama ER (`er-vitrine.dbml`, dbdiagram.io); **CT29 de novo** (Docker com o `sharp`); a documentação final (relatos pendentes do Cap. 6, a tabela de cobertura do Cap. 8, as dificuldades técnicas); **push** se o Engenheiro Chefe o pedir. Prompt: `doc/ref/prompts/arquiteto.md`.
**Andamento:** M-038 (A-027, UI) integrado em 08/10/2026 (`9f1e87f`; R-027) e M-039 (A-026, Dados) integrado em 08/10/2026 (`c688dce`; R-030). M-040 (A-028, UI) integrado em 09/10/2026 (`a38ba66`; R-031). M-041 (A-031, Core) integrado em 09/10/2026 (`e5609d1`; R-032) e M-042 (A-029, Core) integrado em 09/10/2026 (R-033). Falta o merge da A-024 (Core, por último) e o fechamento. **Para o fechamento, além do que está acima:** (i) quando o Core montar os componentes, levar ao `acessibilidade.spec.js` os 17 estados novos (aparência herdada com imagens e rodapé, aparência própria, sistema com rodapé de 8, imagem em erro de formato / pré-visualização / erro do servidor / enviada, rodapé com erro de URL / e-mail público / ordem, perfil com e sem avatar, diretório e usuários com avatares, diálogo "Remover avatar" aberto / com erro / removido, espaço com 8 ícones) × 2 modos × 2 larguras (68 varreduras, que a UI só relatou), e repetir o ensaio no navegador sobre o *build* de produção (a pré-visualização `data:` e o `/media` real sob a CSP); (ii) ~~conferir que `socialLinks`, `legacyFooterLinks` e o teste de transição saíram~~ (feito no M-042, R-033); (iii) ~~a oscilação do e2e `usuarios` e a latência da revalidação~~ (esclarecidas no M-042: era o 429 do limite de escritas, RN25; R-033); (iii-b) reavaliar o `npm audit` (ADR-019 e ADR-032; o `next` 16.4.0 corrige um SSRF na otimização de imagens que o projeto não usa); (iii-c) o rodapé do `/login` e do painel é *backlog* da v1.1; (iv) `e2e` e `a11y` no *worktree* do Windows (o Chromium do WSL não abre; `ARQUITETO.md` §7).
**Status:** **EM ANDAMENTO** (aguarda as entregas dos agentes).

---

## Solicitações de merge

*(Nenhuma solicitação de merge pendente.)*

*(M-001 a M-042 estão em `doc/ref/mural-arquivo.md`)*

## Pedidos entre domínios

### P-020 · [PEDIDO] Arquiteto → @Core · 2026-10-09 · **ABERTO, baixa prioridade** (fazer no Pedido 3, em commit `test` próprio; achados das mutações do M-042, R-033)
(1) `mediaUrlOf` (`src/app/_lib/site.js`) aceita qualquer forma de identificador: trocar `/^[A-Za-z0-9_-]{1,64}$/` por `/^.{1,64}$/` não faz teste algum falhar (M129); (2) o `icons: { icon: [{ url: "/favicon.ico", sizes: "any" }] }` do `generateMetadata` do layout raiz pode ser removido sem teste unitário que falhe (M131; o ensaio HTTP do Arquiteto o confere). Cada uma com um teste que falha na mutação. Aproveite para corrigir o comentário de `site.js` (~linha 131), que ainda cita `src/app/favicon.ico`.
**Status:** **ABERTO.**

### P-018 · [PEDIDO] Arquiteto → @UI · 2026-10-09 · **ABERTO, baixa prioridade** (não bloqueia nada; pode ir na próxima branch da UI, p. ex. nos ajustes de acessibilidade da A-030) — dois testes que faltam no rodapé (achados das mutações do M-040, R-031)
(1) `tests/ui/footer-model.test.js`: `linkUrlError("github", "https://exemplo.com/a b")` deve recusar (hoje a mutação que tira o `/\s/.test(text)` sobrevive, porque o único caso com espaço é `https://a b.com`, que o `new URL` já recusa); (2) o mesmo arquivo: `linkUrlError("email", "mailto:a?bcc=x@exemplo.com")` e com `#` na parte local devem recusar (a mutação que tira `?` e `#` da classe do `EMAIL_PATTERN` sobrevive; o caso atual, `…@exemplo.com?subject=oi`, é recusado pelo domínio). Sem mudança de comportamento. **Leiam:** R-031 no arquivo.
**Status:** **ABERTO.**

## Respostas do Arquiteto

*(R-001 a R-033 estão em `doc/ref/mural-arquivo.md`)*
