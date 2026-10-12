# Prompt (adendo) — Engenheiro de UI (P-029: o rodapé com a mesma cor do cabeçalho; **mesma branch e mesmo worktree do P-027/P-028**, `feat/ui-sino-publico`)

**Adendo curto.** Regras da sessão, verificação proporcional, fronteira e entrega: as de `doc/ref/prompts/_regras-sessao-ui.md`. Commits novos por cima do que você já fez, em `../vitrine-ui-sino` (`Refs: RF24, RF29, ADR-035, P-029`); **atualize o `[MERGE]` que você já escreveu** (acrescente uma seção "P-029"), em vez de criar outro. Sem `git push`.

## Origem
Pedido do Engenheiro Chefe (12/10/2026): **o fundo do rodapé deve ser o mesmo do cabeçalho**, isto é, a **cor secundária definida pelo usuário** (a mesma `bg-secondary` da `Navbar`, que segue a aparência do dono do espaço e o modo claro/escuro). Hoje o `Footer` usa `bg-surface` (neutro), `border-t border-border` e `text-foreground`. Só aparência; sem API, esquema, dependência nem requisito novo.

## O que fazer (`src/components/layout/Footer.js`)
1. **Cor:** `bg-secondary text-on-secondary` no `<footer>` (os mesmos tokens da `Navbar`); **remova** o `bg-surface`, o `text-foreground` e o `border-t border-border` (o rodapé e o cabeçalho passam a ser da mesma cor, sem linha). Sem sombra no rodapé.
2. **Botões de ícone do rodapé** (hoje `border-border-strong hover:bg-border`): passam à mesma linguagem das setas da barra de coleções, derivada do `on-secondary`: repouso `border border-on-secondary/30` (fundo transparente ou `bg-on-secondary/10`, o que ficar melhor), *hover* `bg-on-secondary/20 border-on-secondary/50`; o ícone herda `currentColor` (`on-secondary`). Foco por teclado: contorno visível de 2 px em `on-secondary` (com `outline-offset`), conferido sobre a nova cor. Tamanho (`size-10`), `target`, `rel`, nomes acessíveis e a ordem do DOM **não mudam**; o leiaute de P-024 (empilhado e centralizado abaixo de `md`) **não muda**.
3. **A pré-visualização da aparência** (`PalettePreview` usa o `Footer`) acompanha sozinha, porque as variáveis da amostra já definem a secundária de cada modo; confirme no navegador que o rodapé da amostra tem a cor da secundária que está sendo editada, nos dois modos.
4. **Contraste:** o par `on-secondary` × `secondary` é o que a aparência já valida em 4,5:1, então o texto do rodapé o herda; **meça** (por cálculo dos tokens lidos no navegador) o texto e o ícone nos dois modos com a paleta padrão, uma paleta extrema e uma secundária quase branca, e a borda dos botões de ícone (informativo).

## Critérios
- **Navegador** (`build` + `start`; claro e noturno; 320 e 1280 px; CSP sem violação): o rodapé tem **exatamente a cor do cabeçalho** (compare `getComputedStyle(...).backgroundColor` dos dois, igual em ambos os modos) com 0, 1 e 8 ícones; texto e ícones legíveis; *hover* e foco visíveis; o rodapé sem ícones continua só com o texto centralizado no celular.
- **Testes** (só os relacionados; ajuste `tests/ui/footer.test.js`, que afirma `bg-surface`/`border-t`, **dizendo o que e por quê**): `bg-secondary text-on-secondary` no rodapé, sem `bg-surface`, sem `border-t`; as classes dos botões. **Mutações** só sobre o novo: `bg-surface` de volta; `text-foreground` de volta; o `border-t` de volta; botões com `border-border-strong`.
- **Resposta:** como nas regras (a)–(d), curta, com as medidas de cor e de contraste.
