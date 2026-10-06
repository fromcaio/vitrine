"use client";

// Árvore do conteúdo do painel (RF03, RF06, RF07, RF26; RN02, RN05, RN06, RN07, RN16, RN25; M10): as
// coleções e os documentos do dono, com o estado de publicação de cada nó (ícone e nome, nunca só a
// cor), recolher e expandir, publicar e despublicar, subir e descer entre os irmãos, mover para outra
// coleção, criar coleção e excluir com a contagem do que sai junto. Recebe a árvore já lida pelo Core
// e fala com `/api/contents` por fetch; não lê o banco nem a sessão. O servidor é a autoridade (RF21).
//
// Subir e descer são OTIMISTAS: a árvore troca na hora, o lote com todos os irmãos renumerados vai ao
// servidor (`PATCH /api/contents/reorder`) e, se ele recusa, a tela volta ao retrato anterior. As
// demais ações esperam a resposta. Um 404 (o nó foi excluído em outra aba) recarrega a árvore.
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
  EyeOffIcon,
  FolderIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { createCollection, deleteContent, fetchTree, moveTo, reorder, setStatus } from "./content-tree-client";
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
  slugsUnder,
  suggestSlug,
  swapWithSibling,
  validateNewCollection,
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
 * Manipuladores estáveis (a identidade não muda entre renderizações), para que `RowView` possa ser
 * memoizado: cada um chama a versão mais recente, guardada em uma ref.
 * @typedef {object} Handlers
 * @property {(id: string) => void} toggle
 * @property {(id: string, direction: -1 | 1) => unknown} reorderNode
 * @property {(node: TreeNode) => unknown} toggleStatus
 * @property {(node: TreeNode) => void} askMove
 * @property {(node: TreeNode) => void} askDelete
 * @property {(parentId: string) => void} askNew
 */

/**
 * O que `Level` precisa para desenhar a árvore.
 * @typedef {object} Shared
 * @property {string} base
 * @property {Set<string>} collapsed
 * @property {Set<string>} movable ids que têm ao menos um destino de "mover"
 * @property {boolean} atLimit a cota de conteúdos acabou
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
 * @param {Shared} props.shared
 */
