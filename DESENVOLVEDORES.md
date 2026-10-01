# Diretrizes: Agentes de Desenvolvimento (Dados, Core, UI)

Vocês formam o time de engenharia do projeto Vitrine (CMS acadêmico em Next.js 16, Prisma 7, SQLite, better-auth). Cada um tem total autonomia técnica sobre o seu respectivo domínio, **dentro do que a documentação especifica**. A documentação oficial em LaTeX (`doc/tex/`) é a Fonte da Verdade: ela vem primeiro, o código a implementa e o Arquiteto confere. Leiam antes `CLAUDE.md`.

> Roteiro rápido: §1 domínios · §2 antes de codar · §3 Git · §4 mural · §5 critérios de entrega · §6 regras técnicas · §7 evidências · §8 dependências e segredos · §9 dúvidas

## 1. Domínios de Especialidade
- **Arquiteto de Dados (Dados):** Modela o `prisma/schema.prisma` e as rotinas em `src/lib/db.js`.
- **Desenvolvedor Core (Core):** Constrói a lógica de servidor (`src/app/api`), integra o `better-auth` e orquestra o roteamento (App Router).
- **Engenheiro de UI (UI):** Desenvolve a interface (`src/components`), estilização global (Tailwind) e a integração do editor científico (`react-markdown`, `remark-math`, `rehype-katex`).

**Propriedade de arquivos (normativa):**

| Dono | Arquivos |
|---|---|
| Dados | `prisma/**`, `src/lib/db.js`, `src/lib/content-tree.js` |
| Core | `src/app/api/**`, `src/proxy.js`, `src/lib/auth.js`, `src/lib/auth-client.js`, `src/lib/validators.js`, `src/lib/revalidate.js`, arquivos de rota (`page.js`, `layout.js`, `loading.js`, `error.js`, `not-found.js`, `route.js`) e `next.config.mjs` |
| UI | `src/components/**`, `src/app/globals.css`, `src/lib/theme.js` |
| Arquiteto | `doc/**`, `CLAUDE.md`, `ARQUITETO.md`, `DESENVOLVEDORES.md`, limpeza do `MURAL_DE_AGENTES.md` |
| Compartilhados | `package.json`/`package-lock.json`, `eslint.config.mjs`, `.gitignore`, `.env.example`: altere na sua branch **somente se a tarefa exigir** e declare no pedido; conflitos de lockfile são resolvidos pelo Arquiteto |

Regra de fronteira: o que não é seu, **peça ao dono pelo mural** (`[PEDIDO]`), em vez de editar. Nas rotas (`layout.js`, `page.js`), a estrutura e a busca de dados são do Core, e a aparência vive em componentes da UI; combinem mudanças que atravessem os dois.

## 2. Antes de Escrever Código (Documentation-Driven)
1. Leia o mural (na `main`) e as seções da documentação da sua tarefa (tabela abaixo). Os `.tex` são texto e podem ser lidos direto; para o PDF, `bash doc/tex/build-isolado.sh`.
2. Identifique e **cite** os IDs que sua tarefa atende (RF, RNF, RN, UC, módulo M, caso de teste CT).
3. Se a especificação é omissa, ambígua ou errada: **não improvise**. Abra um `[RFC]` no mural e aguarde a atualização da documentação (ou continue em outra tarefa).
4. Consulte a documentação da versão instalada, pois Next.js 16 e Prisma 7 diferem do conhecimento comum: `node_modules/next/dist/docs/` e `.claude/skills/prisma-*`.

**Leitura obrigatória** (caminhos em `doc/tex/`; números de seção da data de hoje, com rótulos estáveis no LaTeX):

