# Prompt — Engenheiro de UI (P-026, rodada 2: a barra de coleções fiel à referência e o menu lateral do celular; mesma branch `feat/ui-navbar-rolavel`)

Você é o **Engenheiro de UI** do projeto Vitrine (Next.js 16.4, Tailwind 4, React 19), em modo local, Windows. Domínio: `src/components/**`, `src/app/globals.css`, `src/lib/theme.js`. Mesmas regras do P-026 (`doc/ref/prompts/ui-navbar-rolavel.md`): só tokens de tema, sem cor fixa, sem `text-white`, mensagens em português, esforço sugerido high. **Releia aquele prompt (a seção "O que fazer" e as regras da sessão) e o seu `[MERGE]` M-046**; este texto só **corrige** o que o Engenheiro Chefe encontrou ao analisar a branch `feat/ui-navbar-rolavel` @ `33a37fd` e acrescenta um item.

## O que o Chefe encontrou (o M-046 está VETADO até a correção)
Ele abriu a branch no navegador e disse que **a barra de coleções não segue o arquivo de referência**:
1. **há espaço abaixo da barra** (o enchimento do item não encosta na borda inferior do cabeçalho);
2. **o sublinhado não foi removido** (o item ativo ainda o tem);
3. **as bordas dos itens estão arredondadas**;
4. **há espaço entre os itens**.
**Parte do erro foi do prompt do Arquiteto, não seu:** ele mandou `rounded-md`, manteve o sublinhado do ativo (para ele não se confundir com o *hover*), citou "o mesmo preenchimento do item" e deixou o `pb-3` da barra. O Chefe decidiu: **a estética é a da referência, sem essas concessões.** Onde este texto divergir do prompt anterior, **vale este.**

## Rodada 2 — o que fazer
### 1. A barra de coleções, igual ao `SectionTabs.js`
**Releia `F:\code\fromcaio-website\src\components\SectionTabs.js` (linhas 327 a 417: `renderArrowButton` e o `return`) e reproduza a estética, traduzida para tokens.** O quadro mostra a referência e o que ela vira aqui:

| Elemento | Referência | Aqui |
|---|---|---|
| Faixa | `flex w-full items-stretch overflow-x-auto` (**sem** `gap`, **sem** `padding`) | idem: os itens **se encostam**, de ponta a ponta, e **esticam até a altura da barra** |
| Item | `flex min-w-[132px] flex-none items-center justify-center px-5 py-2 text-sm font-semibold transition-colors`; **sem** `rounded`, **sem** borda, **sem** `underline` | idem (`min-w-32`, `px-5`, texto centralizado); **cantos retos**; **nenhum sublinhado em estado algum**; **sem anel** |
| Item em repouso | `text-foreground/70` | `text-on-secondary` (use `/70` só se medir **≥ 4,5:1** nos dois modos com as paletas padrão; senão, cheio) |
| *Hover* e **ativo** | `bg-[#666698] text-white` | `bg-primary text-on-primary`, **iguais** nos dois |
| Altura da barra | a do item (`py-2` + linha de texto) | a do item, **sem folga em volta**: a base do item **encosta na base do cabeçalho** (onde começa a sombra); **remova** o `pb-3` do `<nav>`, o `p-1` e o `gap-1` da faixa |
| Setas | `hidden sm:flex h-7 w-9 rounded-full border …`, com `mx-2` | idem: **pílula `h-7 w-9 rounded-full`** com `mx-2`, centralizada na altura da barra; no *hover*, borda na primária; pressionada, `bg-primary text-on-primary` |

- **Remova o anel (`ring-1 ring-inset`)** do *hover* e todo `underline`/`decoration`/`underline-offset` da barra. O **negrito** é o da referência: `font-semibold` em **todos** os itens (o ativo não precisa de mais peso).
- **O ativo continua `aria-current="page"`** e, agora, só o enchimento o distingue visualmente. Isso tem um custo que você **mede e relata** no `[MERGE]` (o Chefe aceitou, o Arquiteto o registrará): a razão do enchimento contra a barra (você mediu 2,83:1 no claro e 1,71:1 no noturno) e o caso `primary ≈ secondary`, em que o enchimento some. **Não** reponha sublinhado, anel nem borda para compensar; se achar uma pista equivalente que **siga a referência** (por exemplo, o texto do ativo `on-primary` contra o `on-secondary` do repouso), diga-a, sem aplicá-la.
- **Foco por teclado** (continua obrigatório): enchimento igual ao *hover* e um contorno **interno** (`outline-2 -outline-offset-2`, em `on-primary`), para o `overflow` não cortá-lo. O ajuste `keepInViewScrollLeft` e os demais comportamentos (setas, arrastar, roda, centralizar o ativo, `touch-action`, sem barra visível, movimento reduzido, sem salto de layout) **ficam**; o esmaecimento das bordas pode ficar se não deixar uma faixa visível sobre os itens encostados (verifique nos dois modos).
- Títulos longos: o item tem largura máxima e `truncate` (como hoje), com o título inteiro no `title`.