function Level({ nodes, depth, hider, shared }) {
  return (
    <ul className={depth === 0 ? "flex flex-col gap-2" : "ml-2 mt-2 flex flex-col gap-2 border-l border-border-strong pl-2 sm:ml-5 sm:pl-4"}>
      {nodes.map((node, index) => {
        const collection = node.type === "COLLECTION";
        const draft = node.status === "DRAFT";
        const open = collection && node.children.length > 0 && !shared.collapsed.has(node.id);
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
              editHref={collection ? "" : editUrl(shared.hrefs.edit, node.id)}
              newHref={collection && !shared.atLimit ? newUrl(shared.hrefs.new, node.id) : ""}
              base={shared.base}
              handlers={shared.handlers}
            />
            {open ? <Level nodes={node.children} depth={depth + 1} hider={hider ?? (draft ? node : null)} shared={shared} /> : null}
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
 * @param {string} props.editHref endereço do editor (só para documentos)
 * @param {string} props.newHref endereço de novo documento aqui (só para coleções; vazio sem cota)
 * @param {string} props.base
 * @param {Handlers} props.handlers
 */
const RowView = memo(function RowView({ node, index, total, hiderName, open, canMove, atLimit, editHref, newHref, base, handlers }) {
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
                <DocumentIcon className="size-4 shrink-0" />
                <span className="sr-only lg:not-sr-only">Documento</span>
              </Link>
            )}
          </>
        ) : null}
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
 * @param {object} props
 * @param {unknown} props.initialTree `data` de `GET /api/contents` (a árvore do dono, com rascunhos); cada nó é saneado aqui
 * @param {string | ((id: string) => string)} props.editHref endereço do editor de um documento: uma função, ou um modelo com `{id}` (ex.: `/admin/conteudo/{id}`). Uma página de Servidor só consegue passar o modelo: funções não atravessam para um Componente Cliente
 * @param {string | { root: string, child: string } | ((parentId: string | null) => string)} props.newHref endereço do formulário de novo documento: uma função (`parentId` ou `null` na raiz), ou `{ root, child }` com `{parentId}` em `child` (ex.: `{ root: "/admin/conteudo/novo", child: "/admin/conteudo/novo?pai={parentId}" }`)
 * @param {number} [props.maxContents] cota de conteúdos do dono (RN25); o padrão é 500
 */
export function ContentTree({ initialTree, editHref, newHref, maxContents = DEFAULT_MAX_CONTENTS }) {
  const base = useId();
  const [tree, setTree] = useState(() => normalizeTree(initialTree));
  // Uma árvore grande começa recolhida abaixo do primeiro nível (primeira pintura leve).
  const [collapsed, setCollapsed] = useState(() => collapsedByDefault(normalizeTree(initialTree)));
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /** Ids de elementos que podem receber o foco depois da próxima mudança (o primeiro que existir e estiver habilitado). */
  const focusAfter = useRef(/** @type {string[]} */ ([]));

  // Diálogos: excluir (id), mover (id) e nova coleção (pai ou raiz).
  const [deleting, setDeleting] = useState(/** @type {string | null} */ (null));
  const [moving, setMoving] = useState(/** @type {string | null} */ (null));
  const [creating, setCreating] = useState(/** @type {{ parentId: string | null } | null} */ (null));
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
  const atLimit = total >= maxContents;
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
  }, [tree]);

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
    const result = await fetchTree();
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

  async function confirmDelete() {
    const id = deleting;
    const where = id ? locate(tree, id) : null;
    if (!id || !where || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDialogPending(true);
    setInfo("");
    setError("");
    const name = nameOf(where.node);
    const gone = 1 + countDescendants(where.node);
    const neighbour = where.siblings[where.index + 1] ?? where.siblings[where.index - 1];
    try {
      const result = await deleteContent(id);
      if (result.ok || result.kind === "not-found") {
        focusAfter.current = neighbour
          ? [domId("title", neighbour.id)]
          : [where.parent ? domId("title", where.parent.id) : `${base}-novacolecao`];
        setTree((current) => withoutNode(current, id));
        setInfo(
          result.ok
            ? gone === 1
              ? `${name} foi excluído.`
              : `${name} foi excluído, com ${plural(gone - 1, "item que estava dentro", "itens que estavam dentro")}.`
            : "",
        );
        if (!result.ok) {
          fail(result);
          await refresh();
        }
      } else {
        fail(result);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      closeDelete();
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
    latest.current = { toggle, reorderNode, toggleStatus, askMove, askDelete, askNew };
  });
  const [handlers] = useState(
    /** @returns {Handlers} */ () => ({
      toggle: (id) => latest.current?.toggle(id),
      reorderNode: (id, direction) => latest.current?.reorderNode(id, direction),
      toggleStatus: (node) => latest.current?.toggleStatus(node),
      askMove: (node) => latest.current?.askMove(node),
      askDelete: (node) => latest.current?.askDelete(node),
      askNew: (parentId) => latest.current?.askNew(parentId),
    }),
  );
  const hrefs = useMemo(() => ({ edit: editHref, new: newHref }), [editHref, newHref]);
  /** @type {Shared} */
  const shared = { base, collapsed, movable, atLimit, hrefs, handlers };

  const deletingNode = deleting ? locate(tree, deleting)?.node ?? null : null;
  const movingNode = moving ? locate(tree, moving)?.node ?? null : null;
  const movingTargets = movingNode ? moveTargets(tree, movingNode.id) : [];
  const creatingParent = creating?.parentId ? locate(tree, creating.parentId)?.node ?? null : null;
  const draftCount = total - published;
  const nearLimit = !atLimit && total >= Math.ceil(maxContents * 0.9);

  const titleId = `${base}-novo-titulo`;
  const slugId = `${base}-novo-slug`;
  const moveId = `${base}-destino`;

  return (
    <section aria-label="Conteúdo" aria-busy={busy} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <p className="text-sm text-muted">
          {plural(total, "conteúdo", "conteúdos")} de {maxContents} ({published} {published === 1 ? "publicado" : "publicados"}, {plural(draftCount, "rascunho", "rascunhos")}).
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
          <Button id={`${base}-novacolecao`} variant="outline" disabled={atLimit} onClick={() => askNew(null)}>
            <PlusIcon className="size-4 shrink-0" />
            Nova coleção
          </Button>
          {atLimit ? (
            <Button variant="outline" disabled>
              <DocumentIcon className="size-4 shrink-0" />
              Novo documento
            </Button>
          ) : (
            <Link href={newUrl(newHref, null)} className={LINK_BUTTON}>
              <DocumentIcon className="size-4 shrink-0" />
              Novo documento
            </Link>
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

      {tree.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
          Você ainda não tem conteúdo. Crie a primeira coleção ou o primeiro documento.
        </p>
      ) : (
        <nav aria-label="Árvore de conteúdo">
          <Level nodes={tree} depth={0} hider={null} shared={shared} />
        </nav>
      )}

      {deletingNode ? (
        <ConfirmDialog
          open
          danger
          title={`Excluir ${deletingNode.type === "COLLECTION" ? "a coleção" : "o documento"} "${nameOf(deletingNode)}"?`}
          confirmLabel="Excluir"
          pending={dialogPending}
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
