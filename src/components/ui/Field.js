// Campo de formulário acessível (primitivo de interface; Cap. 5 §5.11): rótulo visível ligado ao
// controle, texto de ajuda e mensagem de erro. O controle é passado como filho e deve usar o
// mesmo `id` e o `aria-describedby` devolvido por `describedBy`, para que o leitor de tela leia
// a ajuda e o erro junto do campo. Só tokens de tema (RF19).

/**
 * Valor de `aria-describedby` de um controle: a ajuda e o erro presentes, nesta ordem.
 * @param {string} id identificador do controle
 * @param {{ hint?: import("react").ReactNode, error?: string | undefined }} parts
 * @returns {string | undefined}
 */
export function describedBy(id, { hint, error }) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/**
 * @param {object} props
 * @param {string} props.id identificador do controle (o `htmlFor` do rótulo)
 * @param {string} props.label texto do rótulo
 * @param {import("react").ReactNode} [props.hint] texto de ajuda, abaixo do campo
 * @param {string} [props.error] mensagem de erro; vira um alerta, em vermelho e com ícone no texto
 * @param {import("react").ReactNode} props.children o controle
 * @param {string} [props.className] classes de leiaute
 */
export function Field({ id, label, hint, error, children, className = "" }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`.trim()}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          <span className="sr-only">Erro: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
