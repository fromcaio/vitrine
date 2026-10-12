"use client";

// Árvore do conteúdo do painel (RF03, RF06, RF07, RF26; RN02, RN05, RN06, RN07, RN16, RN25; M10): as
// coleções e os documentos do dono, com o estado de publicação de cada nó (ícone e nome, nunca só a
// cor), recolher e expandir, publicar e despublicar, subir e descer entre os irmãos, mover para outra
// coleção, criar coleção, renomear coleção (título e endereço, P-028) e excluir com a contagem do que sai junto. Recebe a árvore já lida pelo Core
// e fala com `/api/contents` por fetch; não lê o banco nem a sessão. O servidor é a autoridade (RF21).
//
// Subir e descer são OTIMISTAS: a árvore troca na hora, o lote com todos os irmãos renumerados vai ao
// servidor (`PATCH /api/contents/reorder`) e, se ele recusa, a tela volta ao retrato anterior. As
// demais ações esperam a resposta. Um 404 (o nó foi excluído em outra aba) recarrega a árvore.
//
// Modo de MODERAÇÃO (`moderation`; RF34, UC15): a árvore de OUTRO usuário, lida pelo administrador. A
// estrutura é só leitura (nada de reordenar, mover, criar nem publicar: o servidor responde 403); as
// ações por nó são abrir (o editor de moderação), despublicar e excluir, as duas últimas pelo
// `ModerationDialog`, que pede o motivo e avisa que o dono o verá. É o mesmo componente, o mesmo modelo
// puro e o mesmo cliente: só muda o que é oferecido.
//
// Página inicial e "Ver página pública" (M26, RF42 a RF44, RN36 a RN38): a primeira linha, FIXA, é a "Página inicial"
// (`homeRow`): não se ordena nem se move e não conta nos limites. Na árvore do próprio usuário leva a "Editar"; na de
// moderação, "Despublicar" e "Excluir", pelo `ModerationDialog` (motivo obrigatório). O botão "Ver página pública" abre
// em nova aba a URL pública (`publicBasePath` e a cadeia de slugs) de cada item publicado cujos ancestrais estão todos
// publicados e da página inicial; sem `publicBasePath` (`null`: o espaço não está no ar), nenhum botão.
//
// Desempenho (500 conteúdos, RN25): cada linha é um componente memoizado (`RowView`) que só recebe
// valores simples e manipuladores estáveis, então uma ação renderiza as linhas que mudaram, e não as
// 500; e uma árvore com mais de 120 nós abre só os dois primeiros níveis (o resto, sob demanda).
//
// Os botões ficam habilitados durante um envio (o foco não se perde): uma trava interna ignora o
// segundo clique. Títulos e slugs são TEXTO PURO (nós de texto do React, sempre escapados). Só tokens
// de tema.
import Link from "next/link";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, describedBy } from "@/components/ui/Field";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  DocumentIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  FolderIcon,
  HomeIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { contentHref } from "@/components/layout/space-paths";
import { siteRelative } from "@/components/ui/site-path";
import {
  MESSAGES,
  createCollection,
  deleteContent,
  deleteWithReason,
  fetchTree,
  moveTo,
  removeHome,
  renameContent,
  reorder,
  setStatus,
  unpublishHome,
  unpublishWithReason,
} from "./content-tree-client";
import { ModerationDialog } from "./ModerationDialog";
import {
  SLUG_MAX_LENGTH,
  collapsedByDefault,
  countDescendants,
  countNodes,
  countPublishedDescendants,
  editUrl,
  expandableIds,
  locate,
  movableIds,
  moveTargets,
  newUrl,
  normalizeTree,
  reconcile,
  siblingSlugs,
  slugChain,
  slugsUnder,
  suggestSlug,
  swapWithSibling,
  validateNewCollection,
  withRenamed,
  withStatus,
  withoutNode,
} from "./content-tree-model";

/** @typedef {import("./content-tree-model").TreeNode} TreeNode */

/** Cota padrão de conteúdos por usuário (RN25); o Core passa a vigente. */
const DEFAULT_MAX_CONTENTS = 500;

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";

const LINK_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-strong bg-background px-4 py-2 text-sm font-medium text-foreground transition-[background-color,border-color] hover:border-foreground hover:bg-surface";

/** @param {number} count @param {string} one @param {string} many */
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** @param {TreeNode} node */
const nameOf = (node) => (node.title === "" ? "(sem título)" : node.title);

/**
 * Botão de ação de uma linha: ícone e texto (o texto só some visualmente em telas estreitas, e o nome
 * acessível sempre começa pelo texto visível e cita o nó).
 * @param {object} props
 * @param {(props: { className?: string }) => import("react").ReactElement} props.icon
 * @param {string} props.label texto visível
 * @param {string} props.name nome acessível completo
 * @param {() => void} props.onClick
 * @param {string} props.id
 * @param {boolean} [props.disabled]
 */
function RowAction({ icon: IconComponent, label, name, onClick, id, disabled = false }) {
  return (
    <Button id={id} variant="outline" onClick={onClick} disabled={disabled} aria-label={name} title={label} className="px-2.5 lg:px-3">
      <IconComponent className="size-4 shrink-0" />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Button>
  );
}

/**
 * O botão "Ver página pública" (RF44, RN38): um link para o SITE, em nova aba. O nome acessível cita o item.
 * @param {object} props
 * @param {string} props.href caminho público do item
 * @param {string} props.name título do item
 * @param {string} [props.id]
 */
function ViewLink({ href, name, id }) {
  return (
    <a
      id={id}
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={`Ver página pública: ${name}`}
      title="Ver página pública (abre em uma nova aba)"
      className={`${LINK_BUTTON} px-2.5 lg:px-3`}
    >
      <ExternalLinkIcon className="size-4 shrink-0" />
      <span className="sr-only lg:not-sr-only">Ver</span>
    </a>
  );
}

/**
 * Manipuladores estáveis (a identidade não muda entre renderizações), para que `RowView` possa ser
 * memoizado: cada um chama a versão mais recente, guardada em uma ref.
 * @typedef {object} Handlers
 * @property {(id: string) => void} toggle
 * @property {(id: string, direction: -1 | 1) => unknown} reorderNode
 * @property {(node: TreeNode) => unknown} toggleStatus
 * @property {(node: TreeNode) => void} askMove
 * @property {(node: TreeNode) => void} askDelete
 * @property {(node: TreeNode) => void} askUnpublish
 * @property {(parentId: string) => void} askNew
 * @property {(node: TreeNode) => void} askRename
 */

