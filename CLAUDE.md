# Bem-vindo ao Projeto Vitrine (Monolito Next.js)

Você está operando em um ambiente simulado de múltiplos agentes autônomos. Este projeto segue as diretrizes do **Documentation-Driven Development (DDD)** e utiliza um fluxo de trabalho baseado no Git e em comunicação assíncrona. (Aqui **DDD = *Documentation*-Driven Development**: a documentação é escrita antes do código, é a Fonte da Verdade e é conferida no *merge*. Não confunda com *Domain*-Driven Design.)

## 1. Descubra sua Persona
Sempre que o usuário (Engenheiro Chefe) iniciar uma conversa, ele informará qual é o seu papel nesta sessão. Com base nisso, você deve OBRIGATORIAMENTE ler o arquivo de diretrizes correspondente antes de fazer qualquer coisa:

- Se você for convocado como **Arquiteto / Redator Técnico**: Leia o arquivo `ARQUITETO.md`.
- Se você for convocado como **Arquiteto de Dados**, **Desenvolvedor Core** ou **Engenheiro de UI**: Leia o arquivo `DESENVOLVEDORES.md`.
- Se o papel **não** foi informado, pergunte antes de tocar em qualquer arquivo.

| Papel | Sigla na documentação | Domínio (resumo) |
|---|---|---|
| Arquiteto / Redator Técnico / Merge Master | Arquiteto | `doc/**`, governança, merges, limpeza do mural |
| Arquiteto de Dados | Dados | `prisma/**`, `src/lib/db.js`, `src/lib/content-tree.js` |
| Desenvolvedor Core | Core | `src/app/api/**`, `src/proxy.js`, autenticação, validação, revalidação, arquivos de rota |
| Engenheiro de UI | UI | `src/components/**`, estilos globais, editor, tema |

O detalhamento de propriedade de arquivos está em `DESENVOLVEDORES.md` (§1).

## 2. Regras Universais do Repositório
Independentemente do seu papel, estas regras se aplicam a você:
- **Stack:** Next.js 16 (App Router), Prisma ORM 7 (SQLite local, ex.: `dev.db`), Tailwind CSS 4, `better-auth`, `react-markdown` + `remark-math` + `rehype-katex`. Linguagem: JavaScript com JSDoc (sem TypeScript).
- **GitFlow:** É expressamente proibido fazer commits de código fonte diretamente na branch `main`. Todo desenvolvimento de software deve ser feito em branches nomeadas `tipo/dominio-tema` (ex.: `feat/dados-schema-inicial`, `fix/core-sessao-expirada`).
- **Comunicação:** A coordenação entre as áreas é feita através do arquivo `MURAL_DE_AGENTES.md`. Você só tem permissão para editar este mural estando na branch `main`, em commit exclusivo do mural.
- **Documentação:** A fonte da verdade do projeto são os arquivos LaTeX na pasta `doc/tex/` (capítulos em `doc/tex/capitulos/`, apêndices em `doc/tex/apendices/`) e os diagramas como código em `doc/diagrams/src/`. Nunca invente regras de negócio que não estejam documentadas lá: se faltar algo, abra um `[RFC]` no mural.
- **Escritor único:** somente o Arquiteto edita `doc/**` e os arquivos de governança. Desenvolvedores apenas **adicionam imagens** (capturas de tela e evidências) em `doc/tex/figuras/`, nos caminhos exatos exigidos pelos *placeholders* do LaTeX.
- **Segredos:** nunca leia, imprima ou commite `.env*`, chaves ou tokens. Os nomes das variáveis ficam em `.env.example`. Não use dados reais em testes ou capturas de tela.
- **Commits:** Conventional Commits em português, com os identificadores afetados no rodapé (ex.: `feat(dados): adiciona índice (parentId, order)` + `Refs: RF03, RN05`).
- **Versões novas:** o Next.js 16 e o Prisma 7 mudaram em relação ao conhecimento comum. Antes de codificar, leia `node_modules/next/dist/docs/` (Next.js) e as *skills* em `.claude/skills/prisma-*` (Prisma). Observe, por exemplo, que `middleware` agora se chama `proxy` e que `params` das páginas é assíncrono.
- **Idioma:** documentação, commits, mural, comentários e textos de interface em português do Brasil; identificadores de código em inglês.

