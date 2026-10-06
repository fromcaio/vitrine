// Visão geral do painel (RF03, RF28, RF29, RF33; RN20, RN25; M10): quem é a sessão, os números do
// espaço (conteúdos de quanto da cota, publicados, rascunhos, notificações não lidas), os atalhos para
// as seções e o aviso de quem ainda não tem `handle` (sem ele, o espaço público não existe, RN20). É um
// componente de Servidor: não lê o banco nem a sessão, recebe tudo pronto do Core. Todas as props além
// de `user` são opcionais: sem `counts`, mostra só a identificação e os atalhos.
//
// Um atalho cuja página ainda não existe aparece desabilitado, com "em breve" (como o menu): o Core
// diz quais existem em `availablePaths`, a mesma lista que entrega ao menu.
import Link from "next/link";
import { AlertIcon } from "@/components/ui/icons";

/** Atalhos, na ordem do menu. `adminOnly`: só para o administrador. */
const SHORTCUTS = [
  { title: "Conteúdo", href: "/admin/conteudo", description: "Árvore de coleções e documentos: criar, editar, mover, publicar e excluir." },
  { title: "Aparência", href: "/admin/aparencia", description: "Nome, logotipo, cores (clara e noturna) e links sociais do seu espaço." },
  { title: "Notificações", href: "/admin/notificacoes", description: "Avisos do sistema e da moderação sobre o seu conteúdo." },
  { title: "Perfil", href: "/admin/perfil", description: "Seu nome de exibição, e-mail, endereço e papel." },
  { title: "Trocar a senha", href: "/admin/senha", description: "Defina uma nova senha; as outras sessões são encerradas." },
  { title: "Configurações", href: "/admin/configuracoes", description: "Identidade do site, paleta de cores e links sociais do portal.", adminOnly: true },
  { title: "Usuários", href: "/admin/usuarios", description: "Criar contas, redefinir senhas, suspender e excluir usuários.", adminOnly: true },
];

const CARD = "rounded-lg border border-border bg-surface p-4";

/** @param {number} count @param {string} one @param {string} many */
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * @param {object} props
 * @param {{ name: string, email: string, handle?: string | null, role?: "admin" | "user" }} props.user usuário da sessão
 * @param {{ contents: number, published: number, drafts: number }} [props.counts] os conteúdos do próprio usuário, em cada estado
 * @param {{ maxContents: number }} [props.limits] a cota vigente (RN25)
 * @param {number} [props.unreadCount] notificações não lidas
 * @param {string | null} [props.spaceHref] endereço do espaço público; sem ele (ou sem handle), não há link
 * @param {readonly string[]} [props.availablePaths] páginas do painel que já existem; o padrão é só `/admin`
 */
export function AdminOverview({ user, counts, limits, unreadCount, spaceHref = null, availablePaths = ["/admin"] }) {
  const admin = user.role === "admin";
  const shortcuts = SHORTCUTS.filter((item) => !item.adminOnly || admin);
  const maxContents = limits?.maxContents;
  const percent = counts && maxContents ? Math.min(100, Math.round((counts.contents / maxContents) * 100)) : null;
  const noHandle = !user.handle;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="mt-2 break-words text-muted">
          Sessão iniciada como <strong className="font-semibold text-foreground">{user.name}</strong> ({user.email}).
        </p>
      </div>

      {noHandle ? (
        <div className="flex items-start gap-2 rounded-md border-2 border-foreground bg-surface p-4 text-sm">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <p>
            Você ainda não tem um <strong>handle</strong>, o endereço do seu espaço, então o seu espaço público <strong>não existe</strong>: o que você
            publicar não aparece para os leitores. Peça ao administrador para definir um handle para a sua conta.
          </p>
        </div>
      ) : spaceHref ? (
        <p className="text-sm">
          Seu espaço público:{" "}
          <Link href={spaceHref} className="font-medium underline underline-offset-2">
            /{user.handle}
          </Link>
          .
        </p>
      ) : null}

      {counts ? (
        <section aria-labelledby="numeros-titulo" className="flex flex-col gap-3">
          <h2 id="numeros-titulo" className="text-lg font-semibold">
            Seu espaço em números
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={CARD}>
              <dt className="text-sm text-muted">Conteúdos</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {counts.contents}
                {maxContents ? <span className="text-base font-normal text-muted"> de {maxContents}</span> : null}
              </dd>
              {percent !== null ? (
                <>
                  <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full border border-border-strong bg-background">
                    <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{percent}% da cota usada.</p>
                </>
              ) : null}
            </div>
            <div className={CARD}>
              <dt className="text-sm text-muted">Publicados</dt>
              <dd className="mt-1 text-2xl font-semibold">{counts.published}</dd>
            </div>
            <div className={CARD}>
              <dt className="text-sm text-muted">Rascunhos</dt>
              <dd className="mt-1 text-2xl font-semibold">{counts.drafts}</dd>
            </div>
            {typeof unreadCount === "number" ? (
              <div className={CARD}>
                <dt className="text-sm text-muted">Notificações não lidas</dt>
                <dd className="mt-1 text-2xl font-semibold">{unreadCount}</dd>
              </div>
            ) : null}
          </dl>
          {maxContents && counts.contents >= maxContents ? (
            <p className="text-sm font-medium">Você atingiu o limite de {plural(maxContents, "conteúdo", "conteúdos")}. Exclua algum para criar outro.</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="atalhos-titulo" className="flex flex-col gap-3">
        <h2 id="atalhos-titulo" className="text-lg font-semibold">
          Atalhos
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {shortcuts.map(({ title, href, description }) => {
            const available = availablePaths.includes(href);
            return (
              <li key={href} className={CARD}>
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  {available ? (
                    <Link href={href} className="underline underline-offset-2">
                      {title}
                    </Link>
                  ) : (
                    <>
                      <span>{title}</span>
                      <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-normal whitespace-nowrap text-muted">em breve</span>
                    </>
                  )}
                </h3>
                <p className="mt-2 text-sm text-muted">{description}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
