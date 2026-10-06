// @vitest-environment jsdom
// Motivo e prazo da moderação (RF27, RF34; RN19, RN23, RN26): o modelo puro e o `ModerationDialog`.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ModerationDialog } from "@/components/admin/ModerationDialog";
import { REASON_MAX_LENGTH, deadlineFromLocal, minDeadlineLocal, validateReason } from "@/components/admin/moderation-model";
import { REASON_MAX_LENGTH as SERVER_REASON_MAX } from "@/lib/validators";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});

afterEach(cleanup);

describe("validateReason", () => {
  it("é o mesmo limite do servidor", () => {
    expect(REASON_MAX_LENGTH).toBe(SERVER_REASON_MAX);
    expect(REASON_MAX_LENGTH).toBe(500);
  });

  it("vazio, só espaços, tabulação e quebra de linha são recusados", () => {
    for (const raw of ["", "   ", "\t\n  ", undefined, null]) expect(validateReason(/** @type {any} */ (raw)).error).toBe("Informe o motivo.");
  });

  it("devolve o motivo já aparado (é o que se envia)", () => {
    expect(validateReason("  Violou as regras.  \n")).toEqual({ reason: "Violou as regras.", error: null });
  });

  it("o limite é de 500 caracteres DEPOIS de aparado: 500 passa, 501 não", () => {
    expect(validateReason("a".repeat(500)).error).toBeNull();
    expect(validateReason("a".repeat(501)).error).toBe("O motivo deve ter no máximo 500 caracteres.");
    expect(validateReason(`  ${"a".repeat(500)}  `).error).toBeNull(); // os espaços das pontas não contam
  });

  it("espaços no meio contam", () => {
    expect(validateReason(`${"a".repeat(250)} ${"b".repeat(250)}`).error).toBe("O motivo deve ter no máximo 500 caracteres.");
  });
});