/**
 * O que `Level` precisa para desenhar a árvore.
 * @typedef {object} Shared
 * @property {string} base
 * @property {Set<string>} collapsed
 * @property {Set<string>} movable ids que têm ao menos um destino de "mover"
 * @property {boolean} atLimit a cota de conteúdos acabou
 * @property {boolean} moderated a árvore é de outro usuário: só abrir, despublicar e excluir
 * @property {string | null} publicBase prefixo público do espaço (`/maria`), ou `null`: sem botão "Ver página pública"
 * @property {{ edit: Parameters<typeof editUrl>[0], new: Parameters<typeof newUrl>[0] }} hrefs
 * @property {Handlers} handlers
 */

/**
 * Um nível da árvore: a linha de cada nó (memoizada) e, se estiver aberto, o nível dos filhos.
 * Esta função é leve e roda de novo a cada mudança; o que custa é a linha, e ela só é refeita se os
 * seus valores mudaram.
 * @param {object} props
 * @param {TreeNode[]} props.nodes irmãos de um nível
 * @param {number} props.depth
 * @param {TreeNode | null} props.hider o ancestral em rascunho que esconde este nível
 * @param {string[]} props.slugs a cadeia de slugs dos ancestrais (da raiz até o pai deste nível)
 * @param {Shared} props.shared
 */
