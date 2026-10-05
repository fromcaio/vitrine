"use client";

// Editor de conteúdo ligado à API (M09): é o componente que a página de criação e edição usa. Recebe
// só dados simples por props, que um Server Component pode passar, e envia o conteúdo a
// POST /api/contents (novo) ou PATCH /api/contents/:id (existente). O Editor em si recebe a ação
// de envio por prop e não conhece a API; esta camada a fornece.
//
// O editor lê o rascunho local ao montar (localStorage) e carrega o formulário e a
// pré-visualização sob demanda: por isso é montado só no navegador (`ssr: false`), sem HTML
// gerado no servidor que precisasse ser reconciliado com o rascunho.
import dynamic from "next/dynamic";
import { useState } from "react";
import { saveContent } from "./content-client";

const Editor = dynamic(() => import("./Editor").then((module) => module.Editor), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-sm text-muted">
      Carregando o editor…
    </p>
  ),
});

/**
 * @param {object} props
 * @param {string} props.userId identificador do usuário autenticado (chave do rascunho local)
 * @param {string | null} props.contentId identificador do conteúdo; `null` para um conteúdo novo
 * @param {string | null} [props.parentId] coleção pai de um conteúdo novo; `null` na raiz
 * @param {string | null} [props.editPath] caminho da página de edição, com `{id}` no lugar do
 *   identificador (por exemplo, `/admin/conteudo/{id}`). Depois de CRIAR o conteúdo, a URL da
 *   página passa a ser essa, sem navegar: recarregar a página abre o conteúdo criado, em vez de
 *   um formulário vazio que tentaria criar um duplicado
 * @param {{ title?: string, slug?: string, body?: string | null, status?: "DRAFT" | "PUBLISHED" }} props.initialValue
 *   valores iniciais: os do servidor, ou os padrões de um conteúdo novo (estado `PUBLISHED`, RN16)
 * @param {string | null} [props.version] versão do conteúdo no servidor (o `updatedAt`)
 */
export function ContentEditor({ userId, contentId, parentId = null, editPath = null, initialValue, version = null }) {
  // Depois de criar o conteúdo, os envios seguintes o atualizam.
  const [id, setId] = useState(contentId);

  /**
   * @param {import("./draft").EditorValues} values
   * @param {{ version: string | null }} context versão em que o Editor se baseia (RN18): a que ele
   *   abriu, a do último envio ou, depois de um conflito, a atual do servidor (sobrescrever)
   */
  async function submit(values, { version: baseVersion }) {
    const result = await saveContent({ id, parentId, values, version: baseVersion });
    if (result.ok) {
      // history.replaceState é a forma que o Next.js oferece para trocar a URL sem navegar.
      if (id === null && editPath) window.history.replaceState(null, "", editPath.replace("{id}", encodeURIComponent(result.id)));
      setId(result.id);
    }
    return result;
  }

  return <Editor userId={userId} contentId={id} initialValue={initialValue} version={version} onSubmit={submit} />;
}
