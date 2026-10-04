// Regras de revalidação sob demanda do cache ISR, POR ESPAÇO (RN10, RN16; Cap. 5 §5.7.2, Tabela de
// eventos; ADR-030). Chamado SOMENTE pelos Route Handlers, depois que a escrita no banco foi
// confirmada: src/lib/db.js não revalida, e `revalidatePath` não funciona em Componentes Cliente nem
// no Proxy.
//
// Só o caminho LITERAL de página invalida de fato (medido no Next.js 16.3.7, CT44):
// `revalidatePath("/a", "layout")` não invalida nada em um segmento dinâmico, e
// `revalidatePath("/[handle]", "layout")` e `revalidatePath("/", "layout")` invalidam TODOS os
// espaços. Por isso este módulo nunca usa o tipo "layout": os caminhos públicos do dono são
// calculados antes e depois de cada escrita (`getPublicPaths`, do Dados; ver
// `src/app/api/_lib/revalidation.js`) e invalidados um a um.

import { revalidatePath } from "next/cache";

/**
 * Campos cuja mudança altera a árvore de navegação ou o conjunto de páginas públicas. O tipo não
 * consta da RN10, mas trocar DOCUMENT por COLLECTION muda a navegação; é tratado como estrutural.
 */
export const STRUCTURAL_FIELDS = /** @type {const} */ (["title", "slug", "parentId", "order", "status", "type"]);

/**
 * Retrato do espaço público de um dono: o `handle` e os caminhos públicos (cadeias de slugs, sem o
 * handle) de um nó e dos descendentes, ou de todo o espaço. Sem `handle`, o espaço não tem URL e não
 * há o que revalidar.
 * @typedef {{ handle: string | null, paths: string[][] }} SpaceSnapshot
 */

/**
 * Houve mudança estrutural entre dois estados de um conteúdo (RN10, RN16)?
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 */
export function hasStructuralChange(before, after) {
  return STRUCTURAL_FIELDS.some((field) => before[field] !== after[field]);
}

/**
 * A mudança altera o diretório do portal (RN28: espaços ativos com ao menos uma RAIZ publicada)?
 * Só importa a raiz: criada, excluída, publicada, despublicada ou movida de ou para a raiz.
 * @param {{ parentId: string | null, status: string } | null} before estado anterior; `null` se criada
 * @param {{ parentId: string | null, status: string } | null} after estado novo; `null` se excluída
 */
export function affectsDirectory(before, after) {
  const isRoot = (/** @type {{ parentId: string | null } | null} */ node) => node !== null && node.parentId === null;
  if (!isRoot(before) && !isRoot(after)) return false;
  if (before === null || after === null) return true;
  return before.status !== after.status || before.parentId !== after.parentId;
}

/**
 * URL pública literal (RN04): `/{handle}` ou `/{handle}/{slug}/{slug}…`.
 * @param {string} handle
 * @param {string[]} [slugs]
 */
export function spaceUrl(handle, slugs = []) {
  return `/${[handle, ...slugs].join("/")}`;
}

/**
 * Páginas literais a invalidar para um ou mais retratos: a página inicial de cada espaço (a árvore de
 * navegação mudou), os caminhos de cada retrato e os das coleções ANCESTRAIS desses caminhos, sem
 * repetição. Os ancestrais entram porque a coleção redireciona ao primeiro documento publicado
 * (RN14): criar, despublicar, mover ou excluir esse documento muda a página da coleção. A Tabela de
 * eventos (Cap. 5 §5.7.2) não os cita; o acréscimo é do Core, e a pendência é do Arquiteto.
 * @param {...SpaceSnapshot} snapshots
 * @returns {string[]}
 */
export function snapshotUrls(...snapshots) {
  const urls = new Set();
  for (const { handle, paths } of snapshots) {
    if (!handle) continue;
    urls.add(spaceUrl(handle));
    for (const slugs of paths) {
      for (let depth = 1; depth <= slugs.length; depth++) urls.add(spaceUrl(handle, slugs.slice(0, depth)));
    }
  }
  return [...urls];
}

/**
 * Marca as páginas para revalidação. Uma falha aqui não pode desfazer nem mascarar a escrita já
 * confirmada no banco (RNF10): é registrada, e o `revalidate` das páginas é a rede de segurança.
 * @param {string[]} urls caminhos literais de página
 * @returns {string[]} os caminhos pedidos
 */
export function revalidateUrls(urls) {
  for (const url of urls) {
    try {
      revalidatePath(url);
    } catch (error) {
      console.error(`[revalidate] falha ao revalidar ${url}`, error);
    }
  }
  return urls;
}

/**
 * Invalida os espaços descritos pelos retratos (ver `snapshotUrls`).
 * @param {...SpaceSnapshot} snapshots
 * @returns {string[]}
 */
export function revalidateSnapshots(...snapshots) {
  return revalidateUrls(snapshotUrls(...snapshots));
}

/**
 * Invalida só a página do portal `/` (`revalidatePath("/", "page")`, nunca o layout): a configuração
 * do site e as mudanças de espaço que alteram o diretório (RN28).
 */
export function revalidatePortal() {
  try {
    revalidatePath("/", "page");
  } catch (error) {
    console.error("[revalidate] falha ao revalidar /", error);
  }
}

/** Configuração do site (nome, logotipo, cores, links, texto do portal, diretório): só o portal. */
export function revalidateConfiguration() {
  revalidatePortal();
}