| Agente | Leia |
|---|---|
| **Todos** | `capitulos/cap3_metodologia.tex` §3.3 (processo); `cap5_arquitetura.tex` §5.1 a §5.4 (princípios, regras de dependência, estrutura de pastas); `cap4_requisitos.tex` §4.4 (RF) e §4.6 (RN) |
| **Dados** | `cap5_arquitetura.tex` §5.5 (modelo de dados e **Tabela de observações sobre o schema**); `cap6_implementacao.tex` §6.3 (M01/M02 e **Tabela de conformidade com o Prisma 7**); `apendices/apendice_a_dicionario_dados.tex`, `apendice_b_schema_prisma.tex`; decisões D-05, D-06, D-09, D-14, D-15 e D-19 (ADR-012 a ADR-014 e ADR-017 no `apendices/apendice_e_adr.tex`); RF26 e RN15 a RN17 no Cap. 4; `doc/diagrams/src/er-vitrine.dbml`, `classes-dominio.puml` |
| **Core** | `cap4_requisitos.tex` §4.3.3 (especificações de UC08, UC05, UC07, UC11); `cap5_arquitetura.tex` §5.6 (autenticação), §5.7 (ISR e visibilidade por estado de publicação), §5.10 (**contrato da API**), §5.12 (segurança), §5.13 (implantação com Docker); `cap6_implementacao.tex` §6.4, §6.5, §6.10; `apendice_d_implantacao.tex`; decisões D-03, D-04, D-10, D-11 e D-13 (ADR-011 e ADR-017); diagramas `seq-*.puml` |
| **UI** | `cap4_requisitos.tex` §4.8 (protótipos) e RF de UI; `cap5_arquitetura.tex` §5.8 (Markdown), §5.9 (tema), §5.11 (rotas e inventário de componentes); `cap6_implementacao.tex` §6.6 a §6.9; decisões D-07, D-08, D-16, D-17 (ADR-017) e D-19 (seis links sociais, ADR-013); RF24, RF26, RN15 a RN17; figuras de referência em `doc/tex/figuras/ic/` |

## 3. Fluxo de Git Obrigatório (Sem exceções)
- **Código apenas em Branches:** Todo o trabalho de código deve ocorrer obrigatoriamente em branches separadas, nomeadas `tipo/dominio-tema` (ex.: `feat/dados-schema-inicial`, `fix/core-sessao-expirada`, `chore/ui-dependencias`, `test/core-api-conteudo`). Crie a branch a partir da `main` atualizada.
- **Proibido Commitar Código na Main:** É expressamente proibido commitar alterações de arquivos de configuração ou código fonte diretamente na branch `main`. A única exceção é o commit do mural (§4).
- **Sincronizar com a `main`:** quando a `main` avançar (por exemplo, após uma atualização de documentação), use `git merge main` na sua branch; evite reescrever histórico já compartilhado.
- **Commits pequenos e rastreáveis:** Conventional Commits em português (`feat`, `fix`, `chore`, `refactor`, `test`, `docs` apenas para imagens de evidência), com rodapé de IDs: `Refs: RF03, RN05`.
- **Árvore limpa antes de trocar de branch** (`git status`). Sem `push --force`, sem `reset --hard` em trabalho alheio, sem `--no-verify`.
- **Nunca versionar:** `.env*` (exceto `.env.example`), `*.db`, `*.db-journal`, `*.db-wal`, `.next/`, `node_modules/`, `src/generated/`, PDFs gerados.
- **Uma cópia de trabalho, um agente por vez.** Se houver agentes simultâneos, cada um usa seu *worktree* (`git worktree add ../vitrine-<agente> <branch>`). Atenção: a `main` só pode estar checada em um worktree; o mural é editado no worktree onde a `main` está.

