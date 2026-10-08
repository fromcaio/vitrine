"use client";

// Editor do rodapé por ícones (RF24, RN17, UC20; ADR-035): a lista de até 8 links, UM por ícone, cada um
// com o ícone (`IconPicker`, lista fechada de dezoito) e o endereço, na ordem em que aparecem no rodapé
// (subir e descer). Substitui os seis campos fixos de RN17 nos formulários de aparência.
//
// A validação local avisa antes de enviar e repete a do servidor (que é a autoridade, RF21): `https://`
// em todos os ícones e, no `email`, só um endereço de e-mail (o campo recebe o endereço puro; o `mailto:`
// é montado ao enviar), com o aviso de que o e-mail fica PÚBLICO. Dois links com o mesmo ícone e mais de 8
// são recusados. Salva a lista inteira de uma vez por um cliente recebido (`client.save`, veja
// `footer-client.js`); um item recusado pelo servidor (422, um `details` por item) volta junto da linha
// dele. Em qualquer erro, o rascunho fica na tela. Não é filho de outro `<form>`.
import { useEffect, useId, useRef, useState } from "react";
import { FooterIcon } from "@/components/layout/FooterIcon";
import {
  EMAIL_ICON,
  FOOTER_ICONS,
  FOOTER_ICON_LABELS,
  MAX_FOOTER_LINKS,
  MESSAGES as MODEL_MESSAGES,
  fieldOfUrl,
  isFooterIcon,
  urlOfField,
  validateLinks,
} from "@/components/layout/footer-model";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { IconPicker } from "./IconPicker";
import { SiteFormFooter } from "./SiteFormFooter";

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const SCOPES = {
  page: "Os ícones aparecem no rodapé do seu espaço, na ordem abaixo. Vazio: o rodapé fica só com o texto de direitos.",
  site: "Os ícones aparecem no rodapé do site: o portal, o login e o painel do administrador. Vazio: o rodapé fica só com o texto de direitos.",
};

/** @typedef {{ key: number, icon: string, value: string }} Row */

/** Chave de linha: só precisa ser única na página (a linha nova não reaproveita a de uma removida). */
let keySeed = 0;
const newKey = () => ++keySeed;

/**
 * @param {Row[]} rows
 * @returns {{ icon: string, url: string }[]}
 */
const linksOf = (rows) => rows.map((row) => ({ icon: row.icon, url: urlOfField(row.icon, row.value) }));

/**
 * @param {object} props
 * @param {{ icon: string, url: string }[]} props.initial o rodapé gravado, na ordem (`GET /api/footer-links`)
 * @param {import("./footer-client").FooterClient} props.client o cliente de gravação (`createFooterClient`)
 * @param {"page" | "site"} [props.scope] de quem é o rodapé: o do espaço ou o do site (só muda os textos)
 * @param {(links: { icon: string, url: string }[]) => void} [props.onSaved] chamado com a lista gravada
 */
