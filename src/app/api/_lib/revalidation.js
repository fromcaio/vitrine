// Revalidação por espaço nas rotas (RN10, ADR-030; Cap. 5 §5.7.2): junta as consultas de dados
// (`getPublicPaths`, do Dados) às regras de `src/lib/revalidate.js`. O fluxo de toda escrita é o
// mesmo: `captureSpace` ANTES (os caminhos que existem agora), a escrita, e uma das funções
// `revalidate*` DEPOIS (que captura os caminhos novos e invalida a união). Renomear ou mover deixa em
// cache o HTML antigo, por isso os caminhos de antes também contam.
//
// Evento estrutural = ESPAÇO INTEIRO do dono (A-014 3a, item 1; ADR-030): a `sidebar` de cada página
// lista a árvore inteira e a coleção redireciona ao primeiro documento publicado (RN14), então toda
// página do espaço muda. Só o corpo invalida só a página do documento.
//
// Nada aqui pode falhar a requisição: a escrita já foi confirmada (RNF10). Uma consulta que falha é
// registrada e vira um retrato vazio; o `revalidate` das páginas (3600 s) é a rede de segurança.
import { findUserById } from "@/lib/auth";
import { getEffectiveAppearance, getPublicPaths, listPublicSpaces } from "@/lib/db";
import {
  revalidatePortal,
  revalidateSnapshots,
  revalidateUrls,
  spaceUrl,
} from "@/lib/revalidate";

/** @typedef {import("@/lib/revalidate").SpaceSnapshot} SpaceSnapshot */

/** @type {SpaceSnapshot} */
const EMPTY = Object.freeze({ handle: null, paths: Object.freeze([]) });

/**
 * Retrato do espaço público do dono: o handle atual e os caminhos públicos do nó e dos descendentes
 * (`nodeId`) ou de todo o espaço (sem `nodeId`). Sem handle, não há URL e a consulta é dispensada.
 * @param {string} ownerId
 * @param {string | null} [nodeId]
 * @returns {Promise<SpaceSnapshot>}
 */
export async function captureSpace(ownerId, nodeId = null) {
  try {
    const owner = await findUserById(ownerId);
    const handle = owner?.handle ?? null;
    if (!handle) return EMPTY;
    return { handle, paths: await getPublicPaths(ownerId, nodeId) };
  } catch (error) {
    console.error(`[revalidate] falha ao calcular os caminhos públicos de ${ownerId}`, error);
    return EMPTY;
  }
}

/**
 * Evento estrutural (criar, excluir, renomear, mover, reordenar, mudar o estado ou o tipo): a página
 * inicial do espaço e os caminhos públicos ANTIGOS e NOVOS de TODO o espaço do dono (`before` é o
 * retrato de `captureSpace(ownerId)`, sem nó, tirado antes da escrita). `directory` acrescenta o
 * portal (RN28).
 * @param {{ ownerId: string, before?: SpaceSnapshot, directory?: boolean }} event
 * @returns {Promise<string[]>} as páginas invalidadas
 */
export async function revalidateStructure({ ownerId, before = EMPTY, directory = false }) {
  const after = await captureSpace(ownerId);
  const urls = revalidateSnapshots(before, after);
  if (directory) revalidatePortal();
  return urls;
}

/**
 * Só o corpo mudou (estado e estrutura inalterados): apenas a página do documento, e só se ela é
 * pública (RN15). O nó é sempre o primeiro caminho do retrato.
 * @param {{ ownerId: string, nodeId: string }} event
 * @returns {Promise<string[]>}
 */
export async function revalidateBody({ ownerId, nodeId }) {
  const { handle, paths } = await captureSpace(ownerId, nodeId);
  if (!handle || paths.length === 0) return [];
  return revalidateUrls([spaceUrl(handle, paths[0])]);
}

/**
 * Espaço inteiro (aparência, handle e suspensão): a página inicial e todos os caminhos públicos do
 * dono, a união dos retratos de antes (quando há, como o handle antigo) e o de agora. `directory`
 * acrescenta o portal, para o que o diretório exibe (handle, suspensão, nome).
 * @param {{ ownerId: string, before?: SpaceSnapshot[], directory?: boolean }} event
 * @returns {Promise<string[]>}
 */
