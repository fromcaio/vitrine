"use client";

// Campo de cor (primitivo de interface; Cap. 5 §5.11; RF19, RN09): o seletor nativo do navegador e,
// ao lado, um campo de texto `#RRGGBB`. Os dois mostram o mesmo valor; o texto é o que o autor
// digita ou cola, e o seletor, o que ele escolhe com o mouse. Rótulo, ajuda e erro ligados por
// `aria-describedby` (Field). A validação é a do servidor, `hexColorSchema` de validators.js, sem
// o atalho compilado do Zod, que a CSP do site não admite (zod-config.js; ADR-022). Só tokens de
// tema.

// Primeiro de todos: configura o Zod antes de o validators.js criar os esquemas dele.
import "@/components/editor/zod-config";
import { useState } from "react";
import { hexColorSchema } from "@/lib/validators";
import { Field, describedBy } from "./Field";

/**
 * Mensagem de erro de uma cor (a do servidor, em português) ou `undefined` se ela é válida.
 * @param {string} value texto do campo
 * @returns {string | undefined}
 */
export function colorError(value) {
  const result = hexColorSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

const TEXT_INPUT =
  "w-28 rounded-md border border-border-strong bg-background px-3 py-2 font-mono text-base text-foreground aria-invalid:border-danger";

/**
 * @param {object} props
 * @param {string} props.id identificador do campo de texto (o `htmlFor` do rótulo)
 * @param {string} props.label rótulo visível (por exemplo, "Primária")
 * @param {string} props.value valor atual, como o autor o deixou: `#RRGGBB` ou um texto ainda incompleto
 * @param {(value: string) => void} props.onChange recebe o novo valor, do seletor (sempre `#rrggbb`) ou
 *   do texto digitado (como veio)
 * @param {string} [props.name] `name` do campo de texto
 * @param {import("react").ReactNode} [props.hint] ajuda, abaixo do campo
 * @param {string} [props.error] erro vindo de fora (por exemplo, do servidor); sem ele, o campo
 *   valida a si mesmo depois de perder o foco
 * @param {string} [props.className] classes de leiaute
 */
export function ColorField({ id, label, value, onChange, name, hint, error, className }) {
  const [touched, setTouched] = useState(false);
  const own = touched ? colorError(value) : undefined;
  const shown = error ?? own;
  const valid = colorError(value) === undefined;

  return (
    <Field id={id} label={label} hint={hint} error={shown} className={className}>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-seletor`}
          type="color"
          aria-label={`${label}: seletor de cor`}
          // O seletor nativo só aceita #rrggbb: com o texto ainda incompleto, ele mostra preto.
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-border-strong bg-background p-1"
        />
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          maxLength={7}
          placeholder="#RRGGBB"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={shown ? "true" : undefined}
          aria-describedby={describedBy(id, { hint, error: shown })}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          className={TEXT_INPUT}
        />
      </div>
    </Field>
  );
}
