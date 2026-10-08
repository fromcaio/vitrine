// Rodapé comum dos formulários de aparência e de configuração (RF31): o erro geral (com o atalho do
// login em outra aba quando a sessão expirou), o aviso de "nada a salvar" ou de "salvo", o botão de
// envio e o lembrete de alterações pendentes. Componente de apresentação: não conhece a API.
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";
import { MESSAGES } from "./appearance-model";

/**
 * @param {object} props
 * @param {string} props.general erro geral (vazio = nenhum)
 * @param {boolean} props.nothing o autor tentou salvar sem alterar nada
 * @param {string} props.savedNotice texto de "salvo às HH:MM" (vazio = nada salvo ainda)
 * @param {boolean} props.dirty há alterações ainda não gravadas
 * @param {boolean} props.pending envio em andamento
 * @param {string} props.submitLabel texto do botão
 */
export function SiteFormFooter({ general, nothing, savedNotice, dirty, pending, submitLabel }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div role="alert" className="empty:hidden">
        {general ? (
          <p className="flex items-start gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {general}
              {general === MESSAGES.unauthenticated ? (
                <>
                  {" "}
                  <Link href="/login" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                    Abrir o login em outra aba
                  </Link>
                  .
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>
      <div role="status" className="empty:hidden">
        {nothing ? (
          <p className="text-sm">{MESSAGES.nothingToSave}</p>
        ) : savedNotice && !dirty ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            {savedNotice}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        <p className="text-sm text-muted">{dirty ? "Há alterações ainda não gravadas." : "Nenhuma alteração pendente."}</p>
      </div>
    </div>
  );
}
