// @vitest-environment jsdom
// Botão "Sair" do painel (RF20) e seletor de estado de publicação (RF26): o primeiro apaga os
// rascunhos locais do editor ao sair (A-010, nota 10); o segundo é reutilizado pela árvore (M10).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SignOutForm } from "@/components/admin/SignOutForm";
import { STATUS_LABEL, StatusBadge, StatusToggle } from "@/components/admin/StatusToggle";
import { draftStorageKey, readDraft, writeDraft } from "@/components/editor/draft";
import { Field, describedBy } from "@/components/ui/Field";

const VALUES = { title: "t", slug: "t", body: "texto privado", status: /** @type {const} */ ("DRAFT") };

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SignOutForm", () => {
  it("é um botão Sair dentro de um formulário", () => {
    render(<SignOutForm action={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Sair" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).not.toBeNull();
  });

  it("apaga os rascunhos de todos os usuários e chama a Server Function de sair", async () => {
    writeDraft(draftStorageKey("u1", "c1"), { values: VALUES, baseVersion: null });
    writeDraft(draftStorageKey("u1", null), { values: VALUES, baseVersion: null });
    writeDraft(draftStorageKey("u2", "c1"), { values: VALUES, baseVersion: null });
    localStorage.setItem("outra-coisa", "fica");

    /** O que o navegador ainda guardava quando a Server Function foi chamada. */
    let draftsAtSignOut = -1;
    const action = vi.fn(async () => {
      draftsAtSignOut = [...Array(localStorage.length).keys()].filter((index) => localStorage.key(index)?.startsWith("vitrine:rascunho:")).length;
    });
    render(<SignOutForm action={action} />);
    fireEvent.submit(/** @type {HTMLFormElement} */ (screen.getByRole("button", { name: "Sair" }).closest("form")));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(draftsAtSignOut).toBe(0);
    expect(readDraft(draftStorageKey("u1", "c1"))).toBeNull();
    expect(readDraft(draftStorageKey("u2", "c1"))).toBeNull();
    expect(localStorage.getItem("outra-coisa")).toBe("fica");
  });

  it("sai mesmo sem rascunhos e mesmo com o armazenamento bloqueado", async () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const action = vi.fn(async () => {});
    render(<SignOutForm action={action} />);
    fireEvent.submit(/** @type {HTMLFormElement} */ (screen.getByRole("button", { name: "Sair" }).closest("form")));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});

describe("AdminHeader", () => {
  it("mostra o nome do site, o usuário e o botão Sair (RF20)", () => {
    const html = renderToStaticMarkup(<AdminHeader siteName="Vitrine" user={{ name: "Ana Souza", email: "ana@exemplo.test" }} signOutAction={vi.fn()} />);
    expect(html).toContain("Vitrine");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("ana@exemplo.test");
    expect(html).toMatch(/<form[^>]*>.*<button type="submit"[^>]*>.*Sair<\/button><\/form>/s);
  });
});

describe("StatusBadge e StatusToggle (RF26, RN16)", () => {
  it("o selo traz o nome do estado, em português, e um ícone decorativo", () => {
    expect(STATUS_LABEL).toEqual({ DRAFT: "Rascunho", PUBLISHED: "Publicado" });
    for (const status of /** @type {const} */ (["DRAFT", "PUBLISHED"])) {
      const { unmount } = render(<StatusBadge status={status} />);
      const badge = screen.getByText(STATUS_LABEL[status]);
      expect(badge.getAttribute("data-status")).toBe(status);
      expect(badge.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      unmount();
    }
  });

  it("o rascunho é destacado com as cores invertidas do tema, sem cor fixa", () => {
    render(<StatusBadge status="DRAFT" />);
    const classes = screen.getByText("Rascunho").className;
    expect(classes).toContain("bg-foreground");
    expect(classes).toContain("text-background");
    expect(classes).not.toMatch(/\b(red|amber|yellow|orange|green|blue|gray|zinc|slate)-\d/);
  });

  it("pede o estado oposto ao clicar", () => {
    const onChange = vi.fn();
    const { rerender } = render(<StatusToggle status="DRAFT" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(onChange).toHaveBeenLastCalledWith("PUBLISHED");

    rerender(<StatusToggle status="PUBLISHED" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Passar para rascunho" }));
    expect(onChange).toHaveBeenLastCalledWith("DRAFT");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("é controlado: não troca de estado sozinho", () => {
    render(<StatusToggle status="DRAFT" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByText("Rascunho")).toBeTruthy();
  });

  it("desabilitado, não chama onChange", () => {
    const onChange = vi.fn();
    render(<StatusToggle status="DRAFT" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("é um grupo com nome, e o botão pode apontar para um texto de ajuda", () => {
    render(<StatusToggle status="DRAFT" onChange={vi.fn()} describedBy="ajuda" />);
    expect(screen.getByRole("group", { name: "Estado de publicação" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publicar" }).getAttribute("aria-describedby")).toBe("ajuda");
  });
});

describe("Field e describedBy", () => {
  it("liga o rótulo ao controle e mostra ajuda e erro", () => {
    render(
      <Field id="campo" label="Nome" hint="Como no documento." error="Obrigatório.">
        <input id="campo" aria-describedby={describedBy("campo", { hint: true, error: "Obrigatório." })} />
      </Field>,
    );
    expect(screen.getByLabelText("Nome").id).toBe("campo");
    expect(screen.getByText("Como no documento.").id).toBe("campo-hint");
    const error = screen.getByRole("alert");
    expect(error.id).toBe("campo-error");
    expect(error.textContent).toBe("Erro: Obrigatório.");
    expect(screen.getByLabelText("Nome").getAttribute("aria-describedby")).toBe("campo-hint campo-error");
  });

  it("sem ajuda nem erro, não cria elementos vazios", () => {
    render(
      <Field id="campo" label="Nome">
        <input id="campo" />
      </Field>,
    );
    expect(document.querySelector("#campo-hint")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("describedBy junta só o que existe", () => {
    expect(describedBy("a", {})).toBeUndefined();
    expect(describedBy("a", { hint: "x" })).toBe("a-hint");
    expect(describedBy("a", { error: "x" })).toBe("a-error");
    expect(describedBy("a", { hint: "x", error: "y" })).toBe("a-hint a-error");
    expect(describedBy("a", { hint: undefined, error: undefined })).toBeUndefined();
  });
});
