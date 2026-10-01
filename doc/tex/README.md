# Documentação oficial do Vitrine (LaTeX) — `doc/tex`

Esta pasta contém a **Fonte da Verdade** textual do projeto: um TCC em LaTeX (classe
`abntex2`, normas ABNT) que especifica requisitos, arquitetura, modelo de dados, API e
decisões do Vitrine. Ela é escrita *antes* do código e atualizada *depois* de cada merge
(metodologia *Documentation-Driven Development*; veja `CLAUDE.md`, `ARQUITETO.md` e
`DESENVOLVEDORES.md` na raiz do repositório).

> **Quem edita:** somente o agente **Arquiteto / Redator Técnico**.
> Desenvolvedores (Dados, Core, UI) **leem** estes arquivos antes de codificar, pedem
> mudanças pelo `MURAL_DE_AGENTES.md` e podem **adicionar imagens** (capturas de tela) em
> `figuras/telas/`, conforme descrito abaixo.

## 1. Mapa dos arquivos

| Caminho | Conteúdo |
|---|---|
| `main.tex` | Raiz do documento: metadados, ordem dos capítulos e apêndices |
| `vitrine.sty` | Macros do projeto: figuras com *placeholder*, pendências por agente, selos de status, listagens |
| `undergrad_thesis.cls` | Classe do template (capa e folha de rosto sobre `abntex2`) |
| `pretextual_elements.tex` | Folha de aprovação, dedicatória, agradecimentos, epígrafe, resumo, abstract |
| `acronyms.tex` | Lista de siglas |
| `references.bib` | Bibliografia (somente fontes reais e verificadas) |
| `capitulos/cap1_introducao.tex` … `cap9_consideracoes_finais.tex` | Capítulos |
| `apendices/apendice_a_…` … `apendice_h_…` | Dicionário de dados, schema, fontes de diagramas, implantação (Docker), ADRs, decisões abertas e resolvidas, mapa de pendências (gerado), glossário |
| `figuras/telas/` | Capturas de tela do sistema (PNG) — **substituem placeholders** |
| `figuras/diagramas/` | Diagramas renderizados a partir de `doc/diagrams/src/` (PNG) |
| `figuras/testes/` | Evidências de testes (Lighthouse, terminal, etc.) |
| `figuras/ic/` | Figuras extraídas do relatório de IC (protótipos e diagramas originais) |
| `imgs/` | Logotipo da instituição (capa) |
| `Makefile`, `build-isolado.sh` | Compilação, listagem de pendências, limpeza |

Capítulos principais para quem desenvolve: **Cap. 4** (requisitos, regras e casos de uso),
**Cap. 5** (arquitetura, modelo de dados, API, cache, segurança), **Cap. 6** (módulos, estado
e critérios de aceite de cada um) e **Apêndice F** (decisões em aberto).

## 2. Como compilar

Requisitos: MiKTeX ou TeX Live com `abntex2`, `latexmk` (Perl) e BibTeX. **Não** é preciso
`-shell-escape`, Python ou Pygments (as listagens usam o pacote `listings`).

```bash
cd doc/tex
make pdf                       # ou: latexmk -pdf main.tex
make pendentes                 # lista figuras/códigos/pendências por agente
make pendentes AGENTE=UI       # filtra por agente (Core, Dados, UI, Arquiteto)
make final                     # modo final: figura ou código ausente vira ERRO
make clean                     # remove auxiliares
```

Uma compilação limpa leva cerca de 50 s; as seguintes, cerca de 15 s. Para iterar em um
único capítulo, use `\includeonly{capitulos/cap5_arquitetura}` em `main.tex` (não commite).

### ⚠ Cuidado com editores que compilam ao salvar

Editores como o **VS Code com a extensão LaTeX Workshop** executam `latexmk` em `doc/tex` a
cada arquivo salvo. Se você (ou um agente) compilar ao mesmo tempo, as duas execuções
disputam os arquivos `.aux` e surgem erros **fantasma**, como
`File ended while scanning use of \BKM@entry`, `Undefined control sequence \@inp` ou
`Device or resource busy`. O TeX dá preferência aos arquivos do diretório atual sobre
`-outdir`, então trocar o diretório de saída **não** resolve. Opções:

1. **Compilar em cópia isolada** (recomendado para agentes e automação):
   `bash doc/tex/build-isolado.sh` (opções `--copiar`, `--limpar`, `--final`);
2. desativar o *auto build* do editor (LaTeX Workshop: `"latex-workshop.latex.autoBuild.run": "never"`);
3. se aparecer erro fantasma, feche as compilações em andamento e rode `make distclean && make pdf`.

## 3. Escrevendo a documentação

