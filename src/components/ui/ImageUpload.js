"use client";

// Envio de uma imagem (logotipo, favicon ou avatar; RF35, RF36, RN29; ADR-034): seletor de arquivo, o
// formato (PNG, JPEG ou WebP) e o tamanho (2 MB) conferidos ANTES do envio, pré-visualização LOCAL do
// arquivo escolhido, "Enviar", "Cancelar" e "Remover", o estado de envio e as falhas do servidor em
// português (INVALID_IMAGE, 413, 429, 503…), sem perder a imagem anterior em erro.
//
// Fala com a API por um cliente recebido (`client`: `upload(file)` e `remove()`, veja `image-client.js`),
// e não conhece rota, dono nem sessão. A imagem mostrada é sempre `/media/<id>` (mesma origem); a
// pré-visualização local é um `data:` URL (a CSP admite `data:` no `img-src`, mas não `blob:`) que vive só
// na memória da tela: NADA é guardado no navegador (nem `localStorage`, nem IndexedDB, nem cache). Não é
// um `<form>`: pode ser usado dentro de outro formulário, e o envio é imediato e independente dele.
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import { Field, describedBy } from "./Field";
import { IMAGE_ACCEPT, IMAGE_RESULT, MESSAGES, checkImageFile, isMediaUrl } from "./image-model";

/** O tamanho da caixa da imagem por tipo (a imagem mantém a proporção dentro dela). */
const BOX = {
  logo: { box: "h-16 w-48 rounded-md", width: 192, height: 64, fit: "object-contain" },
  favicon: { box: "size-16 rounded-md", width: 64, height: 64, fit: "object-contain" },
  avatar: { box: "size-24 rounded-full", width: 96, height: 96, fit: "object-cover" },
};

/**
 * @param {File} file
 * @returns {Promise<string>} o `data:` URL do arquivo
 */
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("leitura")));
    reader.onerror = () => reject(reader.error ?? new Error("leitura"));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {object} props
 * @param {string} props.label nome da imagem, como aparece na tela ("Logotipo", "Favicon", "Avatar")
 * @param {"logo" | "favicon" | "avatar"} [props.kind] define o tamanho da caixa e o que o servidor faz
 * @param {string | null} [props.currentUrl] a imagem atual (`/media/<id>`); sem ela, o `fallback`
 * @param {import("./image-client").ImageClient} props.client o cliente de envio (`createImageClient`)
 * @param {(url: string | null) => void} [props.onChange] chamado com o novo `/media/<id>` depois de um
 *   envio, ou `null` depois de remover
 * @param {import("react").ReactNode} [props.fallback] o que mostrar sem imagem (o logotipo padrão, as
 *   iniciais); o padrão é um texto
 * @param {import("react").ReactNode} [props.hint] ajuda extra, depois do formato e do tamanho
 */
export function ImageUpload({ label, kind = "logo", currentUrl = null, client, onChange, fallback = null, hint = null }) {
  const id = useId();
  const inputId = `${id}-arquivo`;
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const reading = useRef(0);
  const [url, setUrl] = useState(isMediaUrl(currentUrl) ? currentUrl : null);
  const [picked, setPicked] = useState(/** @type {{ file: File, preview: string } | null} */ (null));
  const [busy, setBusy] = useState(/** @type {"" | "enviando" | "removendo"} */ (""));
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const focusAfter = useRef(false);
  const noun = label.toLowerCase();
  const shape = BOX[kind];

  // O foco volta ao seletor quando o botão que o tinha sai da tela; o seletor fica desabilitado durante
  // o envio, então o foco só pode ir depois da renderização.
  useEffect(() => {
    if (focusAfter.current && busy === "") {
      focusAfter.current = false;
      inputRef.current?.focus();
    }
  });

  /** @param {import("react").ChangeEvent<HTMLInputElement>} event */
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const token = ++reading.current;
    setDone("");
    const problem = checkImageFile(file);
    if (problem) {
      setPicked(null);
      setError(problem);
      return;
    }
    try {
      const preview = await readAsDataUrl(file);
      if (token !== reading.current) return;
      setError("");
      setPicked({ file, preview });
    } catch {
      if (token !== reading.current) return;
      setPicked(null);
      setError(MESSAGES.unreadable);
    }
  }

  function cancel() {
    reading.current++;
    setPicked(null);
    setError("");
    focusAfter.current = true;
  }

  async function send() {
    if (!picked || busy) return;
    setBusy("enviando");
    setError("");
    setDone("");
    const result = await client.upload(picked.file);
    setBusy("");
    if (!result.ok) {
      // A imagem anterior e o arquivo escolhido ficam: dá para tentar de novo ou cancelar.
      setError(result.message);
      return;
    }
    reading.current++;
    setPicked(null);
    setUrl(result.url);
    setDone(`${label} enviado.`);
    onChange?.(result.url);
    focusAfter.current = true;
  }

  async function remove() {
    if (busy) return;
    setBusy("removendo");
    setError("");
    setDone("");
    const result = await client.remove();
    setBusy("");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUrl(null);
    setDone(`${label} removido.`);
    onChange?.(null);
    focusAfter.current = true;
  }

  return (
    <fieldset aria-busy={busy !== ""} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-4">
      <legend className="px-2 text-sm font-semibold">{label}</legend>

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`${shape.box} flex shrink-0 items-center justify-center overflow-hidden border border-border-strong bg-surface text-center text-xs text-muted`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem já reencodada, servida por /media
            <img src={url} alt={`${label} atual`} width={shape.width} height={shape.height} className={`size-full ${shape.fit}`} />
          ) : (
            (fallback ?? <span className="px-1">Sem imagem</span>)
          )}
        </div>
        {url && !picked ? (
          <Button variant="outline" onClick={remove} disabled={busy !== ""}>
            {busy === "removendo" ? "Removendo…" : `Remover ${noun}`}
          </Button>
        ) : null}
      </div>

      <Field
        id={inputId}
        label={`Arquivo: ${noun}`}
        hint={
          <>
            PNG, JPEG ou WebP, até 2 MB. {IMAGE_RESULT[kind]}
            {hint ? <> {hint}</> : null}
          </>
        }
        error={error}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={choose}
          disabled={busy !== ""}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy(inputId, { hint: true, error })}
          className="w-full rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1 file:text-sm file:text-foreground aria-invalid:border-danger"
        />
      </Field>

      {picked ? (
        <div className="flex flex-col gap-3 rounded-md border border-border-strong p-3">
          <p className="text-sm font-medium">Pré-visualização do arquivo escolhido (ainda não enviado)</p>
          <div className={`${shape.box} flex shrink-0 items-center justify-center overflow-hidden border border-border-strong bg-surface`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (data:) */}
            <img src={picked.preview} alt={`Pré-visualização: ${noun}`} width={shape.width} height={shape.height} className={`size-full ${shape.fit}`} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={send} disabled={busy !== ""}>
              {busy === "enviando" ? "Enviando…" : `Enviar ${noun}`}
            </Button>
            <Button variant="outline" onClick={cancel} disabled={busy !== ""}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div role="status" className="empty:hidden">
        {done ? <p className="text-sm">{done}</p> : null}
      </div>
    </fieldset>
  );
}