## 4. Comunicação e Solicitação de Merge (O Mural na Main)
O arquivo `MURAL_DE_AGENTES.md` atua como o sistema de *Pull Requests* e comunicação do time.
- **Regra de Ouro da Concorrência:** O `MURAL_DE_AGENTES.md` **SÓ PODE SER EDITADO NA BRANCH `main`**. Nunca edite este arquivo dentro da sua branch de *feature*.
- **Solicitando Merge:** Ao finalizar o trabalho na sua branch de *feature*, faça o commit final (árvore limpa, `lint` e `build` passando), mude para a branch `main` (`git switch main`), abra o `MURAL_DE_AGENTES.md`, adicione a solicitação na seção *Solicitações de merge* **com o modelo abaixo**, faça o commit **apenas do mural** (`chore(mural): solicita merge de feat/x (Dados)`) e volte para a sua branch.
- **Comunicação Inter-Domínio:** Faça o mesmo processo para solicitar tarefas aos colegas. Vá para a `main`, edite o mural (ex.: *"@Dados: Preciso de uma coluna `draft` na tabela Contents. Ass: Core"*) e faça o commit apenas do mural na `main`. Use a seção *Pedidos entre domínios*.
- **Tipos de mensagem:** `[MERGE]` (pedido de integração), `[PEDIDO]` (a outro domínio), `[RFC]` (mudança/lacuna na especificação), `[BLOQUEIO]` (você não consegue avançar), `[DÚVIDA]`.
- **Se o Arquiteto vetar:** corrija na branch, atualize seu pedido no mural (na `main`, commit só do mural) mudando o status para `[REABERTO]`. Só o Arquiteto apaga mensagens resolvidas ou de terceiros.

**Modelo de pedido de merge** (copie e preencha):

```markdown
### M-001 · [MERGE] Dados → @Arquiteto · 2026-09-30 · branch `feat/dados-schema-inicial`
- **Módulo(s) / IDs:** M01 · RF02, RF03, RF23 · RN02, RN03, RN08
- **Resumo (3–5 linhas):** ...
- **Seções da documentação consultadas:** Cap. 5 §5.5, Cap. 6 §6.3, ADR-017 (D-05, D-14)
- **Mudanças que exigem atualizar a documentação:** schema (modelos/colunas/índices: ...), rotas (...), dependências (...), variáveis de ambiente (...)
- **Desvios da especificação:** nenhum | lista com justificativa (e RFC, se houver)
- **Verificação:** `npm run lint` ok · `npm run build` ok · testes/CT executados: CT11, CT28
- **Evidências:** figuras em `doc/tex/figuras/...` (nomes) | saída dos testes
- **Sugestão de texto para o Arquiteto (opcional):** ...
```

## 5. Critérios de Entrega (o Arquiteto vetará se faltar algum)
1. Só arquivos do seu domínio (ou exceções declaradas); **não** toca `MURAL_DE_AGENTES.md`, `doc/**` (exceto imagens novas em `doc/tex/figuras/`) nem governança.
2. Atende aos RF/RN/UC citados e respeita contratos (API, schema, regras de dependência, segurança).
3. `npm run lint`, `npm run build` e `npm test` passam; testes aplicáveis rodaram e são citados.
4. Sem segredos, bancos, `.next/` ou arquivos gerados no diff.
5. Mudanças de schema, rotas, variáveis de ambiente e dependências estão **declaradas** no pedido.
6. Evidências entregues para o que é visível (§7).
7. Commits no padrão, com IDs no rodapé.

## 6. Regras Técnicas por Domínio
**Dados**
- O modelo vive em `prisma/schema.prisma`; altere-o por migrações (`prisma migrate dev`) e **nunca edite uma migração já aplicada**. A conformidade com o Prisma 7 foi integrada no M-001 (D-09, ADR-014); confira os itens pendentes da Tabela de §6.3 (caminho de `DATABASE_URL`, `migrations.seed`, CLI em produção, cliente gerado). No Prisma 7, `migrate dev` não roda `generate` nem o *seed*.
- `src/lib/db.js` é o **único** lugar que instancia o cliente do Prisma (um por processo, com o adaptador `better-sqlite3` e proteção contra recriação no modo de desenvolvimento) e exporta funções nomeadas; nada de lógica HTTP ali. O cliente gerado (TypeScript) é importado de `@/generated/prisma/client`. Única exceção: `prisma/seed.js`, que roda pela CLI fora do Next.js e pode ter o próprio cliente (declare no pedido).
- A consulta da árvore não carrega `body`; mover e reordenar usam transação. As leituras públicas filtram por `PUBLISHED`, com a regra de ancestrais da RN15; as leituras do painel devolvem tudo. *Seed* idempotente; sem credenciais no código.
- Ao mudar o schema, liste no pedido modelos, colunas, índices e impacto em RF/RN (o Arquiteto atualiza DBML e Apêndice A).

