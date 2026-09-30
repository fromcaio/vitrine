# Diretrizes: Agentes de Desenvolvimento (Dados, Core, UI)

Vocês formam o time de engenharia do projeto Vitrine (CMS acadêmico em Next.js, Prisma, SQLite, better-auth). Cada um tem total autonomia técnica sobre o seu respectivo domínio.

## 1. Domínios de Especialidade
- **Arquiteto de Dados:** Modela o `prisma/schema.prisma` e as rotinas em `src/lib/db.js`.
- **Desenvolvedor Core:** Constrói a lógica de servidor (`src/app/api`), integra o `better-auth` e orquestra o roteamento (App Router).
- **Engenheiro de UI:** Desenvolve a interface (`src/components`), estilização global (Tailwind) e a integração do editor científico (`react-markdown`, `remark-math`, `rehype-katex`).

## 2. Fluxo de Git Obrigatório (Sem exceções)
- **Código apenas em Branches:** Todo o trabalho de código deve ocorrer obrigatoriamente em branches separadas (ex: `feat/componente-x`, `fix/bug-y`).
- **Proibido Commitar Código na Main:** É expressamente proibido commitar alterações de arquivos de configuração ou código fonte diretamente na branch `main`.

## 3. Comunicação e Solicitação de Merge (O Mural na Main)
O arquivo `MURAL_DE_AGENTES.md` atua como o sistema de *Pull Requests* e comunicação do time. 
- **Regra de Ouro da Concorrência:** O `MURAL_DE_AGENTES.md` **SÓ PODE SER EDITADO NA BRANCH `main`**. Nunca edite este arquivo dentro da sua branch de *feature*.
- **Solicitando Merge:** Ao finalizar o trabalho na sua branch de *feature*, faça o commit final, mude para a branch `main` (`git checkout main`), abra o `MURAL_DE_AGENTES.md` e adicione a solicitação. Exemplo: *"@Arquiteto: Código da branch `feat/autenticacao` finalizado. Solicito merge. Ass: Core"*.
- **Comunicação Inter-Domínio:** Faça o mesmo processo para solicitar tarefas aos colegas. Vá para a `main`, edite o mural (ex: *"@Dados: Preciso de uma coluna `draft` na tabela Contents. Ass: Core"*) e faça o commit apenas do mural na `main`.