describe("deadlineFromLocal", () => {
  const now = new Date("2026-10-06T12:00:00").getTime();

  it("vazio é 'sem prazo'", () => {
    expect(deadlineFromLocal("", now)).toEqual({ iso: null, error: null });
    expect(deadlineFromLocal("   ", now)).toEqual({ iso: null, error: null });
  });

  it("converte a hora local para ISO 8601 (UTC)", () => {
    const { iso, error } = deadlineFromLocal("2026-10-20T18:30", now);
    expect(error).toBeNull();
    expect(iso).toBe(new Date("2026-10-20T18:30").toISOString());
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("recusa o passado e o instante atual", () => {
    expect(deadlineFromLocal("2026-10-06T11:59", now).error).toBe("O prazo da suspensão deve estar no futuro.");
    expect(deadlineFromLocal("2026-10-06T12:00", now).error).toBe("O prazo da suspensão deve estar no futuro.");
    expect(deadlineFromLocal("2026-10-06T12:01", now).error).toBeNull();
  });

  it("recusa texto que não é uma data e hora", () => {
    for (const bad of ["amanhã", "2026-10-20", "2026-13-40T10:00", "20/10/2026 10:00"]) expect(deadlineFromLocal(bad, now).error).toBe("Informe uma data e uma hora válidas.");
  });

  it("minDeadlineLocal é o minuto seguinte, no formato do campo", () => {
    expect(minDeadlineLocal(now)).toBe("2026-10-06T12:01");
    expect(minDeadlineLocal(now)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

/** Abre e fecha o diálogo, como a lista de usuários faz. */
function Harness({ onConfirm = vi.fn(), onCancel = () => {}, ownerName = "Ana Souza", children = undefined, startOpen = true }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <ModerationDialog
        open={open}
        title="Despublicar o documento"
        description="O documento passa para rascunho."
        confirmLabel="Despublicar"
        ownerName={ownerName}
        onConfirm={async (reason) => {
          const failed = await onConfirm(reason);
          if (typeof failed !== "string") setOpen(false);
          return failed;
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      >
        {children}
      </ModerationDialog>
    </>
  );
}

const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));
const reasonField = () => /** @type {HTMLTextAreaElement} */ (within(dialog()).getByLabelText("Motivo"));
const confirm = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Despublicar" }));
const type = (/** @type {string} */ value) => fireEvent.change(reasonField(), { target: { value } });

describe("ModerationDialog", () => {
  it("abre com o foco no motivo e avisa que o dono será notificado e verá o motivo", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(reasonField());
    expect(within(dialog()).getByText(/será notificada e verá este motivo/)).toBeTruthy();
    expect(within(dialog()).getByText("Ana Souza", { selector: "strong" })).toBeTruthy();
    expect(within(dialog()).getByText(/Moderar não é editar a estrutura/)).toBeTruthy();
  });

  it("sem o nome do dono, o aviso fala em 'A pessoa'", () => {
    render(<Harness ownerName={/** @type {any} */ (null)} />);
    expect(within(dialog()).getByText(/A pessoa/)).toBeTruthy();
  });

  it("o motivo vazio ou só de espaços é recusado antes de enviar, com a mensagem ligada ao campo e o foco nele", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    confirm();
    expect(within(dialog()).getByText("Informe o motivo.")).toBeTruthy();
    expect(reasonField().getAttribute("aria-invalid")).toBe("true");
    expect(reasonField().getAttribute("aria-describedby")).toMatch(/-error/);
    type("    \n  ");
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(reasonField());
  });

  it("o contador mostra n/500 do motivo aparado e fica ligado ao campo", () => {
    render(<Harness />);
    expect(within(dialog()).getByText("0/500")).toBeTruthy();
    type("  abc  ");
    expect(within(dialog()).getByText("3/500")).toBeTruthy();
    const counterId = within(dialog()).getByText("3/500").id;
    expect(reasonField().getAttribute("aria-describedby")).toContain(counterId);
  });

  it("envia o motivo JÁ aparado", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    type("  Texto ofensivo.  ");
    confirm();
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Texto ofensivo."));
    expect(document.querySelector("dialog")).toBeNull(); // deu certo: quem usa fechou
  });

  it("500 caracteres passa; 501 não, com o contador em destaque", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    type("a".repeat(501));
    expect(within(dialog()).getByText("501/500").className).toMatch(/text-danger/);
    confirm();
    expect(within(dialog()).getByText("O motivo deve ter no máximo 500 caracteres.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    type("a".repeat(500));
    confirm();
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("o erro do servidor aparece DENTRO do diálogo, que continua aberto com o motivo digitado", async () => {
    const onConfirm = vi.fn(async () => "O último administrador ativo não pode ser suspenso.");
    render(<Harness onConfirm={onConfirm} />);
    type("Motivo digitado");
    confirm();
    await within(dialog()).findByText("O último administrador ativo não pode ser suspenso.");
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(reasonField().value).toBe("Motivo digitado");
    expect(document.activeElement).not.toBeNull();
  });

  it("depois do erro, dá para corrigir e enviar de novo", async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce("Falhou.").mockResolvedValueOnce(undefined);
    render(<Harness onConfirm={onConfirm} />);
    type("Primeiro");
    confirm();
    await within(dialog()).findByText("Falhou.");
    type("Segundo");
    confirm();
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith("Segundo"));
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("uma exceção em onConfirm vira uma mensagem no diálogo, sem perder o texto", async () => {
    render(<Harness onConfirm={vi.fn(async () => { throw new Error("rede"); })} />);
    type("Meu motivo");
    confirm();
    await within(dialog()).findByText(/Não foi possível concluir a ação agora/);
    expect(reasonField().value).toBe("Meu motivo");
  });

  it("enquanto envia: 'Enviando…', o campo só de leitura e Esc não cancela", async () => {
    /** @type {() => void} */
    let release = () => {};
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={() => new Promise((resolve) => (release = () => resolve(undefined)))} />);
    type("Motivo");
    confirm();
    await within(dialog()).findByRole("button", { name: "Enviando…", hidden: true });
    expect(reasonField().readOnly).toBe(true);
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(document.querySelector("dialog")).toBeNull());
  });

  it("mostra os campos extras depois do motivo (o prazo da suspensão)", () => {
    render(<Harness>{<label>Prazo<input type="datetime-local" /></label>}</Harness>);
    const fields = [...dialog().querySelectorAll("textarea, input")];
    expect(fields[0]).toBe(reasonField());
    expect(fields[1].getAttribute("type")).toBe("datetime-local");
  });

  it("reabrir começa com o motivo em branco", () => {
    render(<Harness />);
    type("Resto de um motivo");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(document.querySelector("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(reasonField().value).toBe("");
    expect(within(dialog()).queryByText("Informe o motivo.")).toBeNull();
  });

  it("cancelar e Esc chamam onCancel sem enviar", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("o texto de quem é moderado e o erro são sempre texto, nunca HTML", async () => {
    render(<Harness ownerName={"<img src=x onerror=alert(1)>"} onConfirm={async () => "<script>alert(1)</script>"} />);
    type("m");
    confirm();
    await within(dialog()).findByText("<script>alert(1)</script>");
    expect(dialog().querySelector("img, script")).toBeNull();
    expect(within(dialog()).getByText("<img src=x onerror=alert(1)>", { selector: "strong" })).toBeTruthy();
  });

  it("a variante de perigo é um alertdialog", () => {
    render(<ModerationDialog open danger title="Excluir" ownerName="Ana" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("alertdialog", { name: "Excluir" })).toBeTruthy();
  });

  it("não renderiza nada fechado", () => {
    render(<ModerationDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.querySelector("dialog")).toBeNull();
  });
});