function Level({ nodes, depth, hider, slugs, shared }) {
  return (
    <ul className={depth === 0 ? "flex flex-col gap-2" : "ml-2 mt-2 flex flex-col gap-2 border-l border-border-strong pl-2 sm:ml-5 sm:pl-4"}>
      {nodes.map((node, index) => {
        const collection = node.type === "COLLECTION";
        const draft = node.status === "DRAFT";
        const open = collection && node.children.length > 0 && !shared.collapsed.has(node.id);
        // RN38: o botão só existe para o item publicado cujos ancestrais estão todos publicados (RN15).
        const viewHref = shared.publicBase !== null && !draft && !hider ? contentHref(shared.publicBase, [...slugs, node.slug]) : "";
        return (
          <li key={node.id} data-node-id={node.id} data-type={node.type} data-status={node.status}>
            <RowView
              node={node}
              index={index}
              total={nodes.length}
              hiderName={!draft && hider ? nameOf(hider) : null}
              open={open}
              canMove={shared.movable.has(node.id)}
              atLimit={shared.atLimit}
              moderated={shared.moderated}
              viewHref={viewHref}
              editHref={collection ? "" : editUrl(shared.hrefs.edit, node.id)}
              newHref={collection && !shared.atLimit ? newUrl(shared.hrefs.new, node.id) : ""}
              base={shared.base}
              handlers={shared.handlers}
            />
            {open ? <Level nodes={node.children} depth={depth + 1} hider={hider ?? (draft ? node : null)} slugs={[...slugs, node.slug]} shared={shared} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A linha de um nó. Memoizada: recebe só valores simples (texto, número, booleano) e o nó, que a
 * árvore imutável mantém o mesmo objeto enquanto o nó não muda.
 * @param {object} props
 * @param {TreeNode} props.node
 * @param {number} props.index
 * @param {number} props.total
 * @param {string | null} props.hiderName nome do ancestral em rascunho que esconde este nó publicado
 * @param {boolean} props.open os filhos estão à mostra
 * @param {boolean} props.canMove há um destino para "mover"
 * @param {boolean} props.atLimit a cota acabou (sem criar)
 * @param {boolean} props.moderated moderação: só abrir, despublicar e excluir
 * @param {string} props.viewHref caminho público do item para o botão "Ver página pública" (vazio: sem botão)
 * @param {string} props.editHref endereço do editor (só para documentos)
 * @param {string} props.newHref endereço de novo documento aqui (só para coleções; vazio sem cota)
 * @param {string} props.base
 * @param {Handlers} props.handlers
 */
const RowView = memo(function RowView({ node, index, total, hiderName, open, canMove, atLimit, moderated, viewHref, editHref, newHref, base, handlers }) {
  const collection = node.type === "COLLECTION";
  const draft = node.status === "DRAFT";
  const expandable = collection && node.children.length > 0;
  const name = nameOf(node);
  const titleId = `${base}-title-${node.id}`;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border p-2 ${draft ? "border-foreground bg-surface" : "border-border"}`}>
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-2">
        {expandable ? (
          <button
            id={`${base}-toggle-${node.id}`}
            type="button"
            aria-expanded={open}
            aria-label={`Subitens de ${name}`}
            onClick={() => handlers.toggle(node.id)}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent hover:border-foreground hover:bg-surface"
          >
            <ChevronRightIcon className={`size-5 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span aria-hidden="true" className="size-10 shrink-0" />
        )}
        <div className="flex min-w-0 flex-col justify-center gap-1 self-center">
          <span className="flex min-w-0 items-start gap-2">
            {collection ? <FolderIcon className="mt-0.5 size-5 shrink-0" /> : <DocumentIcon className="mt-0.5 size-5 shrink-0" />}
            <span className="sr-only">{collection ? "Coleção: " : "Documento: "}</span>
            {collection ? (
              <span id={titleId} tabIndex={-1} className="font-semibold wrap-anywhere">
                {name}
              </span>
            ) : (
              <Link id={titleId} href={editHref} className="font-semibold wrap-anywhere underline underline-offset-2">
                {name}
              </Link>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-muted break-all">/{node.slug}</span>
            <span
              data-testid="status"
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${draft ? "border-foreground bg-foreground text-background" : "border-border-strong bg-background text-foreground"}`}
            >
              {draft ? <PencilIcon className="size-3.5 shrink-0" /> : <CheckCircleIcon className="size-3.5 shrink-0" />}
              {draft ? "Rascunho" : "Publicado"}
            </span>
            {hiderName ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-foreground px-2 py-0.5 font-semibold">
                <EyeOffIcon className="size-3.5 shrink-0" />
                Oculto pelo pai
                <span className="sr-only"> ({hiderName} está em rascunho)</span>
              </span>
            ) : null}
            {collection ? <span className="text-muted">{plural(node.children.length, "item", "itens")}</span> : null}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Ações de ${name}`}>
        {viewHref === "" ? null : <ViewLink id={`${base}-view-${node.id}`} href={viewHref} name={name} />}
        {moderated ? (
          <>
            {editHref === "" ? null : (
              <Link href={editHref} aria-label={`Abrir para moderar: ${name}`} title="Abrir" className={`${LINK_BUTTON} px-2.5 lg:px-3`}>
                <DocumentIcon className="size-4 shrink-0" />
                <span className="sr-only lg:not-sr-only">Abrir</span>
              </Link>
            )}
            {draft ? (
              <span className="text-xs text-muted">Já é rascunho</span>
            ) : (
              <RowAction
                id={`${base}-status-${node.id}`}
                icon={PencilIcon}
                label="Despublicar"
                name={`Despublicar: ${name}`}
                onClick={() => handlers.askUnpublish(node)}
              />
            )}
          </>
        ) : (
          <>
          <RowAction
            id={`${base}-up-${node.id}`}
            icon={ArrowUpIcon}
            label="Subir"
            name={`Subir: ${name} (posição ${index + 1} de ${total})`}
            disabled={index === 0}
            onClick={() => handlers.reorderNode(node.id, -1)}
          />
          <RowAction
            id={`${base}-down-${node.id}`}
            icon={ArrowDownIcon}
            label="Descer"
            name={`Descer: ${name} (posição ${index + 1} de ${total})`}
            disabled={index === total - 1}
            onClick={() => handlers.reorderNode(node.id, 1)}
          />
          <RowAction
            id={`${base}-status-${node.id}`}
            icon={draft ? CheckCircleIcon : PencilIcon}
            label={draft ? "Publicar" : "Despublicar"}
            name={`${draft ? "Publicar" : "Passar para rascunho"}: ${name}`}
            onClick={() => handlers.toggleStatus(node)}
          />
          <RowAction
            id={`${base}-move-${node.id}`}
            icon={MoveIcon}
            label="Mover"
            name={`Mover para outra coleção: ${name}`}
            disabled={!canMove}
            onClick={() => handlers.askMove(node)}
          />
          {collection ? (
            <>
              <RowAction
                id={`${base}-rename-${node.id}`}
                icon={PencilIcon}
                label="Renomear"
                name={`Renomear: ${name}`}
                onClick={() => handlers.askRename(node)}
              />
              <RowAction
                id={`${base}-sub-${node.id}`}
                icon={PlusIcon}
                label="Subcoleção"
                name={`Nova subcoleção em: ${name}`}
                disabled={atLimit}
                onClick={() => handlers.askNew(node.id)}
              />
              {atLimit || newHref === "" ? null : (
                <Link
                  href={newHref}
                  aria-label={`Novo documento em: ${name}`}
                  title="Documento"
                  className={`${LINK_BUTTON} px-2.5 lg:px-3`}
                >
                  <PlusIcon className="size-4 shrink-0" />
                  <span className="sr-only lg:not-sr-only">Documento</span>
                </Link>
              )}
            </>
          ) : null}
          </>
        )}
        <RowAction
          id={`${base}-delete-${node.id}`}
          icon={TrashIcon}
          label="Excluir"
          name={`Excluir: ${name}`}
          onClick={() => handlers.askDelete(node)}
        />
      </div>
    </div>
  );
});

/**
 * O estado da página inicial na árvore: o estado de publicação e se há texto (RN36, RN37).
 * @typedef {{ status: "PUBLISHED" | "DRAFT", hasBody: boolean }} HomeState
 */

/**
 * Saneia a `homeRow` recebida (o dado pode vir malformado de um Servidor).
 * @param {unknown} raw
 * @returns {HomeState | null}
 */
function normalizeHome(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { status, hasBody } = /** @type {Record<string, unknown>} */ (raw);
  return { status: status === "DRAFT" ? "DRAFT" : "PUBLISHED", hasBody: hasBody === true };
}

/**
 * A primeira linha da árvore, FIXA: a "Página inicial" do espaço (RF42, RF43). Não se ordena nem se move. No modo
 * comum, o link "Editar"; na moderação, "Despublicar" (só com texto publicado) e "Excluir" (só com texto). Tem o
 * botão "Ver página pública" se o espaço está no ar.
 * @param {object} props
 * @param {HomeState} props.home
 * @param {string} props.base
 * @param {boolean} props.moderated
 * @param {string} props.editHref endereço do editor da página inicial (modo comum)
 * @param {string} props.viewHref caminho público do espaço (vazio: sem botão)
 * @param {() => void} props.onUnpublish
 * @param {() => void} props.onRemove
 */
function HomeRowView({ home, base, moderated, editHref, viewHref, onUnpublish, onRemove }) {
  const draft = home.hasBody && home.status === "DRAFT";
  const name = "Página inicial";
  let stateLabel = "Sem texto";
  if (home.hasBody) stateLabel = draft ? "Rascunho" : "Publicado";
  let hint = "A página pública mostra a descrição do espaço.";
  if (home.hasBody && !draft) hint = "O texto aparece na página do espaço.";
  return (
    <div
      data-testid="home-row"
      className={`flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border p-2 ${draft ? "border-foreground bg-surface" : "border-border"}`}
    >
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-2">
        <span aria-hidden="true" className="size-10 shrink-0" />
        <div className="flex min-w-0 flex-col justify-center gap-1 self-center">
          <span className="flex min-w-0 items-start gap-2">
            <HomeIcon className="mt-0.5 size-5 shrink-0" />
            {moderated || editHref === "" ? (
              <span id={`${base}-home-title`} tabIndex={-1} className="font-semibold wrap-anywhere">
                {name}
              </span>
            ) : (
              <Link id={`${base}-home-title`} href={editHref} className="font-semibold wrap-anywhere underline underline-offset-2">
                {name}
              </Link>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              data-testid="home-status"
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${draft ? "border-foreground bg-foreground text-background" : "border-border-strong bg-background text-foreground"}`}
            >
              {home.hasBody ? draft ? <PencilIcon className="size-3.5 shrink-0" /> : <CheckCircleIcon className="size-3.5 shrink-0" /> : null}
              {stateLabel}
            </span>
            <span className="text-muted">{hint}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Ações de ${name}`}>
        {viewHref === "" ? null : <ViewLink id={`${base}-view-home`} href={viewHref} name={name} />}
        {moderated ? (
          <>
            {home.hasBody && home.status === "PUBLISHED" ? (
              <RowAction id={`${base}-home-unpublish`} icon={PencilIcon} label="Despublicar" name={`Despublicar: ${name}`} onClick={onUnpublish} />
            ) : home.hasBody ? (
              <span className="text-xs text-muted">Já é rascunho</span>
            ) : null}
            {home.hasBody ? <RowAction id={`${base}-home-remove`} icon={TrashIcon} label="Excluir" name={`Excluir: ${name}`} onClick={onRemove} /> : null}
          </>
        ) : editHref === "" ? null : (
          <Link href={editHref} aria-label={`Editar: ${name}`} title="Editar" className={`${LINK_BUTTON} px-2.5 lg:px-3`}>
            <PencilIcon className="size-4 shrink-0" />
            <span className="sr-only lg:not-sr-only">Editar</span>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {unknown} props.initialTree `data` de `GET /api/contents` (a árvore do dono, com rascunhos); cada nó é saneado aqui
 * @param {string | ((id: string) => string)} props.editHref endereço do editor de um documento: uma função, ou um modelo com `{id}` (ex.: `/admin/conteudo/{id}`). Uma página de Servidor só consegue passar o modelo: funções não atravessam para um Componente Cliente
 * @param {string | { root: string, child: string } | ((parentId: string | null) => string)} props.newHref endereço do formulário de novo documento: uma função (`parentId` ou `null` na raiz), ou `{ root, child }` com `{parentId}` em `child` (ex.: `{ root: "/admin/conteudo/novo", child: "/admin/conteudo/novo?pai={parentId}" }`)
 * @param {number} [props.maxContents] cota de conteúdos do dono (RN25); o padrão é 500 (não vale na moderação)
 * @param {{ ownerId: string, ownerName: string }} [props.moderation] liga o modo de moderação: a árvore é de OUTRO usuário (`ownerId`, o de `?ownerId=`); `ownerName` é o nome que o aviso e o diálogo citam
 * @param {{ status: "PUBLISHED" | "DRAFT", hasBody: boolean } | null} [props.homeRow] a linha FIXA "Página inicial" no topo (M26): `null` (padrão) = sem a linha; senão, o estado de publicação e se há texto. Não conta nos limites
 * @param {string} [props.homeEditHref] endereço do editor da página inicial, para o "Editar" da linha na árvore do próprio usuário (padrão `/admin/pagina-inicial`); na moderação não há edição
 * @param {string | null} [props.publicBasePath] prefixo público do espaço ("/maria"), que o Core monta (handle ativo do dono); `null` (padrão) = sem botão "Ver página pública" em lugar nenhum. O botão leva a `contentHref(publicBasePath, slugs)` de cada item publicado com todos os ancestrais publicados, e a `publicBasePath` na linha da página inicial
 */
export function ContentTree({
  initialTree,
  editHref,
  newHref,
  maxContents = DEFAULT_MAX_CONTENTS,
  moderation = undefined,
  homeRow = null,
  homeEditHref = "/admin/pagina-inicial",
  publicBasePath = null,
}) {
  const base = useId();
  const [tree, setTree] = useState(() => normalizeTree(initialTree));
  // Uma árvore grande começa recolhida abaixo do primeiro nível (primeira pintura leve).
  const [collapsed, setCollapsed] = useState(() => collapsedByDefault(normalizeTree(initialTree)));
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // A página inicial: o estado que a tela mostra (muda com a moderação) e a ação à espera do motivo. Se o servidor manda
  // outro estado (a página foi recarregada), vale o dele.
  const [home, setHome] = useState(() => normalizeHome(homeRow));
  const [homeAsking, setHomeAsking] = useState(/** @type {"unpublish" | "remove" | null} */ (null));
  const homeKey = homeRow ? `${homeRow.status}:${homeRow.hasBody}` : "";
  const [seenHomeKey, setSeenHomeKey] = useState(homeKey);
  if (seenHomeKey !== homeKey) {
    setSeenHomeKey(homeKey);
    setHome(normalizeHome(homeRow));
  }
  const publicBase = siteRelative(publicBasePath);
  /** Ids de elementos que podem receber o foco depois da próxima mudança (o primeiro que existir e estiver habilitado). */
  const focusAfter = useRef(/** @type {string[]} */ ([]));

  // Diálogos: excluir (id), mover (id) e nova coleção (pai ou raiz).
  const [deleting, setDeleting] = useState(/** @type {string | null} */ (null));
  const [unpublishing, setUnpublishing] = useState(/** @type {string | null} */ (null));
  const [moving, setMoving] = useState(/** @type {string | null} */ (null));
  const [creating, setCreating] = useState(/** @type {{ parentId: string | null } | null} */ (null));
  const [renaming, setRenaming] = useState(/** @type {string | null} */ (null));
  const [renTitle, setRenTitle] = useState("");
  const [renSlug, setRenSlug] = useState("");
  const [renSlugTouched, setRenSlugTouched] = useState(false);
  const [renErrors, setRenErrors] = useState(/** @type {{ title?: string, slug?: string }} */ ({}));
  const renTitleRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const renSlugRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [moveValue, setMoveValue] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newErrors, setNewErrors] = useState(/** @type {{ title?: string, slug?: string }} */ ({}));
  const titleFieldRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const slugFieldRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const total = useMemo(() => countNodes(tree), [tree]);
  // Na moderação não há cota a mostrar nem criação: a cota é do dono.
  const atLimit = moderation === undefined && total >= maxContents;
  const published = useMemo(() => {
    let count = 0;
    /** @param {TreeNode[]} nodes */
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.status === "PUBLISHED") count += 1;
        walk(node.children);
      }
    };
    walk(tree);
    return count;
  }, [tree]);
  const expandable = useMemo(() => expandableIds(tree), [tree]);
  const movable = useMemo(() => movableIds(tree), [tree]);

  // Devolve o foco depois de uma mudança (reordenar, excluir, mover, criar): o elemento de antes
  // pode ter sumido ou ficado desabilitado (o primeiro da pilha não sobe mais).
  useEffect(() => {
    const candidates = focusAfter.current;
    if (candidates.length === 0) return;
    focusAfter.current = [];
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (element && !(element instanceof HTMLButtonElement && element.disabled)) {
        element.focus();
        return;
      }
    }
  }, [tree, home]);

  /** @param {string} kind @param {string} id */
  const domId = (kind, id) => `${base}-${kind}-${id}`;

  /** Começa uma ação: ignora o clique se outra está em andamento. @param {() => Promise<void>} work */
  async function act(work) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setInfo("");
    setError("");
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** @param {{ message: string }} failure */
  function fail(failure) {
    setInfo("");
    setError(failure.message);
  }

  /** Recarrega a árvore do servidor. @returns {Promise<TreeNode[] | null>} */
  async function refresh() {
    const result = await fetchTree(undefined, moderation?.ownerId);
    if (!result.ok) {
      fail(result);
      return null;
    }
    setTree((current) => reconcile(current, result.tree));
    return result.tree;
  }

  /** @param {string} id */
  function toggle(id) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Garante que uma coleção esteja aberta (para mostrar o que acabou de entrar nela). @param {string | null} id */
  function reveal(id) {
    if (id === null) return;
    setCollapsed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  /** @param {string} id @param {-1 | 1} direction */
  function reorderNode(id, direction) {
    return act(async () => {
      const swap = swapWithSibling(tree, id, direction);
      const where = locate(tree, id);
      if (!swap || !where) return;
      const snapshot = tree;
      const name = nameOf(where.node);
      // O foco fica no botão usado; se ele ficar desabilitado (chegou à ponta), vai ao do outro sentido.
      const used = direction === -1 ? "up" : "down";
      focusAfter.current = [domId(used, id), domId(direction === -1 ? "down" : "up", id), domId("title", id)];
      setTree(swap.roots);
      const result = await reorder(swap.items);
      if (result.ok) {
        setTree((current) => (result.tree.length > 0 ? reconcile(current, result.tree) : current));
        setInfo(`${name} agora está na posição ${swap.position} de ${swap.total}.`);
      } else {
        focusAfter.current = [domId(used, id), domId("title", id)];
        setTree(snapshot);
        fail({ message: `${result.message} A ordem voltou ao que era.` });
        if (result.kind === "not-found" || result.kind === "invalid-parent") await refresh();
      }
    });
  }

  /** @param {TreeNode} node */
  function toggleStatus(node) {
    return act(async () => {
      const next = node.status === "DRAFT" ? "PUBLISHED" : "DRAFT";
      const name = nameOf(node);
      focusAfter.current = [domId("status", node.id)];
      const result = await setStatus(node.id, next);
      if (!result.ok) {
        fail(result);
        if (result.kind === "not-found") await refresh();
        return;
      }
      setTree((current) => withStatus(current, node.id, next));
      if (next === "PUBLISHED") {
        setInfo(`${name} foi publicado.`);
      } else {
        const hidden = countPublishedDescendants(node);
        setInfo(
          hidden > 0
            ? `${name} passou para rascunho. ${plural(hidden, "conteúdo publicado dentro dela deixa de aparecer", "conteúdos publicados dentro dela deixam de aparecer")}; o estado de cada um não mudou.`
            : `${name} passou para rascunho.`,
        );
      }
    });
  }

  /** @param {TreeNode} node */
  function askDelete(node) {
    setDialogError("");
    setDeleting(node.id);
  }

  function closeDelete() {
    setDeleting(null);
    setDialogPending(false);
    setDialogError("");
  }

  /**
   * Exclui o nó escolhido. Na moderação leva o motivo e, se o servidor recusa, devolve a mensagem para
   * o diálogo, que continua aberto com o motivo digitado.
   * @param {string} [reason]
   * @returns {Promise<string | null>}
   */
  async function confirmDelete(reason) {
    const id = deleting;
    const where = id ? locate(tree, id) : null;
    if (!id || !where || busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setDialogPending(true);
    setInfo("");
    setError("");
    const name = nameOf(where.node);
    const gone = 1 + countDescendants(where.node);
    const neighbour = where.siblings[where.index + 1] ?? where.siblings[where.index - 1];
    /** @type {string | null} */
    let message = null;
    try {
      const result = moderation && reason !== undefined ? await deleteWithReason(id, reason) : await deleteContent(id);
      if (result.ok || result.kind === "not-found") {
        focusAfter.current = neighbour
          ? [domId("title", neighbour.id)]
          : [where.parent ? domId("title", where.parent.id) : `${base}-novacolecao`];
        setTree((current) => withoutNode(current, id));
        const notified = moderation ? ` ${moderation.ownerName} foi notificado(a) e vê o motivo.` : "";
        setInfo(
          result.ok
            ? gone === 1
              ? `${name} foi excluído.${notified}`
              : `${name} foi excluído, com ${plural(gone - 1, "item que estava dentro", "itens que estavam dentro")}.${notified}`
            : "",
        );
        if (!result.ok) {
          fail(result);
          await refresh();
        }
        closeDelete();
      } else if (moderation) {
        message = result.message;
      } else {
        fail(result);
        closeDelete();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setDialogPending(false);
    }
    return message;
  }

  /** @param {TreeNode} node */
  function askUnpublish(node) {
    setUnpublishing(node.id);
  }

  /**
   * Moderação: despublica o nó escolhido com o motivo. Devolve a mensagem de erro (o diálogo segue
   * aberto) ou `null` se deu certo.
   * @param {string} reason
   * @returns {Promise<string | null>}
   */
  async function confirmUnpublish(reason) {
    const id = unpublishing;
    const where = id ? locate(tree, id) : null;
    if (!id || !where || !moderation || busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setInfo("");
    setError("");
    const name = nameOf(where.node);
    try {
      const result = await unpublishWithReason(id, reason);
      if (result.ok) {
        setTree((current) => withStatus(current, id, "DRAFT"));
        focusAfter.current = [domId("status", id), domId("title", id)];
        setUnpublishing(null);
        setInfo(`${name} passou para rascunho. ${moderation.ownerName} foi notificado(a) e vê o motivo.`);
        return null;
      }
      if (result.kind === "not-found") {
        setUnpublishing(null);
        fail(result);
        await refresh();
        return null;
      }
      return result.message;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /**
   * Moderação da página inicial: despublica (`unpublish`) ou apaga o texto (`remove`) com o motivo. Devolve a mensagem
   * de erro (o diálogo segue aberto) ou `null` se deu certo. Depois do sucesso a linha reflete o novo estado.
   * @param {string} reason
   * @returns {Promise<string | null>}
   */
  async function confirmHome(reason) {
    const action = homeAsking;
    if (!action || !moderation || !home || busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setInfo("");
    setError("");
    try {
      const result = action === "unpublish" ? await unpublishHome(moderation.ownerId, reason) : await removeHome(moderation.ownerId, reason);
      if (result.ok) {
        setHome(action === "unpublish" ? { status: "DRAFT", hasBody: home.hasBody } : { status: home.status, hasBody: false });
        focusAfter.current = [`${base}-home-title`];
        setHomeAsking(null);
        setInfo(
          action === "unpublish"
            ? `A página inicial passou para rascunho. ${moderation.ownerName} foi notificado(a) e vê o motivo.`
            : `O texto da página inicial foi excluído. ${moderation.ownerName} foi notificado(a) e vê o motivo.`,
        );
        return null;
      }
      if (result.kind === "not-found") {
        setHomeAsking(null);
        fail(result);
        return null;
      }
      return result.message;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** @param {TreeNode} node */
  function askMove(node) {
    const targets = moveTargets(tree, node.id);
    setDialogError("");
    setMoveValue(targets[0]?.value ?? "");
    setMoving(node.id);
  }

  function closeMove() {
    setMoving(null);
    setDialogPending(false);
    setDialogError("");
  }

  async function confirmMove() {
    const id = moving;
    const where = id ? locate(tree, id) : null;
    if (!id || !where || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDialogPending(true);
    setInfo("");
    setError("");
    const name = nameOf(where.node);
    const destination = moveValue === "" ? null : moveValue;
    const destinationName = destination === null ? "a raiz do espaço" : nameOf(locate(tree, destination)?.node ?? where.node);
    try {
      const result = await moveTo(id, destination);
      if (result.ok) {
        reveal(destination);
        focusAfter.current = [domId("title", id)];
        const fresh = await refresh();
        if (fresh) setInfo(`${name} foi movido para ${destinationName}, no fim da lista.`);
      } else {
        fail(result);
        if (result.kind === "not-found" || result.kind === "invalid-parent") await refresh();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      closeMove();
    }
  }

  /** @param {TreeNode} node */
  function askRename(node) {
    // O endereço acompanha o título enquanto nunca foi editado à mão: o slug atual é o que a sugestão geraria
    // do título atual. Se foi editado, fica como está até o usuário mudá-lo.
    const siblings = siblingSlugs(tree, node.id);
    setDialogError("");
    setRenTitle(node.title);
    setRenSlug(node.slug);
    setRenSlugTouched(node.slug !== suggestSlug(node.title, siblings));
    setRenErrors({});
    setRenaming(node.id);
  }

  function closeRename() {
    setRenaming(null);
    setDialogPending(false);
    setDialogError("");
  }

  /** @param {string} value */
  function changeRenameTitle(value) {
    setRenTitle(value);
    if (!renSlugTouched && renaming) setRenSlug(suggestSlug(value, siblingSlugs(tree, renaming)));
  }

  async function confirmRename() {
    const id = renaming;
    const where = id ? locate(tree, id) : null;
    if (!id || !where || busyRef.current) return;
    const found = validateNewCollection({ title: renTitle, slug: renSlug });
    setDialogError("");
    if (found.title || found.slug) {
      setRenErrors(found);
      return void (found.title ? renTitleRef.current : renSlugRef.current)?.focus();
    }
    const siblings = siblingSlugs(tree, id);
    const titleChanged = renTitle.trim() !== where.node.title;
    const slugChanged = renSlug !== where.node.slug;
    if (!titleChanged && !slugChanged) return void closeRename(); // nada mudou: nenhuma requisição
    if (slugChanged && siblings.includes(renSlug)) {
      const suggestion = suggestSlug(renTitle, [...siblings, renSlug]);
      setRenErrors({ slug: `${MESSAGES.slugConflict}${suggestion ? ` Sugerimos "${suggestion}"; confira e confirme de novo.` : ""}` });
      return void renSlugRef.current?.focus();
    }
    setRenErrors({});
    busyRef.current = true;
    setBusy(true);
    setDialogPending(true);
    setInfo("");
    setError("");
    const title = renTitle.trim();
    let keepOpen = false;
    try {
      const result = await renameContent(id, { ...(titleChanged ? { title } : {}), ...(slugChanged ? { slug: renSlug } : {}) });
      if (result.ok) {
        focusAfter.current = [domId("rename", id), domId("title", id)];
        setTree((current) => withRenamed(current, id, { title, slug: renSlug }));
        const kind = where.parent ? "Subcoleção" : "Coleção";
        setInfo(
          `${kind} renomeada para ${title}.${slugChanged ? ` O endereço agora termina em /${renSlug}; os links antigos deixaram de funcionar.` : ""}`,
        );
      } else if (result.kind === "slug-conflict") {
        keepOpen = true;
        const suggestion = result.suggestion ?? suggestSlug(renTitle, [...siblings, renSlug]);
        setRenSlugTouched(true);
        setRenSlug(suggestion);
        setRenErrors({ slug: `${result.message} Sugerimos "${suggestion}"; confira e confirme de novo.` });
        renSlugRef.current?.focus();
      } else if (result.kind === "not-found") {
        // O nó foi excluído em outra aba: fecha o diálogo, avisa e recarrega a árvore.
        fail(result);
        await refresh();
      } else {
        keepOpen = true;
        setDialogError(result.message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setDialogPending(false);
      if (!keepOpen) closeRename();
    }
  }

  /** @param {string | null} parentId */
  function askNew(parentId) {
    setDialogError("");
    setNewTitle("");
    setNewSlug("");
    setSlugTouched(false);
    setNewErrors({});
    setCreating({ parentId });
  }

  function closeNew() {
    setCreating(null);
    setDialogPending(false);
    setDialogError("");
  }

  /** @param {string} value */
  function changeNewTitle(value) {
    setNewTitle(value);
    if (!slugTouched && creating) setNewSlug(suggestSlug(value, slugsUnder(tree, creating.parentId)));
  }

  async function confirmNew() {
    if (!creating || busyRef.current) return;
    const found = validateNewCollection({ title: newTitle, slug: newSlug });
    setNewErrors(found);
    setDialogError("");
    if (found.title) return void titleFieldRef.current?.focus();
    if (found.slug) return void slugFieldRef.current?.focus();
    busyRef.current = true;
    setBusy(true);
    setDialogPending(true);
    setInfo("");
    setError("");
    let keepOpen = false;
    try {
      const result = await createCollection({ title: newTitle, slug: newSlug, parentId: creating.parentId });
      if (result.ok) {
        reveal(creating.parentId);
        if (result.id) focusAfter.current = [domId("title", result.id)];
        const fresh = await refresh();
        if (fresh) setInfo(`A coleção ${newTitle.trim()} foi criada.`);
      } else if (result.kind === "slug-conflict") {
        keepOpen = true;
        const suggestion = result.suggestion ?? suggestSlug(newTitle, [...slugsUnder(tree, creating.parentId), newSlug]);
        setSlugTouched(true);
        setNewSlug(suggestion);
        setNewErrors({ slug: `${result.message} Sugerimos "${suggestion}"; confira e confirme de novo.` });
        slugFieldRef.current?.focus();
      } else if (result.kind === "quota") {
        keepOpen = true;
        setDialogError(result.message);
      } else {
        keepOpen = true;
        setDialogError(result.message);
        if (result.kind === "invalid-parent" || result.kind === "not-found") await refresh();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setDialogPending(false);
      if (!keepOpen) closeNew();
    }
  }

  // Manipuladores estáveis: chamam sempre a versão mais recente (as funções acima são refeitas a
  // cada renderização, e `RowView` só pode ser memoizado se os manipuladores não mudarem).
  const latest = useRef(/** @type {Handlers | null} */ (null));
  useEffect(() => {
    latest.current = { toggle, reorderNode, toggleStatus, askMove, askDelete, askUnpublish, askNew, askRename };
  });
  const [handlers] = useState(
    /** @returns {Handlers} */ () => ({
      toggle: (id) => latest.current?.toggle(id),
      reorderNode: (id, direction) => latest.current?.reorderNode(id, direction),
      toggleStatus: (node) => latest.current?.toggleStatus(node),
      askMove: (node) => latest.current?.askMove(node),
      askDelete: (node) => latest.current?.askDelete(node),
      askUnpublish: (node) => latest.current?.askUnpublish(node),
      askNew: (parentId) => latest.current?.askNew(parentId),
      askRename: (node) => latest.current?.askRename(node),
    }),
  );
  const hrefs = useMemo(() => ({ edit: editHref, new: newHref }), [editHref, newHref]);
  /** @type {Shared} */
  const shared = { base, collapsed, movable, atLimit, moderated: moderation !== undefined, publicBase, hrefs, handlers };

  const deletingNode = deleting ? locate(tree, deleting)?.node ?? null : null;
  const movingNode = moving ? locate(tree, moving)?.node ?? null : null;
  const movingTargets = movingNode ? moveTargets(tree, movingNode.id) : [];
  const renamingNode = renaming ? (locate(tree, renaming)?.node ?? null) : null;
  const creatingParent = creating?.parentId ? locate(tree, creating.parentId)?.node ?? null : null;
  const draftCount = total - published;
  const nearLimit = moderation === undefined && !atLimit && total >= Math.ceil(maxContents * 0.9);
  const unpublishingNode = unpublishing ? (locate(tree, unpublishing)?.node ?? null) : null;

  const titleId = `${base}-novo-titulo`;
  const slugId = `${base}-novo-slug`;
  const moveId = `${base}-destino`;
  const renTitleId = `${base}-renomear-titulo`;
  const renSlugId = `${base}-renomear-slug`;
  const renNoticeId = `${base}-renomear-aviso`;
  // O aviso do que muda no endereço (a UI não conhece o handle: mostra só a cadeia de slugs até a coleção).
  const renChain = renamingNode ? slugChain(tree, renamingNode.id) : [];
  const renAddress = (/** @type {string} */ last) => `…/${[...renChain.slice(0, -1), last].join("/")}`;

  return (
    <section aria-label={moderation ? `Conteúdo de ${moderation.ownerName}` : "Conteúdo"} aria-busy={busy} className="flex flex-col gap-4">
      {moderation ? (
        <div role="note" className="flex items-start gap-2 rounded-md border-2 border-foreground bg-surface p-3 text-sm">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <p className="wrap-anywhere">
            Você está vendo o conteúdo de <strong className="font-semibold">{moderation.ownerName}</strong>. A estrutura é só leitura: você pode abrir, despublicar e
            excluir, sempre informando um motivo, que a pessoa vê na notificação. Mover, reordenar e publicar são dela.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <p className="text-sm text-muted">
          {plural(total, "conteúdo", "conteúdos")}
          {moderation ? "" : ` de ${maxContents}`} ({published} {published === 1 ? "publicado" : "publicados"}, {plural(draftCount, "rascunho", "rascunhos")}).
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {expandable.length > 0 ? (
            <>
              <Button variant="outline" onClick={() => setCollapsed(new Set())}>
                Expandir tudo
              </Button>
              <Button variant="outline" onClick={() => setCollapsed(new Set(expandable))}>
                Recolher tudo
              </Button>
            </>
          ) : null}
          {moderation ? null : (
            <>
            <Button id={`${base}-novacolecao`} variant="outline" disabled={atLimit} onClick={() => askNew(null)}>
              <PlusIcon className="size-4 shrink-0" />
              Nova coleção
            </Button>
            {atLimit ? (
              <Button variant="outline" disabled>
                <PlusIcon className="size-4 shrink-0" />
                Novo documento
              </Button>
            ) : (
              <Link href={newUrl(newHref, null)} className={LINK_BUTTON}>
                <PlusIcon className="size-4 shrink-0" />
                Novo documento
              </Link>
            )}
            </>
          )}
        </div>
      </div>

      {atLimit ? (
        <p className="flex items-start gap-2 rounded-md border-2 border-foreground bg-surface px-3 py-2 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>Você atingiu o limite de {maxContents} conteúdos. Exclua algum para criar outro.</span>
        </p>
      ) : nearLimit ? (
        <p className="flex items-start gap-2 rounded-md border border-border-strong px-3 py-2 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>Faltam {plural(maxContents - total, "conteúdo", "conteúdos")} para o limite de {maxContents}.</span>
        </p>
      ) : null}

      <div role="alert" className="empty:hidden">
        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}
              {error.startsWith("Sua sessão expirou") ? (
                <>
                  {" "}
                  <Link href="/login" className="font-medium underline underline-offset-2">
                    Ir para o login
                  </Link>
                  .
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>
      <div role="status" className="empty:hidden">
        {info ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="wrap-anywhere">{info}</span>
          </p>
        ) : null}
      </div>

      {home ? (
        <ul aria-label="Página inicial" className="flex flex-col gap-2">
          <li>
            <HomeRowView
              home={home}
              base={base}
              moderated={moderation !== undefined}
              editHref={homeEditHref}
              viewHref={publicBase === null ? "" : publicBase.replace(/\/+$/, "") || "/"}
              onUnpublish={() => setHomeAsking("unpublish")}
              onRemove={() => setHomeAsking("remove")}
            />
          </li>
        </ul>
      ) : null}

      {tree.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
          Você ainda não tem conteúdo. Crie a primeira coleção ou o primeiro documento.
        </p>
      ) : (
        <nav aria-label="Árvore de conteúdo">
          <Level nodes={tree} depth={0} hider={null} slugs={[]} shared={shared} />
        </nav>
      )}

      {homeAsking && moderation && home ? (
        <ModerationDialog
          open
          danger={homeAsking === "remove"}
          title={homeAsking === "remove" ? "Excluir o texto da página inicial?" : "Despublicar a página inicial?"}
          confirmLabel={homeAsking === "remove" ? "Excluir" : "Despublicar"}
          ownerName={moderation.ownerName}
          onConfirm={confirmHome}
          onCancel={() => setHomeAsking(null)}
          description={
            homeAsking === "remove"
              ? "O texto da página inicial é apagado e não pode ser recuperado. A página do espaço volta a mostrar a descrição."
              : "O texto passa para rascunho e sai do ar: a página do espaço volta a mostrar a descrição. Ninguém o apaga: a pessoa pode publicá-lo de novo."
          }
        />
      ) : null}

      {deletingNode ? (
        moderation ? (
          <ModerationDialog
            open
            danger
            title={`Excluir ${deletingNode.type === "COLLECTION" ? "a coleção" : "o documento"} "${nameOf(deletingNode)}"?`}
            confirmLabel="Excluir"
            ownerName={moderation.ownerName}
            onConfirm={confirmDelete}
            onCancel={closeDelete}
            description={
              countDescendants(deletingNode) > 0 ? (
                <>
                  <strong>
                    {plural(countDescendants(deletingNode), "item que está dentro será excluído", "itens que estão dentro serão excluídos")} junto
                  </strong>{" "}
                  (coleções, documentos e rascunhos). Esta ação não pode ser desfeita.
                </>
              ) : (
                "Esta ação não pode ser desfeita."
              )
            }
          />
        ) : (
          <ConfirmDialog
            open
            danger
            title={`Excluir ${deletingNode.type === "COLLECTION" ? "a coleção" : "o documento"} "${nameOf(deletingNode)}"?`}
            confirmLabel="Excluir"
            pending={dialogPending}
            onConfirm={() => void confirmDelete()}
            onCancel={closeDelete}
            description={
              countDescendants(deletingNode) > 0 ? (
                <>
                  <strong>
                    {plural(countDescendants(deletingNode), "item que está dentro será excluído", "itens que estão dentro serão excluídos")} junto
                  </strong>{" "}
                  (coleções, documentos e rascunhos). Esta ação não pode ser desfeita.
                </>
              ) : (
                "Esta ação não pode ser desfeita."
              )
            }
          />
        )
      ) : null}

      {unpublishingNode && moderation ? (
        <ModerationDialog
          open
          title={`Despublicar ${unpublishingNode.type === "COLLECTION" ? "a coleção" : "o documento"} "${nameOf(unpublishingNode)}"?`}
          confirmLabel="Despublicar"
          ownerName={moderation.ownerName}
          onConfirm={confirmUnpublish}
          onCancel={() => setUnpublishing(null)}
          description={
            unpublishingNode.type === "COLLECTION" && countPublishedDescendants(unpublishingNode) > 0
              ? `A coleção passa para rascunho e sai do ar, e ${plural(countPublishedDescendants(unpublishingNode), "conteúdo publicado dentro dela deixa de aparecer", "conteúdos publicados dentro dela deixam de aparecer")}; o estado de cada um não muda.`
              : "O conteúdo passa para rascunho e sai do ar. Ninguém o apaga: a pessoa pode publicá-lo de novo."
          }
        />
      ) : null}

      {movingNode ? (
        <ConfirmDialog
          open
          initialFocus="field"
          title={`Mover "${nameOf(movingNode)}"`}
          confirmLabel="Mover"
          pending={dialogPending}
          onConfirm={confirmMove}
          onCancel={closeMove}
          description="O conteúdo vai para o fim da lista do destino. Só as suas coleções aparecem, e nunca o próprio conteúdo nem o que está dentro dele."
        >
          <Field id={moveId} label="Mover para">
            <select
              id={moveId}
              value={moveValue}
              disabled={dialogPending}
              onChange={(event) => setMoveValue(event.target.value)}
              className={INPUT}
            >
              {movingTargets.map((target) => (
                <option key={target.value === "" ? "raiz" : target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
          </Field>
          <div role="alert" className="empty:hidden">
            {dialogError ? <p className="text-sm font-medium text-danger">{dialogError}</p> : null}
          </div>
        </ConfirmDialog>
      ) : null}

      {renamingNode ? (
        <ConfirmDialog
          open
          initialFocus="field"
          title={`Renomear "${nameOf(renamingNode)}"`}
          confirmLabel="Salvar"
          pending={dialogPending}
          onConfirm={confirmRename}
          onCancel={closeRename}
          description={renamingNode.parentId ? "O título e o endereço desta subcoleção." : "O título e o endereço desta coleção."}
        >
          <Field id={renTitleId} label="Título" error={renErrors.title}>
            <input
              ref={renTitleRef}
              id={renTitleId}
              value={renTitle}
              maxLength={200}
              readOnly={dialogPending}
              aria-invalid={renErrors.title ? "true" : undefined}
              aria-describedby={describedBy(renTitleId, { error: renErrors.title })}
              onChange={(event) => changeRenameTitle(event.target.value)}
              className={INPUT}
            />
          </Field>
          <Field id={renSlugId} label="Slug (o final do endereço)" error={renErrors.slug}>
            <input
              ref={renSlugRef}
              id={renSlugId}
              value={renSlug}
              maxLength={SLUG_MAX_LENGTH + 20}
              readOnly={dialogPending}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={renErrors.slug ? "true" : undefined}
              aria-describedby={[renNoticeId, renErrors.slug ? `${renSlugId}-error` : null].filter(Boolean).join(" ")}
              onChange={(event) => {
                setRenSlugTouched(true);
                setRenSlug(event.target.value);
              }}
              className={INPUT}
            />
          </Field>
          {renSlug === renamingNode.slug ? (
            <p id={renNoticeId} data-testid="aviso-endereco" className="text-sm text-muted">
              O endereço não muda ({renAddress(renamingNode.slug)}): os links continuam valendo.
            </p>
          ) : (
            <p id={renNoticeId} data-testid="aviso-endereco" className="flex items-start gap-2 rounded-md border border-foreground px-3 py-2 text-sm">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <span className="wrap-anywhere">
                O endereço muda de <code className="break-all">{renAddress(renamingNode.slug)}</code> para <code className="break-all">{renAddress(renSlug)}</code>. Os links antigos desta{" "}
                {renamingNode.parentId ? "subcoleção" : "coleção"} e de todos os seus documentos deixam de funcionar.
              </span>
            </p>
          )}
          <div role="alert" className="empty:hidden">
            {dialogError ? <p className="text-sm font-medium text-danger">{dialogError}</p> : null}
          </div>
        </ConfirmDialog>
      ) : null}

      {creating ? (
        <ConfirmDialog
          open
          initialFocus="field"
          title="Nova coleção"
          confirmLabel="Criar coleção"
          pending={dialogPending}
          onConfirm={confirmNew}
          onCancel={closeNew}
          description={creatingParent ? <>Dentro de <strong>{nameOf(creatingParent)}</strong>, no fim da lista.</> : "Na raiz do seu espaço, no fim da lista."}
        >
          <Field id={titleId} label="Título" error={newErrors.title}>
            <input
              ref={titleFieldRef}
              id={titleId}
              value={newTitle}
              maxLength={200}
              readOnly={dialogPending}
              aria-invalid={newErrors.title ? "true" : undefined}
              aria-describedby={describedBy(titleId, { error: newErrors.title })}
              onChange={(event) => changeNewTitle(event.target.value)}
              className={INPUT}
            />
          </Field>
          <Field
            id={slugId}
            label="Slug (o final do endereço)"
            hint="Letras minúsculas, dígitos e hífens; é sugerido a partir do título."
            error={newErrors.slug}
          >
            <input
              ref={slugFieldRef}
              id={slugId}
              value={newSlug}
              maxLength={SLUG_MAX_LENGTH + 20}
              readOnly={dialogPending}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={newErrors.slug ? "true" : undefined}
              aria-describedby={describedBy(slugId, { hint: true, error: newErrors.slug })}
              onChange={(event) => {
                setSlugTouched(true);
                setNewSlug(event.target.value);
              }}
              className={INPUT}
            />
          </Field>
          <div role="alert" className="empty:hidden">
            {dialogError ? <p className="text-sm font-medium text-danger">{dialogError}</p> : null}
          </div>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