## 3. Comandos Úteis do Projeto
- Instalar dependências: `npm install`
- Rodar o servidor de desenvolvimento: `npm run dev`
- Verificar antes de pedir merge: `npm run lint` e `npm run build`
- Aplicar migrações do banco (apenas Arquiteto de Dados): `npx prisma migrate dev` (antes, resolva a conformidade com o Prisma 7: nome do arquivo de configuração, gerador e *driver adapter* — ver decisão D-09)
- Visualizar banco de dados: `npx prisma studio`
- Ler/compilar a documentação: os `.tex` são texto e podem ser lidos direto; para gerar o PDF use `bash doc/tex/build-isolado.sh`
- Ver o que falta documentar ou ilustrar: `cd doc/tex && make pendentes AGENTE=<Core|Dados|UI|Arquiteto>`

> ⚠ Não compile `doc/tex` ao mesmo tempo em que um editor com *auto build* (LaTeX Workshop) está ativo: as duas compilações corrompem os arquivos `.aux`. Use `build-isolado.sh`.

## 4. Onde está a Fonte da Verdade
Leia os `.tex` diretamente. Os números de seção podem mudar; os rótulos `\label{...}` (citados entre parênteses) são estáveis.

| Preciso saber… | Arquivo e seção |
|---|---|
| Requisitos (RF/RNF), regras de negócio (RN), casos de uso (UC) | `doc/tex/capitulos/cap4_requisitos.tex` (§4.3 a §4.8) |
| Arquitetura, regras de dependência, estrutura de pastas | `cap5_arquitetura.tex` §5.1 a §5.4 |
| Modelo de dados e observações sobre o schema atual | `cap5_arquitetura.tex` §5.5 (`sec:arq-dados`); `apendices/apendice_a_dicionario_dados.tex`; `doc/diagrams/src/er-vitrine.dbml` |
| Autenticação, cache/ISR, API HTTP, rotas, segurança | `cap5_arquitetura.tex` §5.6, §5.7, §5.10, §5.11, §5.12 |
| Pipeline de Markdown e tema dinâmico | `cap5_arquitetura.tex` §5.8 e §5.9 |
| O que fazer em cada módulo (M01–M14), critérios de aceite e status | `cap6_implementacao.tex` |
| Casos de teste (CT01–CT30) | `cap7_testes.tex` |
| Decisões tomadas (ADR) e em aberto (D-xx) | `apendices/apendice_e_adr.tex` e `apendices/apendice_f_decisoes_abertas.tex` |
| Implantação e operação | `apendices/apendice_d_implantacao.tex` |
| Processo DDD, papéis, fluxo Git, critérios de merge | `cap3_metodologia.tex` §3.6, `ARQUITETO.md`, `DESENVOLVEDORES.md` |
| Pendências (figuras, trechos de código, textos) | `apendices/apendice_g_pendencias.tex` (gerado) |
| Como usar a documentação e os diagramas | `doc/tex/README.md`, `doc/diagrams/README.md` |

Material histórico, **somente leitura**, em `doc/ref/` (relatório de IC, `er.dbml`, `use-case-diagram.plantuml`).

## 5. Estado do Repositório (registro de 2026-09-30)
Existem o *scaffold* do Next.js 16, o `prisma/schema.prisma` inicial (6 modelos), a governança e a documentação. **Ainda não existem:** migrações, `src/lib/*`, rotas de API, autenticação, componentes e `.env.example`. Divergências já identificadas estão no Cap. 5 §5.5.4, no Cap. 6 §6.3 e nos avisos iniciais do mural. O repositório não possui remoto Git configurado.
