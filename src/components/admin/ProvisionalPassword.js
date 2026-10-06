"use client";

// Senha provisória, mostrada UMA ÚNICA VEZ (RF27, RN21; ADR-029): o painel que entrega ao administrador
// a senha que o servidor gerou ao criar a conta ou ao redefinir a senha (`data.temporaryPassword`).
//
// Cuidados, porque a senha é um segredo de uma vez só:
//   - não vai a um `<input>` (o gerenciador de senhas do navegador a salvaria): é texto em um painel;
//   - não vai a URL, `localStorage`, `sessionStorage`, registro do console nem atributo do DOM, e a
//     região viva (`role="status"`) só diz "Senha copiada", nunca repete a senha;
//   - "Copiar" usa a área de transferência, com a confirmação para leitor de tela;
//   - ao fechar, quem usa o painel apaga a senha do estado (o componente só recebe `password` por
//     prop e não guarda cópia); recarregar a página não a traz de volta, porque nada a guardou.
// Só tokens de tema.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AlertIcon, CheckCircleIcon, KeyIcon } from "@/components/ui/icons";

/**
 * @param {object} props
 * @param {string} props.password a senha provisória (nunca vazia); só quem a recebeu da API a passa
 * @param {string} props.email o e-mail da conta, para dizer de quem é a senha
 * @param {"created" | "reset"} [props.kind] conta criada agora, ou senha redefinida
 * @param {() => void} props.onClose o administrador anotou a senha: quem usa o painel a tira do estado
 */
export function ProvisionalPassword({ password, email, kind = "created", onClose }) {
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const [copied, setCopied] = useState(/** @type {"" | "ok" | "fail"} */ (""));

  // Leva o foco ao título: o leitor de tela o anuncia e o administrador vê o aviso antes da senha.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <section aria-labelledby="senha-provisoria-titulo" className="flex flex-col gap-3 rounded-lg border-2 border-foreground bg-surface p-4">
      <h2 id="senha-provisoria-titulo" ref={headingRef} tabIndex={-1} className="flex items-start gap-2 text-lg font-semibold outline-none wrap-anywhere">
        <KeyIcon className="mt-1 size-5 shrink-0" />
        {kind === "created" ? "Conta criada: senha provisória de " : "Senha redefinida: senha provisória de "}
        {email}
      </h2>
      <p className="flex items-start gap-2 text-sm font-medium">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          Anote ou copie a senha agora: ela é mostrada <strong>uma única vez</strong> e <strong>não poderá ser vista de novo</strong>. Entregue-a à pessoa por
          um canal seguro. Ela precisará trocá-la no primeiro acesso.
        </span>
      </p>
      <p className="rounded-md border border-border-strong bg-background px-3 py-2 text-center">
        <span className="sr-only">Senha provisória: </span>
        <code translate="no" className="font-mono text-xl tracking-wider break-all select-all">
          {password}
        </code>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={copy}>
          Copiar a senha
        </Button>
        <Button onClick={onClose}>Já anotei a senha, fechar</Button>
      </div>
      <div role="status" className="empty:hidden">
        {copied === "ok" ? (
          <p className="flex items-start gap-2 text-sm font-medium">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            Senha copiada para a área de transferência.
          </p>
        ) : null}
        {copied === "fail" ? <p className="text-sm font-medium text-danger">Não foi possível copiar. Selecione a senha acima e copie à mão.</p> : null}
      </div>
    </section>
  );
}
