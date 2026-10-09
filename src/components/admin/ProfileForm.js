"use client";

// Perfil do próprio usuário (RF28, UC14; RN20, RN21; M20): o nome de exibição, que ele edita, e o
// e-mail, o endereço do espaço (handle) e o papel, que ele só vê (quem os altera é o administrador).
// Envia PATCH /api/users/me ({ name }). O limite do nome (100 caracteres) repete o do servidor, que é a
// autoridade (RF21); não se importa o Zod do validators.js aqui. Os valores são texto puro.
//
// O avatar (RF36, UC14, UC21; A-028) é um envio à parte, na hora (`ImageUpload`, `PUT|DELETE
// /api/users/me/avatar`), antes do formulário do nome; sem a prop `avatar`, a seção não aparece. Depois de
// enviar ou remover, o `router.refresh()` atualiza o cabeçalho do painel, que persiste entre as navegações.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, describedBy } from "@/components/ui/Field";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";
import { IMAGE_ENDPOINTS, createImageClient } from "@/components/ui/image-client";

const NAME_MAX_LENGTH = 100;

const MESSAGES = {
  required: "O nome é obrigatório.",
  tooLong: `O nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`,
  unchanged: "O nome não mudou.",
  saved: "Nome atualizado.",
  unauthenticated: "Sua sessão expirou. Entre de novo para salvar o perfil.",
  forbidden: "Você não tem permissão para editar este perfil.",
  rateLimited: "Muitas tentativas. Aguarde um instante e tente novamente.",
  rejected: "O servidor não aceitou o nome enviado. Confira o campo e tente de novo.",
  server: "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
  network: "Não foi possível conectar ao servidor. Confira a conexão e tente de novo.",
};

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger read-only:bg-surface read-only:text-muted";

const ROLE_LABEL = { admin: "Administrador", user: "Usuário" };

/**
 * @param {Response} response
 * @returns {Promise<{ field: string, general: string }>}
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
  if (status === 401) return { field: "", general: MESSAGES.unauthenticated };
  if (status === 403) return { field: "", general: MESSAGES.forbidden };
  if (status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Tente de novo em ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.` : "";
    return { field: "", general: `${MESSAGES.rateLimited}${wait}` };
  }
  if (status === 422 || status === 400) {
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    const named = details.find((detail) => detail?.field === "name" && typeof detail?.message === "string");
    return named ? { field: named.message, general: "" } : { field: "", general: MESSAGES.rejected };
  }
  return { field: "", general: MESSAGES.server };
}

/**
 * @param {object} props
 * @param {{ name: string, email: string, handle: string | null, role: "admin" | "user" }} props.user o perfil de `GET /api/users/me`
 * @param {string | null} [props.spaceHref] endereço do espaço público (o Core o monta a partir do handle); sem ele, o handle aparece só como texto
 * @param {{ url: string | null } | null} [props.avatar] o avatar atual (`/media/<id>` ou nulo); sem a prop, a
 *   seção do avatar não aparece
 * @param {import("@/components/ui/image-client").ImageClient} [props.avatarClient] o cliente de envio do
 *   avatar (os testes o simulam); o padrão fala com `/api/users/me/avatar`
 * @param {(name: string) => void} [props.onSaved] chamado com o nome gravado (o Core pode atualizar o cabeçalho)
 */
export function ProfileForm({ user, spaceHref = null, avatar = null, avatarClient, onSaved }) {
  const router = useRouter();
  const ids = { name: useId(), email: useId(), handle: useId(), role: useId() };
  const nameRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [saved, setSaved] = useState(user.name);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");
  const [general, setGeneral] = useState("");
  const [done, setDone] = useState("");
  const [pending, setPending] = useState(false);

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const value = name.trim();
    setGeneral("");
    setDone("");
    const invalid = value === "" ? MESSAGES.required : value.length > NAME_MAX_LENGTH ? MESSAGES.tooLong : "";
    setError(invalid);
    if (invalid) {
      nameRef.current?.focus();
      return;
    }
    if (value === saved) {
      setName(value);
      setDone(MESSAGES.unchanged);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        const stored = typeof body?.data?.name === "string" && body.data.name !== "" ? body.data.name : value;
        setSaved(stored);
        setName(stored);
        setDone(MESSAGES.saved);
        onSaved?.(stored);
      } else {
        const failure = await interpretFailure(response);
        setError(failure.field);
        setGeneral(failure.general);
        if (failure.field) nameRef.current?.focus();
      }
    } catch {
      setGeneral(MESSAGES.network);
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {avatar ? (
        <ImageUpload
          label="Avatar"
          kind="avatar"
          currentUrl={avatar.url}
          client={avatarClient ?? createImageClient(IMAGE_ENDPOINTS.avatar)}
          onChange={() => router.refresh()}
          fallback={<Avatar name={user.name} size={96} decorative />}
          hint="Aparece ao lado do seu nome no diretório de espaços. Sem imagem, vale as iniciais do seu nome."
        />
      ) : null}
      <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
        <Field id={ids.name} label="Nome de exibição" hint="Aparece no painel e no diretório de espaços públicos." error={error}>
          <input
            ref={nameRef}
            id={ids.name}
            name="name"
            autoComplete="name"
            required
            value={name}
            readOnly={pending}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={describedBy(ids.name, { hint: true, error })}
            className={INPUT}
          />
        </Field>

        <Field id={ids.email} label="E-mail" hint="É o seu login. Só o administrador o altera.">
          <input id={ids.email} value={user.email} readOnly aria-describedby={`${ids.email}-hint`} className={INPUT} />
        </Field>

        <Field
          id={ids.handle}
          label="Endereço do seu espaço (handle)"
          hint={
            user.handle ? (
              <>
                Seu espaço público é{" "}
                {spaceHref ? (
                  <Link href={spaceHref} className="font-medium underline underline-offset-2">
                    /{user.handle}
                  </Link>
                ) : (
                  <strong className="font-semibold">/{user.handle}</strong>
                )}
                . Só o administrador o altera, porque mudá-lo quebra os endereços já compartilhados.
              </>
            ) : (
              "Você ainda não tem um handle, então o seu espaço público não existe. Peça ao administrador para definir um."
            )
          }
        >
          <input
            id={ids.handle}
            value={user.handle ?? ""}
            placeholder="Sem handle"
            readOnly
            aria-describedby={`${ids.handle}-hint`}
            className={INPUT}
          />
        </Field>

        <Field id={ids.role} label="Papel" hint="Define o que você pode fazer no painel. Só o administrador o altera.">
          <input id={ids.role} value={ROLE_LABEL[user.role] ?? user.role} readOnly aria-describedby={`${ids.role}-hint`} className={INPUT} />
        </Field>

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
              {done}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Salvando…" : "Salvar nome"}
        </Button>
      </form>
    </div>
  );
}