export function FooterLinksEditor({ initial, client, scope = "page", onSaved }) {
  const base = useId();
  const addRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const focusTarget = useRef(/** @type {string | null} */ (null));
  /** @param {{ icon: string, url: string }[]} links @returns {Row[]} */
  const rowsOf = (links) =>
    links
      .filter((link) => isFooterIcon(link?.icon) && typeof link?.url === "string")
      .slice(0, MAX_FOOTER_LINKS)
      .map((link) => ({ key: newKey(), icon: link.icon, value: fieldOfUrl(link.icon, link.url) }));

  const [rows, setRows] = useState(() => rowsOf(initial));
  const [baseline, setBaseline] = useState(() => JSON.stringify(linksOf(rows)));
  const [errors, setErrors] = useState(/** @type {Record<number, string>} */ ({}));
  const [general, setGeneral] = useState("");
  const [pending, setPending] = useState(false);
  const [nothing, setNothing] = useState(false);
  const [savedAt, setSavedAt] = useState("");

  const dirty = JSON.stringify(linksOf(rows)) !== baseline;
  const full = rows.length >= MAX_FOOTER_LINKS;

  // Move o foco para o que acabou de aparecer (a linha nova) ou para onde o botão pressionado saiu.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    (target === "add" ? addRef.current : document.getElementById(target))?.focus();
  });

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

  /** @param {number} key @param {string} part */
  const idOf = (key, part) => `${base}-${key}-${part}`;

  /** @param {number} key @param {Partial<Row>} patch */
  function update(key, patch) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _gone, ...rest } = current;
      return rest;
    });
    setNothing(false);
    setSavedAt("");
  }

  /** Troca o ícone; ao entrar ou sair do `email`, o campo recomeça (o que se digita muda de natureza). @param {Row} row @param {string} icon */
  function changeIcon(row, icon) {
    const crossesEmail = (icon === EMAIL_ICON) !== (row.icon === EMAIL_ICON);
    update(row.key, crossesEmail ? { icon, value: "" } : { icon });
  }

  function add() {
    if (full) return;
    const free = FOOTER_ICONS.find((icon) => !rows.some((row) => row.icon === icon)) ?? FOOTER_ICONS[0];
    const key = newKey();
    setRows((current) => [...current, { key, icon: free, value: "" }]);
    setNothing(false);
    setSavedAt("");
    focusTarget.current = idOf(key, "url");
  }

  /** @param {number} key */
  function remove(key) {
    setRows((current) => current.filter((row) => row.key !== key));
    setErrors((current) => {
      const { [key]: _gone, ...rest } = current;
      return rest;
    });
    setNothing(false);
    setSavedAt("");
    focusTarget.current = "add";
  }

  /** @param {number} index @param {-1 | 1} direction */
  function move(index, direction) {
    const to = index + direction;
    if (to < 0 || to >= rows.length) return;
    const key = rows[index].key;
    setRows((current) => {
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setNothing(false);
    setSavedAt("");
    // O botão pressionado pode ficar desabilitado na nova posição (a primeira ou a última): o foco vai ao outro.
    const lastPlace = to === rows.length - 1;
    focusTarget.current = idOf(key, direction < 0 ? (to === 0 ? "down" : "up") : lastPlace ? "up" : "down");
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    setGeneral("");
    setNothing(false);
    setSavedAt("");
    const links = linksOf(rows);
    const found = validateLinks(links);
    /** @type {Record<number, string>} */
    const byKey = {};
    for (const [index, message] of Object.entries(found.rows)) byKey[rows[Number(index)].key] = message;
    setErrors(byKey);
    if (found.general) setGeneral(found.general);
    if (found.general || Object.keys(byKey).length > 0) {
      const first = rows.find((row) => byKey[row.key]);
      if (first) document.getElementById(idOf(first.key, "url"))?.focus();
      return;
    }
    if (!dirty) {
      setNothing(true);
      return;
    }
    const submitted = rows;
    setPending(true);
    const result = await client.save(links);
    setPending(false);
    if (result.ok) {
      const stored = rowsOf(result.links);
      setBaseline(JSON.stringify(linksOf(stored)));
      // A tela só adota a lista devolvida (a normalizada pelo servidor) se o autor não mexeu enquanto salvava.
      setRows((current) => (JSON.stringify(linksOf(current)) === JSON.stringify(linksOf(submitted)) ? stored : current));
      setErrors({});
      setSavedAt(time.format(new Date()));
      onSaved?.(result.links);
      return;
    }
    /** @type {Record<number, string>} */
    const failed = {};
    for (const [index, message] of Object.entries(result.rows)) {
      const row = submitted[Number(index)];
      if (row) failed[row.key] = message;
    }
    setErrors(failed);
    setGeneral(result.message);
    const first = submitted.find((row) => failed[row.key]);
    if (first) document.getElementById(idOf(first.key, "url"))?.focus();
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <fieldset className="flex min-w-0 flex-col gap-4 rounded-md border border-border p-4">
        <legend className="px-2 text-base font-semibold">Links do rodapé</legend>
        <p className="text-sm text-muted">
          {SCOPES[scope]} No máximo {MAX_FOOTER_LINKS} links, um por ícone. Só endereços https://; no ícone de e-mail, um endereço de e-mail.
        </p>

        {rows.length === 0 ? <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">Nenhum link no rodapé.</p> : null}

        <ol className="flex flex-col gap-4">
          {rows.map((row, index) => {
            const label = FOOTER_ICON_LABELS[/** @type {keyof typeof FOOTER_ICON_LABELS} */ (row.icon)] ?? row.icon;
            const isEmail = row.icon === EMAIL_ICON;
            const error = errors[row.key];
            const taken = rows.filter((other) => other.key !== row.key).map((other) => other.icon);
            const noteId = idOf(row.key, "aviso");
            return (
              <li key={row.key}>
                <div role="group" aria-label={`Link ${index + 1}: ${label}`} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
                  <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                    <Field id={idOf(row.key, "icon")} label="Ícone">
                      <IconPicker id={idOf(row.key, "icon")} value={row.icon} onChange={(icon) => changeIcon(row, icon)} taken={taken} />
                    </Field>
                    <Field
                      id={idOf(row.key, "url")}
                      label={isEmail ? "Endereço de e-mail" : "Endereço (https://…)"}
                      error={error}
                    >
                      <input
                        id={idOf(row.key, "url")}
                        type="text"
                        inputMode={isEmail ? "email" : "url"}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder={isEmail ? "nome@exemplo.com" : "https://"}
                        value={row.value}
                        onChange={(event) => update(row.key, { value: event.target.value })}
                        aria-invalid={error ? "true" : undefined}
                        aria-describedby={[describedBy(idOf(row.key, "url"), { error }), isEmail ? noteId : null].filter(Boolean).join(" ") || undefined}
                        className={INPUT}
                      />
                    </Field>
                  </div>
                  {isEmail ? (
                    <p id={noteId} className="flex items-start gap-2 text-sm">
                      <FooterIcon icon="email" className="mt-0.5 size-4 shrink-0" />
                      {MODEL_MESSAGES.emailPublic}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button id={idOf(row.key, "up")} variant="outline" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir o link ${index + 1} (${label})`}>
                      <ArrowUpIcon className="size-4" />
                      Subir
                    </Button>
                    <Button id={idOf(row.key, "down")} variant="outline" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={`Descer o link ${index + 1} (${label})`}>
                      <ArrowDownIcon className="size-4" />
                      Descer
                    </Button>
                    <Button variant="outline" onClick={() => remove(row.key)} aria-label={`Remover o link ${index + 1} (${label})`}>
                      <TrashIcon className="size-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Button ref={addRef} variant="outline" onClick={add} disabled={full}>
            <PlusIcon className="size-4" />
            Adicionar link
          </Button>
          <p className="text-sm text-muted">
            {full ? MODEL_MESSAGES.full : `${rows.length} de ${MAX_FOOTER_LINKS} links.`}
          </p>
        </div>
      </fieldset>

      <SiteFormFooter
        general={general}
        nothing={nothing}
        savedNotice={savedAt ? `Rodapé salvo às ${savedAt}.` : ""}
        dirty={dirty}
        pending={pending}
        submitLabel="Salvar o rodapé"
      />
    </form>
  );
}