export async function revalidateWholeSpace({ ownerId, before = [], directory = false }) {
  const after = await captureSpace(ownerId);
  const urls = revalidateSnapshots(...before, after);
  if (directory) revalidatePortal();
  return urls;
}

/**
 * Só a página inicial do espaço do dono (`/{handle}`; ADR-040, CT74): salvar, despublicar ou excluir o texto
 * da página inicial, ou ligar e desligar a lista de itens, não muda nenhuma outra página (a barra lateral e
 * os documentos não mostram o texto). Sem `handle`, o espaço não tem URL e não há o que revalidar. Não falha
 * a requisição (a escrita já foi confirmada, RNF10).
 * @param {string} ownerId
 * @returns {Promise<string[]>} a página invalidada (vazia se o dono não tem handle)
 */
export async function revalidateSpaceHome(ownerId) {
  try {
    const owner = await findUserById(ownerId);
    return owner?.handle ? revalidateUrls([spaceUrl(owner.handle)]) : [];
  } catch (error) {
    console.error(`[revalidate] falha ao revalidar a página inicial de ${ownerId}`, error);
    return [];
  }
}

/**
 * Unidades de herança do sistema (ADR-038): o que um espaço herda quando o dono não definiu o próprio.
 * Os nomes são os de `inherits` em `getEffectiveAppearance`.
 * @typedef {"lightPalette" | "darkPalette" | "siteName" | "logo" | "favicon"} InheritedUnit
 */

const LIGHT_COLORS = ["primaryColor", "secondaryColor", "accentColor"];
const DARK_COLORS = ["darkPrimaryColor", "darkSecondaryColor", "darkAccentColor"];

/**
 * O que mudou entre duas versões da configuração do sistema e chega aos espaços (ADR-038, item 6):
 * as unidades que o espaço herda (a paleta de cada modo e o nome) e `everySpace`, para o que todo
 * espaço mostra, herde ou não (o par de ícones do botão de modo, que é só do sistema).
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @returns {{ units: InheritedUnit[], everySpace: boolean }}
 */
export function changedSystemUnits(before, after) {
  const differs = (/** @type {string[]} */ fields) => fields.some((field) => before[field] !== after[field]);
  /** @type {InheritedUnit[]} */
  const units = [];
  if (differs(LIGHT_COLORS)) units.push("lightPalette");
  if (differs(DARK_COLORS)) units.push("darkPalette");
  if (differs(["siteName"])) units.push("siteName");
  return { units, everySpace: differs(["modeIconPair"]) };
}

/**
 * O sistema mudou uma unidade que os espaços herdam (ADR-038, item 6): revalida, por caminhos
 * literais (ADR-030), o espaço inteiro de cada usuário ATIVO que herda ao menos uma das `units`
 * (`inherits` de `getEffectiveAppearance`), ou de todos com `everySpace`. Um espaço sem raiz publicada não
 * entra (`listPublicSpaces`, RN28): a página dele só existe no cache se alguém a visitou, e o
 * `revalidate` de 3600 s a põe em dia. Não falha a requisição (a escrita já foi confirmada, RNF10).
 * @param {{ units?: InheritedUnit[], everySpace?: boolean }} change
 * @returns {Promise<{ spaces: number, urls: number }>} quantos espaços e páginas foram invalidados
 */
export async function revalidateInheritingSpaces({ units = [], everySpace = false } = {}) {
  const result = { spaces: 0, urls: 0 };
  if (units.length === 0 && !everySpace) return result;
  try {
    for (const { id } of await listPublicSpaces()) {
      if (!everySpace) {
        const effective = await getEffectiveAppearance(id);
        if (!effective || !units.some((unit) => effective.inherits[unit])) continue;
      }
      result.urls += (await revalidateWholeSpace({ ownerId: id })).length;
      result.spaces += 1;
    }
  } catch (error) {
    console.error("[revalidate] falha ao revalidar os espaços que herdam o sistema", error);
  }
  return result;
}