Regras gerais: português do Brasil; UTF-8; não use `_`, `%`, `&`, `#` sem escapar no texto
corrido (`\_`, `\%`, …); caminhos e identificadores de código devem ir em `\arq{...}`, que
aceita `_` sem escape e permite quebra de linha. Não use caracteres Unicode fora de
Latin-1/acentos comuns (o motor é `pdflatex`): para `≤` escreva `$\leq$`.

### Macros do projeto (`vitrine.sty`)

| Macro | Uso |
|---|---|
| `\vitrinefigura[opções]{Legenda}{fig:id}` | Figura com **placeholder automático** (veja §4) |
| `\vitrinecodigo[linerange={a-b}]{Agente}{caminho/no/repo}{Linguagem}{Legenda}` | Inclui um trecho do repositório; até existir, mostra "CÓDIGO PENDENTE" |
| `\vitrinependencia{Agente}{texto}` | Aviso de redação pendente endereçado a um agente (aparece no Apêndice G) |
| `\statusmodulo{planejado\|andamento\|implementado}` | Selo de status de módulo (Cap. 6) |
| `\req{RF01}` / `\reqtarget{RF01}` | Referência com hiperlink / definição do requisito (idem `\decisao{D-01}`, `\adr{ADR-001}`) |
| `\reqrow{ID}{Título}{Descrição}{Prior.}{Origem}{Agente}` | Linha padrão da tabela de requisitos |
| `\adrentry{…}` | Bloco padrão de ADR (Apêndice E) |
| `\arq{caminho}`, `\en{termo}`, `\agente{Core}` | Código/caminho em linha, estrangeirismo em itálico, nome de agente |

Linguagens de listagem: `VJS`, `VPrisma`, `VDBML`, `VPUML`, `VSh`, `VJSON`, `VCSS` e as
nativas (`SQL`, `HTML`…). Rótulos: `cap:`, `sec:`, `fig:`, `tab:`, `lst:`, `ap:`.

### Bibliografia

Somente fontes **reais e conferidas**; para páginas web, `url` + `urlaccessdate` com a data
em que a URL foi de fato aberta. Toda entrada precisa ser citada (`\cite{chave}`).

## 4. Placeholders de figuras: como funcionam e como substituí-los

Onde o texto precisa de uma imagem ainda inexistente, o capítulo contém, por exemplo:

```latex
\vitrinefigura[tipo=tela, arquivo=tela-login, agente=UI, largura=0.6,
  descricao={Tela de login: formulário de e-mail e senha e estado de erro.},
  ref={Fig. 5 do relatório de IC.}]
  {Tela de autenticação do painel administrativo}{fig:tela-login}
```

No PDF (modo rascunho) aparece uma caixa tracejada **FIGURA PENDENTE** dizendo o arquivo
esperado (`figuras/telas/tela-login.png`), o agente responsável e o que deve aparecer.
Para **substituir**:

1. gere a imagem e salve-a **exatamente** em `doc/tex/figuras/<tipo>/<arquivo>.png`
   (`.pdf`, `.jpg` e `.jpeg` também são aceitos). Tipos → pastas: `tela` → `telas/`,
   `diagrama` → `diagramas/`, `teste` → `testes/`, `ic` → `ic/`;
2. **não edite o `.tex`**. Na próxima compilação, a caixa dá lugar à imagem e o item sai do
   Apêndice G. Se a imagem exigir legenda ou largura diferentes, peça ao Arquiteto pelo mural.

Padrões das imagens: PNG; telas capturadas com janela de 1280 px de largura (ou mais), tema
claro, dados de demonstração realistas (sem e-mails, tokens ou dados pessoais reais);
nomes em minúsculas com hífens, sem acentos, espaços ou `_`.

Diagramas: o fonte está em `doc/diagrams/src/` e a renderização segue
`doc/diagrams/README.md` (`doc/diagrams/render.sh`/`render.ps1`; ER via dbdiagram.io).

### Modo final

`\usepackage[rascunho]{vitrine}` em `main.tex` mostra placeholders e pendências. Para a
entrega, use `make final` (cria e remove o arquivo-sinalizador `vitrine-final.flag`, sem
alterar o `main.tex`; no modo isolado: `build-isolado.sh --final`) ou troque para `[final]`:
pendências somem e **figura/código ausente vira erro de compilação**, impedindo entregar
com lacunas. O `make final` é esperado **falhar** enquanto houver placeholders.

## 5. Sobre o template

Baseado em [`latex-academic-thesis`](https://github.com/fromcaio/latex-academic-thesis)
(abntex2). Diferenças intencionais: `minted` foi substituído por `listings` (sem Python nem
`-shell-escape`); capítulos em português (`cap1_…`) em `capitulos/`; apêndices em
`apendices/`; `vitrine.sty` adicionado. A classe `undergrad_thesis.cls` permanece como no
template.
