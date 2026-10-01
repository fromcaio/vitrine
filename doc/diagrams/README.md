# Diagramas do Vitrine (fontes e renderização)

Os diagramas são mantidos **como código** (PlantUML e DBML). O texto-fonte mora aqui, em
`doc/diagrams/src/`, e é a fonte da verdade visual do projeto. As imagens renderizadas
vão para `doc/tex/figuras/diagramas/`, onde o LaTeX as encontra automaticamente.

> **Quem edita os fontes:** somente o agente Arquiteto / Redator Técnico. Desenvolvedores
> (Dados, Core, UI) **propõem** mudanças no `MURAL_DE_AGENTES.md` (veja `DESENVOLVEDORES.md`).
> Os arquivos de referência históricos em `doc/ref/` (`er.dbml`, `use-case-diagram.plantuml`)
> vêm do Relatório de IC e **não são alterados**; as versões vivas estão em `src/`.

## Catálogo

O nome do arquivo de origem é **igual** ao nome do arquivo de imagem esperado pelo LaTeX
(`figuras/diagramas/<nome>.png`) e ao identificador da figura (`fig:<nome>`).

| Fonte (`src/`)                 | Tipo      | Figura LaTeX                | Onde é usada                  |
|--------------------------------|-----------|-----------------------------|-------------------------------|
| `uc-visao-geral.puml`          | Casos de uso | `fig:uc-visao-geral`     | Cap. 4 (Requisitos)           |
| `er-vitrine.dbml`              | ER (DBML) | `fig:er-vitrine`            | Cap. 5 e Apêndice A           |
| `classes-dominio.puml`         | Classes   | `fig:classes-dominio`       | Cap. 5 (Arquitetura)          |
| `arq-contexto.puml`            | C4 nível 1 | `fig:arq-contexto`         | Cap. 5                        |
| `arq-conteineres.puml`         | C4 nível 2 | `fig:arq-conteineres`      | Cap. 5                        |
| `arq-componentes.puml`         | Componentes | `fig:arq-componentes`     | Cap. 5                        |
| `arq-camadas.puml`             | Camadas   | `fig:arq-camadas`           | Cap. 5                        |
| `seq-autenticacao.puml`        | Sequência | `fig:seq-autenticacao`      | Cap. 5                        |
| `seq-leitura-isr.puml`         | Sequência | `fig:seq-leitura-isr`       | Cap. 5                        |
| `seq-publicacao-conteudo.puml` | Sequência | `fig:seq-publicacao-conteudo` | Cap. 5                      |
| `seq-personalizacao-tema.puml` | Sequência | `fig:seq-personalizacao-tema` | Cap. 5                      |
| `seq-reordenacao-arvore.puml`  | Sequência | `fig:seq-reordenacao-arvore` | Cap. 5                       |
| `nav-mapa-do-site.puml`        | Mapa mental | `fig:nav-mapa-do-site`    | Cap. 5                        |
| `impl-implantacao.puml`        | Implantação | `fig:impl-implantacao`    | Cap. 5 e Apêndice D           |
| `fluxo-ddd-agentes.puml`       | Atividade | `fig:fluxo-ddd-agentes`     | Cap. 3 (Processo)             |
| `fluxo-git-mural.puml`         | Sequência | `fig:fluxo-git-mural`       | Cap. 3                        |

## Como renderizar

### PlantUML (`*.puml`)

Pré-requisitos: **Java 17+** e o **`plantuml.jar`** (baixar do site oficial,
<https://plantuml.com/download>; o arquivo não é versionado). Diagramas de classes,
componentes, casos de uso e implantação também exigem **Graphviz** (`dot`) instalado;
sequência, atividade, Gantt e mapa mental não.

```bash
# Git Bash / Linux / macOS (defina PLANTUML_JAR uma vez)
export PLANTUML_JAR=/caminho/para/plantuml.jar
doc/diagrams/render.sh
```

```powershell
# PowerShell
$env:PLANTUML_JAR = "C:\caminho\para\plantuml.jar"
.\doc\diagrams\render.ps1
```

Os scripts rodam `java -jar plantuml.jar -charset UTF-8 -tpng` (o `-charset UTF-8` é
**obrigatório**: os fontes têm acentos e, no Windows, o padrão do Java não é UTF-8) e
gravam os PNGs em `doc/tex/figuras/diagramas/`. Para renderizar um único arquivo, passe o
nome: `render.sh seq-autenticacao`.

Alternativa sem Java: a extensão *PlantUML* do VS Code (exporte como PNG para a mesma pasta).

### DBML (`er-vitrine.dbml`)

1. Abra <https://dbdiagram.io/d>, cole o conteúdo de `src/er-vitrine.dbml`.
2. Reorganize as tabelas de forma legível (autenticação à esquerda, `contents` ao centro,
   `configurations` isolada).
3. Exporte como PNG e salve em `doc/tex/figuras/diagramas/er-vitrine.png`.

### Depois de renderizar

Compile o LaTeX (`doc/tex`, `make pdf`). Onde havia uma caixa **FIGURA PENDENTE**, a imagem
passa a aparecer sozinha — nenhuma edição de `.tex` é necessária. Confira o **Apêndice F
(Mapa de pendências)** do PDF.

## Convenções

- A primeira linha de cada `.puml` é `@startuml <nome-do-arquivo>` (ou `@startmindmap`,
  `@startgantt`), para que o PlantUML gere o PNG com o mesmo nome do arquivo.
- Cada fonte abre com um cabeçalho de comentário: título, figura LaTeX correspondente e
  regras relevantes.
- Mantenha o texto em português com acentos (UTF-8). Não use `;` dentro de rótulos de
  diagramas de atividade (`:texto;`), pois o `;` encerra o rótulo.
- O que o diagrama afirma deve coincidir com `prisma/schema.prisma` e com o código
  integrado. Divergência é bug de documentação: registre no mural.

## Estado atual

Os fontes foram escritos na fase inicial do projeto **sem acesso a um renderizador**
(PlantUML não estava instalado na máquina do Arquiteto). Portanto, a primeira renderização
pode revelar erros de sintaxe ou de layout; corrigi-los é tarefa do Arquiteto, e não deve
bloquear os desenvolvedores, pois o conteúdo dos diagramas está descrito em texto no LaTeX.
