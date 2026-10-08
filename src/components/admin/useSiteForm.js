"use client";

// Estado e envio dos formulários de aparência e de configuração (RF18, RF31, D-40, D-41; M18, A-027):
// o que o `SiteAppearanceForm` (aparência do usuário e identidade do sistema) e o `PortalSettingsForm`
// (portal) têm em comum. O rascunho, os erros por campo, o aviso antes de sair com alterações, o envio
// PARCIAL por `fetch` (`PUT /api/appearance` ou `PUT /api/configuration`; envelope `{ data, warnings }`,
// erros `{ error: { code, message, details } }`) e, depois de um salvamento bem-sucedido, o
// `router.refresh()` do Next.js.
//
// Por que o `router.refresh()`: o layout do painel PERSISTE entre as navegações do cliente (e traz a
// cor do SISTEMA, ADR-030); sem ele, a paleta salva só aparece no painel depois de recarregar a
// página (defeito do item 6, medido em A-027). Em qualquer erro, o rascunho fica na tela. A validação
// do servidor é a autoridade (RF21): a daqui só avisa antes.
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { DEFAULT_MAX_BODY_BYTES } from "@/lib/limits";
import { MESSAGES, changedFields, draftOf, interpretFailure, patchOf, validateDraft } from "./appearance-model";

/** @typedef {import("./appearance-model").Draft} Draft */
/** @typedef {import("./appearance-model").SiteRecord} SiteRecord */
/** @typedef {import("./appearance-model").FormKind} FormKind */

/** O endereço da API de cada formulário. */
export const ENDPOINT = /** @type {const} */ ({ appearance: "/api/appearance", site: "/api/configuration", portal: "/api/configuration" });

/**
 * @param {object} options
 * @param {FormKind} options.kind
 * @param {SiteRecord} options.initial registro como a API o devolve (`GET`)
 * @param {SiteRecord | null} [options.system] a configuração do sistema (só a aparência do usuário)
 * @param {number} [options.maxBodyBytes] limite do texto do portal, em bytes (RN25)
 * @param {(data: SiteRecord) => void} [options.onSaved] chamado com o registro gravado, depois de um salvamento bem-sucedido
 * @param {string[]} options.fieldOrder ordem dos campos para levar o foco ao primeiro erro
 */
export function useSiteForm({ kind, initial, system = null, maxBodyBytes = DEFAULT_MAX_BODY_BYTES, onSaved, fieldOrder }) {
  const base = useId();
  const router = useRouter();

  const [baseline, setBaseline] = useState(() => draftOf(initial, kind, system));
  const [draft, setDraft] = useState(() => draftOf(initial, kind, system));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [general, setGeneral] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(/** @type {{ at: string, warnings: import("@/lib/theme").ContrastWarning[] } | null} */ (null));
  const [nothing, setNothing] = useState(false);

  const changed = changedFields(draft, baseline);
  const dirty = changed.length > 0;

  // Alterações que só existem nesta tela: avisa antes de recarregar ou fechar a página.
  useEffect(() => {
    if (!dirty) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** @param {string} field @returns {string} */
  const idOf = (field) => `${base}-${field}`;

  /** Apaga os erros dos campos dados (o autor está corrigindo). @param {string[]} fields */
  const clearErrors = (fields) =>
    setErrors((current) => {
      if (!fields.some((field) => field in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([field]) => !fields.includes(field)));
    });

  /** Altera um campo e apaga o erro dele. @param {string} field @param {string | boolean} value */
  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNothing(false);
    clearErrors([field]);
  };

  /** @param {Record<string, string>} found */
  function focusFirst(found) {
    const first = fieldOrder.find((field) => found[field]);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    setGeneral("");
    setNothing(false);

    const found = validateDraft(draft, { kind, maxBodyBytes });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    const patch = patchOf(draft, baseline);
    if (Object.keys(patch).length === 0) {
      setNothing(true);
      return;
    }

    const submitted = draft;
    setPending(true);
    try {
      const response = await fetch(ENDPOINT[kind], {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        const next = draftOf(body?.data ?? {}, kind, system);
        // O servidor devolve o registro gravado (textos aparados, "" como ausente): é a nova base. A
        // tela só adota esse valor se o autor não editou nada enquanto o envio estava em andamento.
        setBaseline(next);
        setDraft((current) => (changedFields(current, submitted).length === 0 ? next : current));
        setErrors({});
        setSaved({ at: new Date().toISOString(), warnings: Array.isArray(body?.warnings) ? body.warnings : [] });
        onSaved?.(body?.data ?? {});
        // O layout do painel persiste entre as navegações e traz a paleta do sistema: sem isto, a cor
        // salva só aparece depois de recarregar a página.
        router.refresh();
      } else {
        const failure = await interpretFailure(response, kind);
        setErrors(failure.fields);
        setGeneral(failure.general);
        focusFirst(failure.fields);
      }
    } catch {
      setGeneral(MESSAGES.network);
    }
    setPending(false);
  }

  return { idOf, draft, setDraft, baseline, errors, setErrors, clearErrors, general, pending, saved, nothing, setNothing, dirty, setField, submit };
}
