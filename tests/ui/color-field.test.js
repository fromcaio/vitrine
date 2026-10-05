// @vitest-environment jsdom
// Campo de cor (RF19, RN09; M18): seletor nativo e texto #RRGGBB, validação do servidor no cliente
// (hexColorSchema), rótulo, ajuda e erro ligados por aria-describedby.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorField, colorError } from "@/components/ui/ColorField";

afterEach(cleanup);

/** Campo controlado, como o formulário o usa. */
function Harness({ initial = "#2563eb", onChange = () => {}, ...rest }) {
  const [value, setValue] = useState(initial);
  return (
    <ColorField
      id="cor"
      label="Primária"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      {...rest}
    />
  );
}

const text = () => /** @type {HTMLInputElement} */ (screen.getByLabelText("Primária"));
const picker = () => /** @type {HTMLInputElement} */ (screen.getByLabelText("Primária: seletor de cor"));

describe("colorError (a mesma regra do servidor)", () => {
  it.each(["#000000", "#FFFFFF", "#2563eb", "#aBcDeF"])("aceita %s", (value) => {
    expect(colorError(value)).toBeUndefined();
  });

  it.each(["", "#fff", "2563eb", "#2563eb0", "#gggggg", "azul", " #2563eb", "#2563eb "])("recusa %j com a mensagem do servidor", (value) => {
    expect(colorError(value)).toBe("A cor deve estar no formato #RRGGBB.");
  });
});

describe("ColorField", () => {
  it("tem o campo de texto com o rótulo e o seletor nativo com nome acessível", () => {
    render(<Harness />);
    expect(text().type).toBe("text");
    expect(text().value).toBe("#2563eb");
    expect(text().maxLength).toBe(7);
    expect(text().getAttribute("placeholder")).toBe("#RRGGBB");
    expect(picker().type).toBe("color");
    expect(picker().value).toBe("#2563eb");
  });

  it("digitar no texto repassa o valor como veio, e o seletor o acompanha", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(text(), { target: { value: "#FF0000" } });
    expect(onChange).toHaveBeenLastCalledWith("#FF0000");
    expect(text().value).toBe("#FF0000");
    // O seletor nativo só aceita minúsculas.
    expect(picker().value).toBe("#ff0000");
  });

  it("escolher no seletor repassa #rrggbb e atualiza o texto", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(picker(), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");
    expect(text().value).toBe("#00ff00");
  });

  it("com o texto incompleto, o seletor mostra preto e o texto continua como está", () => {
    render(<Harness />);
    fireEvent.change(text(), { target: { value: "#25" } });
    expect(text().value).toBe("#25");
    expect(picker().value).toBe("#000000");
  });

  it("valida sozinho só depois de perder o foco, em português, ligado por aria-describedby", () => {
    render(<Harness initial="#12" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(text().getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(text());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("A cor deve estar no formato #RRGGBB.");
    expect(text().getAttribute("aria-invalid")).toBe("true");
    expect(text().getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("corrigir o texto faz o erro sumir", () => {
    render(<Harness initial="#12" />);
    fireEvent.blur(text());
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(text(), { target: { value: "#123456" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(text().getAttribute("aria-invalid")).toBeNull();
  });

  it("uma cor válida não mostra erro ao perder o foco", () => {
    render(<Harness />);
    fireEvent.blur(text());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("o erro que vem de fora vale mais que a validação própria, e aparece sem o foco ter passado", () => {
    render(<Harness error="Mensagem do servidor." />);
    expect(screen.getByRole("alert").textContent).toContain("Mensagem do servidor.");
    expect(text().getAttribute("aria-invalid")).toBe("true");
  });

  it("a ajuda e o erro entram juntos em aria-describedby, nessa ordem", () => {
    render(<Harness hint="Ajuda da cor." error="Erro da cor." />);
    const ids = (text().getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toEqual(["cor-hint", "cor-error"]);
    expect(document.getElementById("cor-hint")?.textContent).toBe("Ajuda da cor.");
  });

  it("só usa tokens de tema, nunca cores fixas", () => {
    const { container } = render(<Harness error="x" />);
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate)-\d/);
  });
});
