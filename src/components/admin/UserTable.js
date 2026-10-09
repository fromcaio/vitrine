"use client";

// Gestão de usuários do painel do administrador (RF27, UC13; RN19 a RN24; RNF05, RNF06; M20): a lista
// paginada (50 por página) com busca por e-mail ou nome, o formulário de criar e editar, e as ações de
// cada linha: editar, redefinir a senha, suspender (motivo obrigatório e prazo opcional), reativar,
// excluir (com a escolha de transferir ou apagar o conteúdo), "Remover avatar" (motivo obrigatório; RF36) e
// "Ver o conteúdo". Recebe a primeira
// página já lida pelo Core e fala com `/api/users` por fetch; não lê o banco nem a sessão.
//
// Regras que a tela respeita (o servidor decide, RF21; se ela errar, o 403 ou o 409 chega e a mensagem
// aparece no diálogo, que continua aberto): a PRÓPRIA conta não se suspende nem se exclui; o ÚLTIMO
// administrador ativo não é rebaixado, suspenso nem excluído; trocar o handle avisa que o endereço
// antigo deixa de existir. Nenhuma ação que a matriz recusaria é oferecida: o botão fica desabilitado,
// com a explicação ao lado.
//
// A senha provisória (`ProvisionalPassword`) vem das respostas de criar e de redefinir, é mostrada uma
// única vez e sai do estado ao fechar. Todo texto de usuário (nome, e-mail, handle, motivo) é TEXTO
// PURO: nós de texto do React, sempre escapados. A lista é de CARTÕES em todas as larguras (RNF06):
// em telas largas, nome e estado ficam lado a lado com as ações. Só tokens de tema.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, describedBy } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { AlertIcon, CheckCircleIcon, DocumentIcon, ImageIcon, KeyIcon, PencilIcon, PlusIcon, TrashIcon, UserIcon, WarningIcon } from "@/components/ui/icons";
import { mediaUrlOfId } from "@/components/ui/image-model";
import { ModerationDialog } from "./ModerationDialog";
import { ProvisionalPassword } from "./ProvisionalPassword";
import { UserForm } from "./UserForm";
import { banUser, deleteUser, listUsers, removeAvatar, resetPassword, unbanUser } from "./user-client";
import { deadlineFromLocal, minDeadlineLocal } from "./moderation-model";
import { adjustActiveAdmins, expandUserHref, normalizePage, permissionsFor, statesOf } from "./user-model";

/** @typedef {import("./user-model").PublicUser} PublicUser */

const INPUT =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground aria-invalid:border-danger";
const LINK_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-strong bg-background px-2.5 py-2 text-sm font-medium text-foreground transition-[background-color,border-color] hover:border-foreground hover:bg-surface lg:px-3";

/** @param {number} count @param {string} one @param {string} many */
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** @param {PublicUser} user */
const nameOf = (user) => (user.name === "" ? user.email : user.name);

/**
 * Botão de ação de um cartão: ícone e texto (o texto só some visualmente em telas estreitas; o nome
 * acessível começa pelo texto visível e cita o usuário).
 * @param {object} props
 * @param {(props: { className?: string }) => import("react").ReactElement} props.icon
 * @param {string} props.label
 * @param {string} props.name
 * @param {() => void} props.onClick
 * @param {string} props.id
 * @param {boolean} [props.disabled]
 * @param {string} [props.describedBy]
 */
function CardAction({ icon: IconComponent, label, name, onClick, id, disabled = false, describedBy: described }) {
  return (
    <Button id={id} variant="outline" onClick={onClick} disabled={disabled} aria-label={name} aria-describedby={described} title={label} className="px-2.5 lg:px-3">
      <IconComponent className="size-4 shrink-0" />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Button>
  );
}

/**
 * Diálogo de confirmação com envio: mostra "Enviando…" e, se a ação falha, a mensagem DENTRO do diálogo,
 * que continua aberto. Quem o usa o fecha quando `run` devolve `null`.
 * @param {object} props
 * @param {string} props.title
 * @param {import("react").ReactNode} props.description
 * @param {string} props.confirmLabel
 * @param {boolean} [props.danger]
 * @param {() => Promise<string | null>} props.run devolve a mensagem de erro, ou `null` se deu certo
 * @param {() => void} props.onClose
 * @param {import("react").ReactNode} [props.children]
 */
