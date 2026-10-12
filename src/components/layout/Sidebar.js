"use client";

// Sidebar hierárquica do espaço (RF12, RNF06; M17): a árvore da coleção corrente, com o item
// ativo, níveis que se recolhem e expandem e, em tela estreita, abertura e fechamento por botão
// (`aria-expanded`). Componente Cliente só pelo estado de abrir e recolher; o item ativo vem da
// prop `activePath`, e não da rota (o componente não conhece o roteador). Navegação por teclado
// nativa: cada nível tem um botão e cada item é um link, na ordem do documento.
//
// Estado derivado, sem efeitos: o nível está aberto se o leitor o abriu ou fechou à mão
// (`overrides`) ou, sem escolha dele, se está na cadeia do item ativo. O menu estreito fecha ao
// navegar porque a abertura vale só para o `activePath` em que foi pedida.
import Link from "next/link";
import { Fragment, useId, useState } from "react";
import { ChevronRightIcon, MenuIcon } from "@/components/ui/icons";
import { activeIds, contentHref, trailOf } from "./space-paths";

/** @typedef {import("@/lib/content-tree").ContentNode} ContentNode */

const ROW = "flex min-w-0 items-start gap-1";
/** Mais níveis que isto e a trilha do botão vira "primeiro › … › corrente". */
const MAX_TRAIL = 3;
const LINK = "min-w-0 flex-1 rounded-md border-l-4 px-2 py-1.5 text-sm break-words";

/**
 * @param {object} props
 * @param {ContentNode[]} props.nodes irmãos deste nível
 * @param {string[]} props.parents cadeia de slugs até o pai, a partir da raiz
 * @param {number} props.depth nível (0 = filhos diretos da coleção)
 * @param {string} props.basePath
 * @param {string[]} props.activePath
 * @param {Set<string>} props.chain ids da cadeia ativa
 * @param {Record<string, boolean>} props.overrides escolhas do leitor
 * @param {(id: string, open: boolean) => void} props.setOpen
 * @param {string} props.idBase prefixo dos ids de `aria-controls`
 */
function TreeLevel({ nodes, parents, depth, basePath, activePath, chain, overrides, setOpen, idBase }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        const slugs = [...parents, node.slug];
        const exact = slugs.length === activePath.length && slugs.every((slug, index) => slug === activePath[index]);
        const hasChildren = node.children.length > 0;
        const open = hasChildren && (overrides[node.id] ?? chain.has(node.id));
        const listId = `${idBase}-${node.id}`;
        return (
          <li key={node.id}>
            <div className={ROW} style={{ paddingInlineStart: `${Math.min(depth, 6) * 0.75}rem` }}>
              {hasChildren ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-label={`Subitens de ${node.title}`}
                  onClick={() => setOpen(node.id, !open)}
                  className="group mt-0.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-border"
                >
                  <ChevronRightIcon className="size-4 transition-transform group-aria-expanded:rotate-90" />
                </button>
              ) : (
                <span aria-hidden="true" className="size-8 shrink-0" />
              )}
              <Link
                href={contentHref(basePath, slugs)}
                aria-current={exact ? "page" : undefined}
                className={
                  exact
                    ? `${LINK} border-accent bg-primary font-medium text-on-primary`
                    : `${LINK} border-transparent hover:border-accent hover:bg-border ${chain.has(node.id) ? "font-semibold" : ""}`
                }
              >
                {node.title}
              </Link>
            </div>
            {hasChildren ? (
              <div id={listId} hidden={!open}>
                {open ? (
                  <TreeLevel
                    nodes={node.children}
                    parents={slugs}
                    depth={depth + 1}
                    basePath={basePath}
                    activePath={activePath}
                    chain={chain}
                    overrides={overrides}
                    setOpen={setOpen}
                    idBase={idBase}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * @param {object} props
 * @param {ContentNode} props.collection coleção raiz corrente, com os descendentes publicados
 * @param {string} props.basePath prefixo do espaço, sem barra final (`/maria`)
 * @param {string[]} [props.activePath] cadeia de slugs da página corrente, a partir da raiz; vazia
 *   se nenhuma página da coleção está aberta
 */
export function Sidebar({ collection, basePath, activePath = [] }) {
  const idBase = useId();
  const panelId = `${idBase}-painel`;
  const [overrides, setOverrides] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [openFor, setOpenFor] = useState(/** @type {string | null} */ (null));

  const pathKey = activePath.join("/");
  const menuOpen = openFor === pathKey;
  const chain = activeIds(collection, activePath);
  // O botão do celular diz ONDE o leitor está: a trilha da coleção até a página (com mais de 3 níveis, o primeiro,
  // reticências e o corrente inteiro; a trilha completa vai no title).
  const trail = trailOf(collection, activePath);
  const elided = trail.length > MAX_TRAIL;
  const shown = elided ? [trail[0], null, trail[trail.length - 1]] : trail;
  const setOpen = (/** @type {string} */ id, /** @type {boolean} */ open) => setOverrides((current) => ({ ...current, [id]: open }));

  return (
    <div className="border-b border-border bg-surface md:w-72 md:shrink-0 md:border-r md:border-b-0">
      <div className="p-2 md:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={() => setOpenFor(menuOpen ? null : pathKey)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-background px-3 py-2 text-left text-sm font-medium"
        >
          <MenuIcon />
          {/* O nome acessível contém o texto visível (WCAG 2.5.3): o "Menu: " é só para leitor de tela, e os
              separadores e as reticências são decorativos. */}
          <span className="min-w-0 flex-1 break-words" title={elided ? trail.join(" › ") : undefined}>
            <span className="sr-only">Menu:</span>{" "}
            {shown.map((part, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <>
                    {" "}
                    <span aria-hidden="true">›</span>{" "}
                  </>
                ) : null}
                {part === null ? <span aria-hidden="true">…</span> : part}
              </Fragment>
            ))}
          </span>
          <ChevronRightIcon className={`size-5 shrink-0 transition-transform ${menuOpen ? "rotate-90" : ""}`} />
        </button>
      </div>
      <nav id={panelId} aria-label={`Coleção ${collection.title}`} className={`${menuOpen ? "block" : "hidden"} p-3 md:sticky md:top-0 md:block md:max-h-screen md:overflow-y-auto`}>
        <p className="mb-2 px-2 text-sm font-semibold break-words">{collection.title}</p>
        <TreeLevel
          nodes={collection.children}
          parents={[collection.slug]}
          depth={0}
          basePath={basePath}
          activePath={activePath}
          chain={chain}
          overrides={overrides}
          setOpen={setOpen}
          idBase={idBase}
        />
      </nav>
    </div>
  );
}
