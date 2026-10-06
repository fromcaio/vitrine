"use client";

// Formulário de troca de senha (RF28, UC14, RN21; M20, adiantado para a etapa 2 da A-015): a
// senha atual, a nova e a confirmação, enviadas a POST /api/users/me/password ({ current, next }).
// A variante `mandatory` é a troca obrigatória do primeiro acesso ou de uma redefinição pelo
// administrador: explica a senha provisória e, ao terminar, leva ao painel.
//
// As senhas não passam pelo estado do componente, não são registradas nem guardadas (nem em
// localStorage): são lidas dos campos só no envio e os campos são esvaziados quando a troca dá
// certo. Os limites (8 a 128 caracteres) repetem os do servidor, que é a autoridade (RF21); não se
// importa o Zod do validators.js aqui para não levar a biblioteca ao navegador.
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const MESSAGES = {
  currentRequired: "Informe a senha atual.",
  tooShort: `A nova senha deve ter ao menos ${MIN_LENGTH} caracteres.`,
  tooLong: `A nova senha deve ter no máximo ${MAX_LENGTH} caracteres.`,
  same: "A nova senha deve ser diferente da atual.",
  mismatch: "A confirmação não é igual à nova senha.",
  unauthenticated: "Sua sessão expirou. Entre de novo para trocar a senha.",
  forbidden: "Você não tem permissão para trocar esta senha.",
  rateLimited: "Muitas tentativas. Aguarde um instante e tente novamente.",
  rejected: "O servidor não aceitou os dados enviados. Confira os campos e tente de novo.",
  server: "O servidor não conseguiu trocar a senha agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";

/** @typedef {{ current?: string, next?: string, confirm?: string }} FieldErrors */

/**
 * Valida no navegador o que o servidor também valida; só poupa uma ida ao servidor.
 * @param {string} current
 * @param {string} next
 * @param {string} confirm
 * @returns {FieldErrors}
 */
function validate(current, next, confirm) {
  /** @type {FieldErrors} */
  const errors = {};
  if (current === "") errors.current = MESSAGES.currentRequired;
  if (next.length < MIN_LENGTH) errors.next = MESSAGES.tooShort;
  else if (next.length > MAX_LENGTH) errors.next = MESSAGES.tooLong;
  else if (next === current) errors.next = MESSAGES.same;
  if (confirm !== next) errors.confirm = MESSAGES.mismatch;
  return errors;
}

/**
 * Traduz a resposta de erro da API em mensagens por campo e uma geral.
 * @param {Response} response
 * @returns {Promise<{ fields: FieldErrors, general: string }>}
 */
async function interpretFailure(response) {
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const status = response.status;
  if (status === 401) return { fields: {}, general: MESSAGES.unauthenticated };
  if (status === 403) return { fields: {}, general: MESSAGES.forbidden };
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return { fields: {}, general: `${MESSAGES.rateLimited}${wait}` };
  }
  if (status === 422 || status === 400) {
    /** @type {FieldErrors} */
    const fields = {};
    const others = [];
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    for (const detail of details) {
      const text = typeof detail?.message === "string" ? detail.message : null;
      if (!text) continue;
      if (detail.field === "current") fields.current ??= text;
      else if (detail.field === "next" || detail.field === "password") fields.next ??= text;
      else others.push(text);
    }
    if (Object.keys(fields).length === 0 && others.length === 0) return { fields, general: MESSAGES.rejected };
    return { fields, general: others.join(" ") };
  }
  return { fields: {}, general: MESSAGES.server };
}

/**
 * @param {object} props
 * @param {boolean} [props.mandatory] troca obrigatória (senha provisória): texto explicativo e, ao
 *   terminar, vai a `redirectTo`; sem ela, só confirma
 * @param {string} [props.redirectTo] destino depois da troca obrigatória, já validado pelo Core
 * @param {(url: string) => void} [props.navigate] como ir ao destino; o padrão é a navegação
 *   completa do navegador (só os testes o trocam)
 */
export function PasswordChangeForm({
  mandatory = false,
  redirectTo = "/admin",
  navigate = (url) => window.location.assign(url),
}) {
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const currentRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const nextRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const confirmRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [errors, setErrors] = useState(/** @type {FieldErrors} */ ({}));
  const [general, setGeneral] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  /** @param {FieldErrors} found */
  function focusFirst(found) {
    const order = /** @type {const} */ ([
      ["current", currentRef],
      ["next", nextRef],
      ["confirm", confirmRef],
    ]);
    order.find(([name]) => found[name])?.[1].current?.focus();
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current") ?? "");
    const next = String(data.get("next") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    setGeneral("");
    setDone(false);
    const found = validate(current, next, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      if (response.ok) {
        form.reset();
        setDone(true);
        // Navegação completa: o painel volta a validar a sessão, agora sem a senha provisória. O
        // botão segue desabilitado até a página de destino carregar.
        if (mandatory) {
          navigate(redirectTo);
          return;
        }
      } else {
        const failure = await interpretFailure(response);
        setErrors(failure.fields);
        setGeneral(failure.general);
        focusFirst(failure.fields);
      }
    } catch {
      setGeneral(MESSAGES.network);
    }
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {mandatory ? (
        <div className="flex items-start gap-2 rounded-md border-2 border-foreground bg-surface p-4 text-sm">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <p>
            Você entrou com uma <strong>senha provisória</strong>. Defina uma nova senha para continuar: até lá, o resto do painel
            fica bloqueado. A senha provisória deixa de valer depois da troca.
          </p>
        </div>
      ) : null}

      <Field id={ids.current} label={mandatory ? "Senha provisória" : "Senha atual"} error={errors.current}>
        <input
          ref={currentRef}
          id={ids.current}
          name="current"
          type="password"
          autoComplete="current-password"
          required
          maxLength={MAX_LENGTH}
          aria-invalid={errors.current ? "true" : undefined}
          aria-describedby={describedBy(ids.current, { error: errors.current })}
          className={INPUT}
        />
      </Field>
      <Field
        id={ids.next}
        label="Nova senha"
        hint={`De ${MIN_LENGTH} a ${MAX_LENGTH} caracteres, diferente da senha atual.`}
        error={errors.next}
      >
        <input
          ref={nextRef}
          id={ids.next}
          name="next"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={errors.next ? "true" : undefined}
          aria-describedby={describedBy(ids.next, { hint: true, error: errors.next })}
          className={INPUT}
        />
      </Field>
      <Field id={ids.confirm} label="Confirmar a nova senha" error={errors.confirm}>
        <input
          ref={confirmRef}
          id={ids.confirm}
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={errors.confirm ? "true" : undefined}
          aria-describedby={describedBy(ids.confirm, { error: errors.confirm })}
          className={INPUT}
        />
      </Field>

      {/* Regiões vivas sempre presentes (e sem altura quando vazias). */}
      <div role="alert" className="empty:hidden">
        {general ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {general}
              {general === MESSAGES.unauthenticated ? (
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
        {done ? (
          <p className="flex items-start gap-2 rounded-md border border-border-strong px-3 py-2 text-sm">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            {mandatory ? "Senha definida. Levando você ao painel…" : "Senha alterada. As suas outras sessões foram encerradas."}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enviando…" : mandatory ? "Definir nova senha" : "Trocar senha"}
      </Button>
    </form>
  );
}