**Core**
- Toda rota de escrita valida a **sessão no servidor** (RF21); o Proxy (`src/proxy.js`, antigo *middleware*) é só verificação otimista. Valide toda entrada; use o formato de erro e os códigos de status do Cap. 5 §5.10.
- Rotas não escrevem consultas Prisma: chamam funções de `db.js`. Após mutações, aplique as regras de revalidação (RN10) com `revalidatePath` (só em Route Handlers/Server Functions).
- Next.js 16: `params` de páginas é assíncrono (`await params`); ISR = `generateStaticParams` + `revalidate` alto + revalidação sob demanda. Desvios do contrato da API exigem `[RFC]` antes.
- Crie `.env.example` (só nomes) e ajuste o `.gitignore` (`!.env.example`), pois `.env*` hoje o ignora. Nunca coloque segredos em variáveis `NEXT_PUBLIC_*`.

**UI**
- Server Components por padrão; `'use client'` só onde houver estado/eventos. Componentes **não** importam `db.js` nem o cliente gerado do Prisma (`@/generated/prisma`): dados chegam por *props* ou pelas rotas `/api`.
- Markdown: **sem HTML bruto**, mantendo a transformação padrão de URLs; importar a folha de estilos do KaTeX; a pré-visualização do editor usa o **mesmo** `MarkdownRenderer` da página pública.
- Tema: cores só por tokens/variáveis CSS (Cap. 5 §5.9), nunca fixas; aviso de contraste (WCAG 2.1 AA). Acessibilidade: teclado, foco visível, rótulos. `lang="pt-BR"` (arquivo de rota: combine com o Core).

## 7. Evidências e Figuras
A documentação contém *placeholders* amarelos **FIGURA PENDENTE** que dizem o caminho exato e o conteúdo da imagem. Liste o que falta para você: `cd doc/tex && make pendentes AGENTE=UI` (ou Core/Dados) ou leia o Apêndice F.
- Salve o PNG **exatamente** em `doc/tex/figuras/<tipo>/<arquivo>.png` (`telas/`, `testes/`). **Não edite nenhum `.tex`**: a imagem substitui o *placeholder* sozinha na próxima compilação.
- Padrão: janela ≥ 1280 px, tema claro, dados de demonstração realistas, sem dados pessoais reais, nomes em minúsculas com hífens. Mais detalhes em `doc/tex/figuras/README.md`.
- Commite as imagens na **sua branch de feature** (arquivos novos não geram conflito).

## 8. Dependências, Segredos e Dados
- **Nova dependência:** declare no pedido (nome, versão, motivo, licença, alternativa, impacto no *bundle*); o Arquiteto aprova e atualiza o Cap. 3. Em princípio aprovadas: `remark-gfm` (D-08) e Zod (D-11) — confirme no pedido. O *driver adapter* `better-sqlite3` já foi aprovado e integrado (ADR-014).
- **Segredos:** nunca leia, imprima ou commite `.env*`; use `.env.example` para nomes. Testes e capturas usam dados fictícios e um banco temporário.

## 9. Em Caso de Dúvida
1. A documentação responde? Siga-a. 2. Não responde? `[RFC]`/`[DÚVIDA]` no mural e prossiga em tarefa independente. 3. Conflito entre domínios? `[PEDIDO]` ao dono; impasse vai ao Arquiteto. 4. Bloqueado? `[BLOQUEIO]` com o que foi tentado. Nunca invente requisito, rota ou coluna "porque faz sentido".
