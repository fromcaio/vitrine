"use client";

// Formulário de usuário (RF27, UC13; RN20, RN21, RN22; ADR-024): criar (e-mail, nome, handle e papel) ou
// editar (nome, handle e papel; o e-mail NÃO se edita). Envia a `/api/users` (POST) ou `/api/users/:id`
// (PATCH) e entrega o resultado a `onDone`; na criação, o resultado traz a senha provisória (que o
// painel `ProvisionalPassword` mostra uma única vez: este formulário não a guarda).
//
// Regras que a tela respeita (o servidor decide, RF21): o último administrador ativo não é rebaixado
// (o seletor de papel fica desabilitado, com a explicação); e-mail ou handle repetido (409
// `USER_CONFLICT`) aparece junto do campo certo; trocar ou remover um handle que existe avisa que o
// endereço antigo deixa de existir, sem redirecionamento (ADR-024), e pede a ciência antes de enviar.
// Os valores do usuário são texto puro. Só tokens de tema.
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { AlertIcon } from "@/components/ui/icons";
import { createUser, updateUser } from "./user-client";
import { HANDLE_MAX_LENGTH, NAME_MAX_LENGTH, handleChangeBreaksUrls, normalizeHandleInput, permissionsFor, validateUserForm } from "./user-model";

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger read-only:bg-surface read-only:text-muted disabled:opacity-60";

/**
 * @param {object} props
 * @param {"create" | "edit"} props.mode
 * @param {import("./user-model").PublicUser} [props.user] o usuário editado (só em `edit`)
 * @param {string} props.currentUserId o administrador da sessão (para a regra da última conta)
 * @param {number | null} [props.activeAdminCount] quantos administradores ativos há; sem o número, a tela não bloqueia o papel
 * @param {(result: { user: import("./user-model").PublicUser | null, temporaryPassword: string | null }) => void} props.onDone
 *   chamado quando o servidor aceitou; `temporaryPassword` só vem na criação
 * @param {() => void} [props.onCancel]
 */
