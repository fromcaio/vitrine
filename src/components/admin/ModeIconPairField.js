"use client";

// Seletor do par de ícones do botão de modo claro/escuro (D-35, ADR-037): quatro opções, cada uma com
// a PRÉ-VISUALIZAÇÃO dos dois ícones (o do modo claro e o do escuro) e o nome em texto. É a escolha do
// administrador para o site inteiro (`modeIconPair`). Grupo de botões de opção (`radio`) nativos, de
// modo que o teclado (setas) e o leitor de tela funcionam sem código extra. Só tokens de tema.
import { MODE_ICON_PAIRS } from "@/components/layout/mode-icon-names";
import { MODE_ICON_PAIR_OPTIONS } from "@/components/layout/mode-icon-pairs";

/**
 * @param {object} props
 * @param {string} props.id prefixo dos ids (o do primeiro botão de opção é `${id}`, para o foco do erro)
 * @param {string} props.value o par escolhido
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.error] mensagem de erro (do servidor)
 */
export function ModeIconPairField({ id, value, onChange, error }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? `${id}-error` : `${id}-hint`}>
      <legend className="text-sm font-medium">Ícones do botão de modo claro/escuro</legend>
      <p id={`${id}-hint`} className="text-sm text-muted">
        Vale para o site inteiro: o portal, os espaços e o painel. Em cada opção, o primeiro ícone é o do modo claro e o segundo, o do modo escuro.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODE_ICON_PAIRS.map((pair, index) => {
          const { label, Light, Dark } = MODE_ICON_PAIR_OPTIONS[pair];
          const checked = value === pair;
          return (
            <label
              key={pair}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                checked ? "border-foreground bg-surface" : "border-border hover:border-border-strong"
              }`}
            >
              <input
                id={index === 0 ? id : `${id}-${pair}`}
                type="radio"
                name={`${id}-par`}
                value={pair}
                checked={checked}
                onChange={() => onChange(pair)}
                className="size-5 shrink-0 cursor-pointer"
              />
              <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-2">
                <Light />
                <Dark />
              </span>
              <span className="min-w-0 text-sm font-medium break-words">{label}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          <span className="sr-only">Erro: </span>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