function ActionDialog({ title, description, confirmLabel, danger = false, run, onClose, children }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (pending) return;
    setPending(true);
    setError("");
    const failed = await run();
    setPending(false);
    if (failed) setError(failed);
  }
  return (
    <ConfirmDialog open danger={danger} title={title} description={description} confirmLabel={confirmLabel} pending={pending} onConfirm={confirm} onCancel={onClose}>
      {children}
      <div role="alert" className="empty:hidden">
        {error ? <p className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger wrap-anywhere">{error}</p> : null}
      </div>
    </ConfirmDialog>
  );
}

/**
 * @param {object} props
 * @param {{ data: unknown[], total: number, limit: number, offset: number }} props.initial a primeira página, como `GET /api/users` a devolve
 * @param {string} props.currentUserId o administrador da sessão (a regra da própria conta)
 * @param {number | null} [props.activeAdminCount] quantos administradores ativos existem (a regra do último); sem o número, o servidor decide
 * @param {string} [props.spaceHref] modelo do endereço do espaço público, com `{handle}`; o padrão é `/{handle}`
 * @param {string} [props.contentHref] modelo do endereço do conteúdo de um usuário, com `{id}`; o padrão é `/admin/usuarios/{id}/conteudo`
 */
export function UserTable({ initial, currentUserId, activeAdminCount = null, spaceHref = "/{handle}", contentHref = "/admin/usuarios/{id}/conteudo" }) {
  const base = useId();
  const [page, setPage] = useState(() => normalizePage(initial));
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [admins, setAdmins] = useState(activeAdminCount);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(/** @type {{ text: string, renamed: { from: string, to: string }[] } | null} */ (null));
  const [panel, setPanel] = useState(/** @type {{ kind: "create" } | { kind: "edit", id: string } | null} */ (null));
  const [password, setPassword] = useState(/** @type {{ value: string, email: string, kind: "created" | "reset" } | null} */ (null));
  const [dialog, setDialog] = useState(/** @type {{ kind: "ban" | "unban" | "reset" | "remove" | "avatar", id: string } | null} */ (null));
  const focusAfter = useRef(/** @type {string[]} */ ([]));

  useEffect(() => {
    const candidates = focusAfter.current;
    if (candidates.length === 0) return;
    focusAfter.current = [];
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (element && !(element instanceof HTMLButtonElement && element.disabled)) {
        element.focus();
        return;
      }
    }
  });

  /** @param {string} kind @param {string} [id] */
  const domId = (kind, id = "") => `${base}-${kind}${id ? `-${id}` : ""}`;

  /** @param {string} id */
  const userById = (id) => page.users.find((user) => user.id === id) ?? null;

  /**
   * Lê uma página da lista.
   * @param {{ search?: string, offset?: number }} [to]
   * @returns {Promise<boolean>}
   */
  async function load({ search: query = applied, offset = page.offset } = {}) {
    setLoading(true);
    const result = await listUsers({ search: query, limit: page.limit, offset });
    setLoading(false);
    if (!result.ok) {
      setInfo("");
      setError(result.message);
      return false;
    }
    // Uma página que ficou vazia (o último da página foi excluído) volta à anterior.
    if (result.users.length === 0 && offset > 0) return load({ search: query, offset: Math.max(0, offset - page.limit) });
    setPage({ users: result.users, total: result.total, limit: result.limit, offset: result.offset });
    setApplied(query);
    return true;
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function submitSearch(event) {
    event.preventDefault();
    setInfo("");
    setError("");
    setSummary(null);
    await load({ search, offset: 0 });
  }

  /** @param {number} offset */
  async function goTo(offset) {
    setInfo("");
    setError("");
    focusAfter.current = [domId("contagem")];
    await load({ offset });
  }

  /** @param {import("./user-client").Failure} failure */
  function fail(failure) {
    setInfo("");
    setError(failure.message);
    if (failure.kind === "not-found") void load();
  }

  function closeDialog() {
    setDialog(null);
  }

  // -------------------------------------------------------------------------------------------
  // Criar e editar
  // -------------------------------------------------------------------------------------------

  /** @param {{ user: PublicUser | null, temporaryPassword: string | null }} result */
  async function formDone({ user, temporaryPassword }) {
    const editing = panel?.kind === "edit" ? userById(panel.id) : null;
    setPanel(null);
    setSummary(null);
    setError("");
    if (user) setAdmins((count) => adjustActiveAdmins(count, editing ?? { ...user, role: "user", suspended: true }, user));
    await load();
    if (panel?.kind === "create") {
      if (user && temporaryPassword) {
        setPassword({ value: temporaryPassword, email: user.email, kind: "created" });
        setInfo("");
      } else {
        setInfo(`A conta de ${user ? nameOf(user) : "o usuário"} foi criada.`);
        focusAfter.current = [domId("novo")];
      }
    } else {
      setInfo(`Os dados de ${user ? nameOf(user) : "o usuário"} foram salvos.`);
      focusAfter.current = [domId("edit", user?.id)];
    }
  }

  function closePanel() {
    const editingId = panel?.kind === "edit" ? panel.id : null;
    setPanel(null);
    focusAfter.current = [editingId ? domId("edit", editingId) : domId("novo")];
  }

  // -------------------------------------------------------------------------------------------
  // Diálogos de ação
  // -------------------------------------------------------------------------------------------

  const target = dialog ? userById(dialog.id) : null;

  return (
    <section aria-label="Usuários" aria-busy={loading} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <form role="search" onSubmit={submitSearch} className="flex min-w-0 flex-1 basis-64 flex-wrap items-end gap-2">
          <Field id={domId("busca")} label="Buscar por e-mail ou nome" className="min-w-0 flex-1 basis-48">
            <input
              id={domId("busca")}
              type="search"
              autoComplete="off"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={INPUT}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={loading}>
            Buscar
          </Button>
          {applied !== "" ? (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                void load({ search: "", offset: 0 });
              }}
            >
              Limpar a busca
            </Button>
          ) : null}
        </form>
        <Button id={domId("novo")} onClick={() => { setPanel({ kind: "create" }); setSummary(null); }} disabled={panel?.kind === "create"}>
          <PlusIcon className="size-4 shrink-0" />
          Novo usuário
        </Button>
      </div>

      <div role="alert" className="empty:hidden">
        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span className="wrap-anywhere">
              {error}
              {error.startsWith("Sua sessão expirou") ? (
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
        {info ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="wrap-anywhere">{info}</span>
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-3 text-sm">
          <p className="font-medium wrap-anywhere">{summary.text}</p>
          {summary.renamed.length > 0 ? (
            <>
              <p>Itens renomeados na raiz do destino, por já existir o mesmo endereço (slug):</p>
              <ul className="list-disc pl-5">
                {summary.renamed.map((item) => (
                  <li key={`${item.from}-${item.to}`} className="wrap-anywhere">
                    <code>{item.from}</code> passou a <code>{item.to}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div>
            <Button variant="outline" onClick={() => { setSummary(null); focusAfter.current = [domId("novo")]; }}>
              Fechar o resumo
            </Button>
          </div>
        </div>
      ) : null}

      {password ? (
        <ProvisionalPassword
          password={password.value}
          email={password.email}
          kind={password.kind}
          onClose={() => {
            setPassword(null);
            focusAfter.current = [domId("novo")];
          }}
        />
      ) : null}

      {panel ? (
        <section aria-labelledby={domId("form-titulo")} className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface p-4">
          <h2 id={domId("form-titulo")} className="text-lg font-semibold">
            {panel.kind === "create" ? "Novo usuário" : "Editar usuário"}
          </h2>
          <UserForm
            key={panel.kind === "edit" ? panel.id : "novo"}
            mode={panel.kind}
            user={panel.kind === "edit" ? (userById(panel.id) ?? undefined) : undefined}
            currentUserId={currentUserId}
            activeAdminCount={admins}
            onDone={formDone}
            onCancel={closePanel}
          />
        </section>
      ) : null}

      <p id={domId("contagem")} tabIndex={-1} className="text-sm text-muted outline-none">
        {page.total === 0
          ? applied === ""
            ? "Nenhum usuário."
            : "Nenhum usuário encontrado para esta busca."
          : `Mostrando ${page.offset + 1} a ${page.offset + page.users.length} de ${plural(page.total, "usuário", "usuários")}.`}
      </p>

      <ul className="flex flex-col gap-3">
        {page.users.map((user) => {
          const permissions = permissionsFor(user, { currentUserId, activeAdminCount: admins });
          const note = permissions.suspendReason ?? permissions.deleteReason;
          const noteId = domId("nota", user.id);
          const name = nameOf(user);
          return (
            <li key={user.id} data-user-id={user.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                {/* O nome está ao lado: o avatar é decorativo (`alt` vazio); sem imagem, as iniciais. */}
                <Avatar name={name} src={mediaUrlOfId(user.avatarImageId)} size={40} decorative />
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <UserIcon className="size-4 shrink-0" />
                    <span className="font-semibold wrap-anywhere">{name}</span>
                    <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-semibold">{user.role === "admin" ? "Administrador" : "Usuário"}</span>
                    {permissions.self ? <span className="rounded-full border border-foreground px-2 py-0.5 text-xs font-semibold">Você</span> : null}
                  </p>
                  <p className="text-sm text-muted break-all">{user.email}</p>
                  <p className="text-sm wrap-anywhere">
                    {user.handle ? (
                      <>
                        Espaço:{" "}
                        <Link href={expandUserHref(spaceHref, user)} className="font-medium underline underline-offset-2">
                          /{user.handle}
                        </Link>
                      </>
                    ) : (
                      <span className="text-muted">Sem handle: sem espaço público.</span>
                    )}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-start gap-1.5 text-xs">
                  {statesOf(user).map((state) => (
                    <span
                      key={state.key}
                      data-state={state.key}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                        state.key === "suspended" ? "border-foreground bg-foreground text-background" : "border-border-strong bg-background text-foreground"
                      }`}
                    >
                      {state.key === "suspended" ? <WarningIcon className="size-3.5 shrink-0" /> : state.key === "pending" ? <KeyIcon className="size-3.5 shrink-0" /> : <CheckCircleIcon className="size-3.5 shrink-0" />}
                      {state.label}
                      {state.detail ? ` (${state.detail})` : ""}
                    </span>
                  ))}
                  {user.suspended && user.banReason ? <span className="max-w-full text-muted wrap-anywhere">Motivo: {user.banReason}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Ações de ${name}`}>
                <CardAction id={domId("edit", user.id)} icon={PencilIcon} label="Editar" name={`Editar: ${name}`} onClick={() => { setPanel({ kind: "edit", id: user.id }); setSummary(null); }} />
                <CardAction id={domId("reset", user.id)} icon={KeyIcon} label="Redefinir a senha" name={`Redefinir a senha: ${name}`} onClick={() => setDialog({ kind: "reset", id: user.id })} />
                {user.suspended ? (
                  <CardAction id={domId("unban", user.id)} icon={CheckCircleIcon} label="Reativar" name={`Reativar: ${name}`} onClick={() => setDialog({ kind: "unban", id: user.id })} />
                ) : (
                  <CardAction
                    id={domId("ban", user.id)}
                    icon={WarningIcon}
                    label="Suspender"
                    name={`Suspender: ${name}`}
                    disabled={!permissions.canSuspend}
                    describedBy={permissions.canSuspend ? undefined : noteId}
                    onClick={() => setDialog({ kind: "ban", id: user.id })}
                  />
                )}
                <CardAction
                  id={domId("remove", user.id)}
                  icon={TrashIcon}
                  label="Excluir"
                  name={`Excluir: ${name}`}
                  disabled={!permissions.canDelete}
                  describedBy={permissions.canDelete ? undefined : noteId}
                  onClick={() => setDialog({ kind: "remove", id: user.id })}
                />
                {permissions.canRemoveAvatar ? (
                  <CardAction id={domId("avatar", user.id)} icon={ImageIcon} label="Remover avatar" name={`Remover avatar: ${name}`} onClick={() => setDialog({ kind: "avatar", id: user.id })} />
                ) : null}
                <Link href={expandUserHref(contentHref, user)} aria-label={`Ver o conteúdo: ${name}`} title="Ver o conteúdo" className={LINK_BUTTON}>
                  <DocumentIcon className="size-4 shrink-0" />
                  <span className="sr-only lg:not-sr-only">Ver o conteúdo</span>
                </Link>
              </div>
              {note ? (
                <p id={noteId} className="flex items-start gap-1.5 text-xs text-muted">
                  <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
                  {note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {page.total > page.limit ? (
        <nav aria-label="Páginas de usuários" className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={loading || page.offset === 0} onClick={() => goTo(Math.max(0, page.offset - page.limit))}>
            Anterior
          </Button>
          <span className="text-sm text-muted">
            Página {Math.floor(page.offset / page.limit) + 1} de {Math.ceil(page.total / page.limit)}
          </span>
          <Button variant="outline" disabled={loading || page.offset + page.limit >= page.total} onClick={() => goTo(page.offset + page.limit)}>
            Próxima
          </Button>
        </nav>
      ) : null}

      {target && dialog?.kind === "ban" ? (
        <BanDialog
          user={target}
          onClose={closeDialog}
          onDone={async (updated) => {
            setAdmins((count) => adjustActiveAdmins(count, target, updated ?? { ...target, suspended: true }));
            closeDialog();
            setSummary(null);
            await load();
            setInfo(`${nameOf(target)} foi suspenso(a). As sessões foram encerradas e a pessoa foi notificada.`);
            focusAfter.current = [domId("unban", target.id), domId("edit", target.id)];
          }}
          onFail={(failure) => {
            if (failure.kind === "last-admin") setAdmins(1);
            if (failure.kind === "not-found") {
              closeDialog();
              fail(failure);
            }
          }}
        />
      ) : null}

      {target && dialog?.kind === "avatar" ? (
        <AvatarDialog
          user={target}
          onClose={closeDialog}
          onDone={() => {
            // O avatar sai da linha na hora, sem reler a lista (que seria uma segunda ida ao servidor).
            setPage((current) => ({ ...current, users: current.users.map((user) => (user.id === target.id ? { ...user, avatarImageId: null } : user)) }));
            closeDialog();
            setSummary(null);
            setError("");
            setInfo(`O avatar de ${nameOf(target)} foi removido. A pessoa foi notificada.`);
            focusAfter.current = [domId("edit", target.id)];
          }}
          onGone={(failure) => {
            closeDialog();
            fail(failure);
            // "Sem avatar" (já removido em outro lugar): a lista é relida para mostrar o estado verdadeiro.
            void load();
          }}
        />
      ) : null}

      {target && dialog?.kind === "unban" ? (
        <ActionDialog
          title={`Reativar ${nameOf(target)}?`}
          description="A pessoa volta a poder entrar, o espaço público volta ao ar e ela é notificada."
          confirmLabel="Reativar"
          onClose={closeDialog}
          run={async () => {
            const result = await unbanUser(target.id);
            if (!result.ok) {
              if (result.kind === "not-found") {
                closeDialog();
                fail(result);
                return null;
              }
              return result.message;
            }
            setAdmins((count) => adjustActiveAdmins(count, target, result.user ?? { ...target, suspended: false }));
            closeDialog();
            setSummary(null);
            await load();
            setInfo(`${nameOf(target)} foi reativado(a).`);
            focusAfter.current = [domId("ban", target.id), domId("edit", target.id)];
            return null;
          }}
        />
      ) : null}

      {target && dialog?.kind === "reset" ? (
        <ActionDialog
          danger
          title={`Redefinir a senha de ${nameOf(target)}?`}
          description="A senha atual deixa de valer, todas as sessões da pessoa são encerradas e ela precisará trocar a senha provisória no próximo acesso. A senha nova é mostrada uma única vez."
          confirmLabel="Redefinir a senha"
          onClose={closeDialog}
          run={async () => {
            const result = await resetPassword(target.id);
            if (!result.ok) {
              if (result.kind === "not-found") {
                closeDialog();
                fail(result);
                return null;
              }
              return result.message;
            }
            closeDialog();
            setSummary(null);
            setError("");
            await load();
            if (result.temporaryPassword) {
              setPassword({ value: result.temporaryPassword, email: target.email, kind: "reset" });
              setInfo("");
            } else {
              setInfo(`A senha de ${nameOf(target)} foi redefinida.`);
            }
            return null;
          }}
        />
      ) : null}

      {target && dialog?.kind === "remove" ? (
        <RemoveDialog
          user={target}
          candidates={page.users}
          onClose={closeDialog}
          onDone={async (outcome) => {
            setAdmins((count) => adjustActiveAdmins(count, target, null));
            closeDialog();
            setError("");
            const where = outcome.content === "transferred" ? `O conteúdo (${plural(outcome.roots, "item na raiz", "itens na raiz")}) foi transferido.` : outcome.content === "deleted" ? "O conteúdo foi excluído junto." : "A conta não tinha conteúdo.";
            setSummary({ text: `${nameOf(target)} foi excluído(a). ${where}`, renamed: outcome.renamed });
            setInfo("");
            focusAfter.current = [domId("novo")];
            await load();
          }}
          onGone={(failure) => {
            closeDialog();
            fail(failure);
          }}
          onLastAdmin={() => setAdmins(1)}
        />
      ) : null}
    </section>
  );
}

/**
 * Suspensão (RN23): motivo obrigatório e prazo opcional, no futuro.
 * @param {object} props
 * @param {PublicUser} props.user
 * @param {() => void} props.onClose
 * @param {(user: PublicUser | null) => Promise<void> | void} props.onDone
 * @param {(failure: import("./user-client").Failure) => void} props.onFail
 */
function BanDialog({ user, onClose, onDone, onFail }) {
  const id = useId();
  const [deadline, setDeadline] = useState("");
  const [deadlineError, setDeadlineError] = useState("");
  const deadlineRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const fieldId = `${id}-prazo`;
  return (
    <ModerationDialog
      open
      danger
      title={`Suspender ${nameOf(user)}`}
      description="A pessoa não poderá entrar, as sessões dela serão encerradas e o espaço público sairá do ar. O conteúdo é preservado."
      confirmLabel="Suspender"
      ownerName={nameOf(user)}
      onCancel={onClose}
      onConfirm={async (reason) => {
        const { iso, error } = deadlineFromLocal(deadline);
        setDeadlineError(error ?? "");
        if (error) {
          deadlineRef.current?.focus();
          return null;
        }
        const result = await banUser(user.id, { reason, expiresAt: iso });
        if (result.ok) {
          await onDone(result.user);
          return null;
        }
        onFail(result);
        return result.fields?.reason ?? result.fields?.expiresAt ?? result.message;
      }}
    >
      <Field id={fieldId} label="Prazo (opcional)" hint="Sem prazo, a suspensão dura até você reativar a conta. Com prazo, ela termina sozinha na data." error={deadlineError}>
        <input
          ref={deadlineRef}
          id={fieldId}
          type="datetime-local"
          min={minDeadlineLocal()}
          value={deadline}
          onChange={(event) => {
            setDeadline(event.target.value);
            if (deadlineError) setDeadlineError("");
          }}
          aria-invalid={deadlineError ? "true" : undefined}
          aria-describedby={describedBy(fieldId, { hint: true, error: deadlineError })}
          className={INPUT}
        />
      </Field>
    </ModerationDialog>
  );
}

/**
 * Remoção do avatar de outro usuário (RF36, RN19, RN26): motivo obrigatório (o dono é notificado e o
 * vê). Só apaga a imagem; as iniciais do nome passam a aparecer no lugar.
 * @param {object} props
 * @param {PublicUser} props.user
 * @param {() => void} props.onClose
 * @param {() => void} props.onDone
 * @param {(failure: import("./user-client").Failure) => void} props.onGone o usuário já não tem avatar (ou não existe mais)
 */
function AvatarDialog({ user, onClose, onDone, onGone }) {
  return (
    <ModerationDialog
      open
      danger
      title={`Remover o avatar de ${nameOf(user)}`}
      description="A imagem é apagada e as iniciais do nome passam a aparecer no lugar. A pessoa pode enviar outro avatar quando quiser."
      confirmLabel="Remover avatar"
      ownerName={nameOf(user)}
      onCancel={onClose}
      onConfirm={async (reason) => {
        const result = await removeAvatar(user.id, reason);
        if (result.ok) {
          onDone();
          return null;
        }
        if (result.kind === "no-avatar" || result.kind === "not-found") {
          onGone(result);
          return null;
        }
        return result.fields?.reason ?? result.message;
      }}
    />
  );
}

/**
 * Exclusão de um usuário (RN24), em até dois passos: a tentativa sem escolha (um usuário sem conteúdo
 * sai na hora) e, se o servidor responde 409 `USER_HAS_CONTENT`, a ESCOLHA do destino do conteúdo:
 * transferir a outro usuário (e o que fazer com um slug repetido na raiz dele) ou excluir junto, este
 * com confirmação explícita (digitar o e-mail da conta). Nada é pré-selecionado.
 * @param {object} props
 * @param {PublicUser} props.user
 * @param {PublicUser[]} props.candidates usuários já conhecidos (usados enquanto a lista completa carrega)
 * @param {() => void} props.onClose
 * @param {(outcome: { content: "none" | "transferred" | "deleted", roots: number, renamed: { from: string, to: string }[] }) => Promise<void> | void} props.onDone
 * @param {(failure: import("./user-client").Failure) => void} props.onGone o usuário já não existe
 * @param {() => void} props.onLastAdmin o servidor disse que é o último administrador
 */
function RemoveDialog({ user, candidates, onClose, onDone, onGone, onLastAdmin }) {
  const id = useId();
  const [step, setStep] = useState(/** @type {"ask" | "choose"} */ ("ask"));
  const [choice, setChoice] = useState(/** @type {"" | "transfer" | "delete"} */ (""));
  const [destination, setDestination] = useState("");
  const [onConflict, setOnConflict] = useState(/** @type {"fail" | "rename"} */ ("fail"));
  const [typed, setTyped] = useState("");
  const [destinations, setDestinations] = useState(/** @type {PublicUser[] | null} */ (null));
  const [problem, setProblem] = useState("");

  // Ao entrar no passo da escolha, carrega os possíveis destinos (até 100; a lista da página é só uma parte).
  useEffect(() => {
    if (step !== "choose") return undefined;
    let current = true;
    void listUsers({ limit: 100 }).then((result) => {
      if (current) setDestinations(result.ok ? result.users : candidates);
    });
    return () => {
      current = false;
    };
  }, [step, candidates]);

  const others = (destinations ?? candidates).filter((other) => other.id !== user.id);

  /** @returns {Promise<string | null>} */
  async function run() {
    setProblem("");
    if (step === "ask") {
      const result = await deleteUser(user.id);
      if (result.ok) {
        await onDone(result);
        return null;
      }
      if (result.kind === "has-content") {
        setStep("choose");
        return null;
      }
      if (result.kind === "not-found") {
        onGone(result);
        return null;
      }
      if (result.kind === "last-admin") onLastAdmin();
      return result.message;
    }
    if (choice === "") return "Escolha o que fazer com o conteúdo: transferi-lo a outro usuário ou excluí-lo junto.";
    if (choice === "transfer" && destination === "") return "Escolha o usuário que receberá o conteúdo.";
    if (choice === "delete" && typed.trim().toLowerCase() !== user.email.toLowerCase()) return "Para excluir o conteúdo junto, digite o e-mail da conta, como está acima.";
    const result = await deleteUser(user.id, choice === "transfer" ? { content: "transfer", to: destination, onConflict } : { content: "delete" });
    if (result.ok) {
      await onDone(result);
      return null;
    }
    if (result.kind === "not-found") {
      onGone(result);
      return null;
    }
    if (result.kind === "last-admin") onLastAdmin();
    if (result.kind === "slug-conflict" && result.conflicts && result.conflicts.length > 0) {
      return `${result.message} Endereços em conflito: ${result.conflicts.join(", ")}.`;
    }
    return result.message;
  }

  if (step === "ask") {
    return (
      <ActionDialog
        key="ask"
        danger
        title={`Excluir ${nameOf(user)}?`}
        description="A conta e as sessões saem para sempre. Se a pessoa tiver conteúdo, você escolhe o destino dele na próxima etapa; nada é apagado antes disso."
        confirmLabel="Excluir"
        onClose={onClose}
        run={run}
      />
    );
  }

  return (
    <ActionDialog
      key="choose"
      danger
      title={`O que fazer com o conteúdo de ${nameOf(user)}?`}
      description="Esta conta tem conteúdo. Escolha o destino dele: nada é excluído antes da sua escolha."
      confirmLabel="Excluir a conta"
      onClose={onClose}
      run={async () => {
        const failed = await run();
        if (failed) setProblem(failed);
        return failed;
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Destino do conteúdo</legend>
        <div className="flex items-start gap-2">
          <input id={`${id}-transferir`} type="radio" name={`${id}-destino`} checked={choice === "transfer"} onChange={() => setChoice("transfer")} className="mt-1 size-5 shrink-0 cursor-pointer" />
          <label htmlFor={`${id}-transferir`} className="text-sm font-medium">
            Transferir o conteúdo para outro usuário
          </label>
        </div>
        {choice === "transfer" ? (
          <div className="ml-7 flex flex-col gap-3">
            <Field id={`${id}-para`} label="Usuário de destino" hint={destinations === null ? "Carregando os usuários…" : others.length === 0 ? "Não há outro usuário." : undefined}>
              <select id={`${id}-para`} value={destination} onChange={(event) => setDestination(event.target.value)} className={INPUT}>
                <option value="">Escolha um usuário</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {nameOf(other)} ({other.email})
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Se algum endereço (slug) já existir na raiz do destino</legend>
              <div className="flex items-start gap-2">
                <input id={`${id}-recusar`} type="radio" name={`${id}-conflito`} checked={onConflict === "fail"} onChange={() => setOnConflict("fail")} className="mt-1 size-5 shrink-0 cursor-pointer" />
                <label htmlFor={`${id}-recusar`} className="text-sm">
                  Recusar tudo (nada é alterado)
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input id={`${id}-renomear`} type="radio" name={`${id}-conflito`} checked={onConflict === "rename"} onChange={() => setOnConflict("rename")} className="mt-1 size-5 shrink-0 cursor-pointer" />
                <label htmlFor={`${id}-renomear`} className="text-sm">
                  Renomear os itens em conflito (por exemplo, <code>calculo</code> vira <code>calculo-2</code>)
                </label>
              </div>
            </fieldset>
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <input id={`${id}-excluir`} type="radio" name={`${id}-destino`} checked={choice === "delete"} onChange={() => setChoice("delete")} className="mt-1 size-5 shrink-0 cursor-pointer" />
          <label htmlFor={`${id}-excluir`} className="text-sm font-medium">
            Excluir o conteúdo junto com a conta
          </label>
        </div>
        {choice === "delete" ? (
          <div className="ml-7 flex flex-col gap-2">
            <p className="flex items-start gap-2 text-sm font-medium text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              Todo o conteúdo, inclusive os rascunhos, será apagado para sempre.
            </p>
            <Field id={`${id}-digite`} label={`Para confirmar, digite o e-mail da conta: ${user.email}`}>
              <input
                id={`${id}-digite`}
                value={typed}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
                aria-invalid={problem.startsWith("Para excluir") ? "true" : undefined}
                className={INPUT}
              />
            </Field>
          </div>
        ) : null}
      </fieldset>
    </ActionDialog>
  );
}