export function UserForm({ mode, user, currentUserId, activeAdminCount = null, onDone, onCancel }) {
  const ids = { email: useId(), name: useId(), handle: useId(), role: useId(), ack: useId() };
  const firstRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const nameRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const handleRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const emailRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const ackRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const editing = mode === "edit" && user !== undefined;
  const permissions = editing ? permissionsFor(user, { currentUserId, activeAdminCount }) : null;

  const [email, setEmail] = useState(editing ? user.email : "");
  const [name, setName] = useState(editing ? user.name : "");
  const [handle, setHandle] = useState(editing ? (user.handle ?? "") : "");
  const [role, setRole] = useState(editing ? user.role : "user");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [general, setGeneral] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const typedHandle = normalizeHandleInput(handle);
  const breaksUrls = editing && handleChangeBreaksUrls(user.handle, typedHandle);

  /** @param {Record<string, string>} found */
  function focusFirst(found) {
    const order = /** @type {const} */ ([
      ["email", emailRef],
      ["name", nameRef],
      ["handle", handleRef],
      ["ack", ackRef],
    ]);
    order.find(([field]) => found[field])?.[1].current?.focus();
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setGeneral("");
    setInfo("");
    const { errors: found, value } = validateUserForm({ email, name, handle, role }, mode);
    /** @type {Record<string, string>} */
    const all = { ...found };
    if (breaksUrls && !acknowledged) all.ack = "Confirme que você entende que o endereço antigo deixa de existir.";
    setErrors(all);
    if (Object.keys(all).length > 0) return focusFirst(all);

    setPending(true);
    try {
      if (!editing) {
        const result = await createUser(/** @type {{ email: string, name: string, handle: string | null, role: "admin" | "user" }} */ (value));
        if (result.ok) return void onDone({ user: result.user, temporaryPassword: result.temporaryPassword });
        failWith(result);
      } else {
        /** @type {{ name?: string, handle?: string | null, role?: "admin" | "user" }} */
        const patch = {};
        if (value.name !== user.name) patch.name = value.name;
        if (value.handle !== user.handle) patch.handle = value.handle;
        if (value.role !== user.role) patch.role = value.role;
        if (Object.keys(patch).length === 0) {
          setInfo("Nada mudou.");
          return;
        }
        const result = await updateUser(user.id, patch);
        if (result.ok) return void onDone({ user: result.user, temporaryPassword: null });
        failWith(result);
      }
    } finally {
      setPending(false);
    }
  }

  /** @param {import("./user-client").Failure} result */
  function failWith(result) {
    /** @type {Record<string, string>} */
    const fields = {};
    if (result.kind === "user-conflict" && (result.field === "email" || result.field === "handle")) fields[result.field] = result.message;
    else if (result.kind === "validation") Object.assign(fields, result.fields ?? {});
    const shown = Object.keys(fields).filter((field) => ["email", "name", "handle", "role"].includes(field));
    setErrors(fields);
    // Sem campo para mostrar a mensagem (último administrador, sessão, rede...), ela vai à região geral.
    setGeneral(shown.length > 0 ? "" : result.message);
    if (shown.length > 0) focusFirst(fields);
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {editing ? (
        <Field id={ids.email} label="E-mail" hint="O e-mail é o login e não pode ser alterado.">
          <input id={ids.email} value={user.email} readOnly aria-describedby={`${ids.email}-hint`} className={INPUT} />
        </Field>
      ) : (
        <Field id={ids.email} label="E-mail" hint="É o login da conta. Depois de criada, não se altera." error={errors.email}>
          <input
            ref={(node) => {
              emailRef.current = node;
              firstRef.current = node;
            }}
            id={ids.email}
            type="email"
            autoComplete="off"
            value={email}
            readOnly={pending}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={describedBy(ids.email, { hint: true, error: errors.email })}
            className={INPUT}
          />
        </Field>
      )}

      <Field id={ids.name} label="Nome de exibição" error={errors.name}>
        <input
          ref={(node) => {
            nameRef.current = node;
            if (editing) firstRef.current = node;
          }}
          id={ids.name}
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH + 20}
          value={name}
          readOnly={pending}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={describedBy(ids.name, { error: errors.name })}
          className={INPUT}
        />
      </Field>

      <Field
        id={ids.handle}
        label="Handle (o endereço do espaço público)"
        hint={`Opcional. De 3 a ${HANDLE_MAX_LENGTH} caracteres: letras minúsculas, dígitos e hífens. Sem handle, a pessoa não tem espaço público.`}
        error={errors.handle}
      >
        <input
          ref={handleRef}
          id={ids.handle}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={handle}
          readOnly={pending}
          onChange={(event) => setHandle(event.target.value)}
          aria-invalid={errors.handle ? "true" : undefined}
          aria-describedby={describedBy(ids.handle, { hint: true, error: errors.handle })}
          className={INPUT}
        />
      </Field>

      {breaksUrls ? (
        <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-3 text-sm">
          <p className="flex items-start gap-2 font-medium">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span className="wrap-anywhere">
              {typedHandle === null ? (
                <>
                  Remover o handle tira o espaço público do ar: o endereço <strong>/{user.handle}</strong> deixa de existir.
                </>
              ) : (
                <>
                  Mudar o handle de <strong>/{user.handle}</strong> para <strong>/{typedHandle}</strong> muda o endereço de todo o espaço: o endereço antigo
                  deixa de existir.
                </>
              )}{" "}
              <strong>Não há redirecionamento</strong>: links já compartilhados vão quebrar.
            </span>
          </p>
          <div className="flex items-start gap-2">
            <input
              ref={ackRef}
              id={ids.ack}
              type="checkbox"
              checked={acknowledged}
              disabled={pending}
              onChange={(event) => setAcknowledged(event.target.checked)}
              aria-invalid={errors.ack ? "true" : undefined}
              aria-describedby={errors.ack ? `${ids.ack}-error` : undefined}
              className="mt-0.5 size-5 shrink-0 cursor-pointer"
            />
            <label htmlFor={ids.ack} className="font-medium">
              Entendo que o endereço antigo deixa de existir, sem redirecionamento.
            </label>
          </div>
          {errors.ack ? (
            <p id={`${ids.ack}-error`} role="alert" className="font-medium text-danger">
              <span className="sr-only">Erro: </span>
              {errors.ack}
            </p>
          ) : null}
        </div>
      ) : null}

      <Field
        id={ids.role}
        label="Papel"
        hint={permissions?.roleReason ?? "O administrador gerencia usuários, a configuração do site e o conteúdo de todos; o usuário gerencia só o próprio espaço."}
        error={errors.role}
      >
        <select
          id={ids.role}
          value={role}
          disabled={pending || (permissions !== null && !permissions.canChangeRole)}
          onChange={(event) => setRole(/** @type {"admin" | "user"} */ (event.target.value))}
          aria-invalid={errors.role ? "true" : undefined}
          aria-describedby={describedBy(ids.role, { hint: true, error: errors.role })}
          className={INPUT}
        >
          <option value="user">Usuário</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>

      <div role="alert" className="empty:hidden">
        {general ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span className="wrap-anywhere">{general}</span>
          </p>
        ) : null}
      </div>
      <div role="status" className="empty:hidden">
        {info ? <p className="text-sm font-medium">{info}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : editing ? "Salvar alterações" : "Criar usuário"}
        </Button>
        {onCancel ? (
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