### 2. Menu lateral do celular (`Sidebar.js`): o texto do botão
Hoje o botão (abaixo de `md`) diz **"Menu: AEDS I"** (o título da coleção), qualquer que seja a página aberta. Deve mostrar **onde o leitor está**: a **trilha** de títulos da coleção até a página corrente, por exemplo **`AEDS I › P1 › Introdução`**.
- Trilha = os títulos de `collection`, e dos nós do `activePath` abaixo dela (`activePath[0]` é o slug da coleção; veja `activeIds` em `space-paths.js`), até o nó corrente, unidos por `›` (decorativo, `aria-hidden`). Crie uma função **pura** em `space-paths.js` (por exemplo, `trailOf(collection, activePath)` → `string[]`), testada à parte; títulos sempre **escapados** (texto do React).
- **Sem página aberta** na coleção (`activePath` vazio), ou slug que não bate: mostre **só o título da coleção**, como hoje, mas sem o prefixo "Menu: " visível. Trilha com **mais de 3 níveis**: `AEDS I › … › Introdução` (primeiro, reticências, **o corrente sempre inteiro**), com a trilha completa no `title`. O texto quebra de linha (`break-words`), sem rolagem horizontal, a 320 px.
- **Acessibilidade:** o nome acessível do botão precisa **conter o texto visível** (WCAG 2.5.3): coloque `<span className="sr-only">Menu: </span>` antes da trilha, e mantenha `aria-expanded`/`aria-controls`. O `<nav aria-label="Coleção …">` do painel não muda. No `md` em diante nada muda.

### 3. TBT do espaço (+70 ms) — tente reduzir
Você relatou 153 → 220 ms de TBT no espaço. Tente baixar o custo da hidratação **sem perder comportamento**: por exemplo, ligar o arrastar e a roda só no primeiro `pointerenter`/`touchstart` da faixa, medir o *overflow* sem forçar *layout* síncrono na hidratação, e não observar nada que não precise. **Meça** de novo (`npm run lighthouse`, só espaço, mediana de 3) e relate; se não conseguir reduzir, diga por quê (não é um portão).

## Critérios de aceite
- **No navegador real** (`build` + `start`; claro e noturno; 320, 390, 768 e 1280 px; CSP sem violação), **meça e relate**, item por item do Chefe: (1) a base dos itens = a base do cabeçalho (distância 0); (2) `getComputedStyle(...).textDecorationLine === "none"` em repouso, *hover*, foco e ativo; (3) `border-radius` 0 nos itens; (4) a distância entre itens vizinhos é **0** (`right` de um = `left` do seguinte); mais as medidas de antes (altura fixa e igual em todas as larguras e com 1, 9 e 40 coleções, CLS 0, página sem rolagem horizontal, setas, arrastar, roda, Tab, ativo centralizado). Para o menu do celular: a trilha com profundidade 1, 2, 3 e 5 e com títulos de 100 caracteres, a 320 e 390 px; abre e fecha; descreva as capturas.
- **Testes** (ajuste os do M-046 que afirmavam `rounded-md`, `gap-1`, `underline` e o anel, **diga quais e por quê**): as classes novas (sem `rounded`, `gap`, `underline`, `ring`, `pb-`; `items-stretch`; `bg-primary text-on-primary` no ativo e no *hover*); o `trailOf` (raiz, 2, 3 e 5 níveis, `activePath` vazio ou inconsistente, título com marcação HTML escapado); o botão do `Sidebar` (texto visível, `sr-only`, reticências, `title`, `aria-expanded`). **Mutações** (relate aplicadas/detectadas; linha de base verde; **confira que o Vitest rodou**): o `rounded-md`, o `gap-1`, o `pb-3`, o `underline` e o anel de volta; o ativo sem o enchimento; a trilha só com a coleção; as reticências no nível errado; o `sr-only` removido.
- `npm run lint`, `npm run build` (com e sem banco), `npm test -- --maxWorkers=4` (referência: 4020 + 40 *skipped*), `npm run test:e2e` (referência: 116 + 1) e `npm run test:a11y` **sem violação nova** (referência: 57 testes, 224 varreduras; o contraste do ativo e do botão do menu entra na varredura). Suíte completa, e2e e `test:a11y` **uma vez**, no fim.
- **Fronteira:** como antes (só `src/components/**` e `globals.css`; nada de `src/app/**`, `e2e/**`, `doc/**`, governança nem do mural na sua branch).

## Regras da sessão e entrega
- **Use o worktree que já existe** (`../vitrine-ui-navbar`, branch `feat/ui-navbar-rolavel`): commits **novos por cima** do `33a37fd` (nada de *rebase*, de `--amend` nem de reescrever o histórico; a branch já está no GitHub e o Chefe a baixou). **Sem `git push`.** Confira `git branch --show-current` antes de cada commit. Mesmas regras de memória (um `build`/`start`/`e2e`/`a11y`/`lighthouse`/navegador por vez; encerre cada um; se um comando for encerrado por falta de memória, pare e avise).
- **Commits** pequenos (a barra; o menu do celular; o TBT), Conventional Commits em português, `Refs: RF12, RF13, RNF05, RNF06, P-026`, com os *trailers* de atribuição do seu ambiente.
- **Entrega:** árvore limpa; na **cópia principal** (na `main`), **atualize o `[MERGE]` M-046** (não crie outro): o novo SHA, o que mudou, as medidas pedidas acima e **o que o Chefe precisa decidir** (o ativo só por enchimento; `primary ≈ secondary`), em commit **exclusivo do mural** (`chore(mural): M-046 reaberto com a rodada 2 (UI, P-026)`), relendo o mural antes de editar. Resposta final: **(a) O que mudou** (≤ 10 linhas) · **(b) Evidência** (as medidas, mutações, contagens) · **(c) Branch e SHA** · **(d) Desvios, dúvidas e o que depende do Chefe**.
