// @vitest-environment jsdom
// Avatar (RF36, RN29; ADR-034) e o diretório do portal com avatares (RN28): a imagem de /media com
// tamanho fixo e carregamento preguiçoso, as iniciais sem imagem (ou se ela falha), o `alt` vazio quando
// o nome está ao lado, e nenhuma imagem externa.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalDirectory } from "@/components/layout/PortalDirectory";
import { Avatar } from "@/components/ui/Avatar";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children) };
});

afterEach(cleanup);

describe("Avatar: com imagem", () => {
  it("a imagem é /media/<id>, com largura e altura fixas, preguiçosa e com o nome no alt", () => {
    render(<Avatar name="Maria Souza" src="/media/av1" size={64} />);
    const img = screen.getByRole("img", { name: "Maria Souza" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/media/av1");
    expect(img.getAttribute("width")).toBe("64");
    expect(img.getAttribute("height")).toBe("64");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("acima da dobra, `eager` carrega já", () => {
    render(<Avatar name="Maria" src="/media/av1" eager />);
    expect(screen.getByRole("img").getAttribute("loading")).toBe("eager");
  });

  it("o tamanho padrão é 40", () => {
    render(<Avatar name="Maria" src="/media/av1" />);
    expect(screen.getByRole("img").getAttribute("width")).toBe("40");
  });

  it("decorativo (o nome está ao lado): alt vazio", () => {
    const { container } = render(<Avatar name="Maria Souza" src="/media/av1" decorative />);
    const img = /** @type {HTMLImageElement} */ (container.querySelector("img"));
    expect(img.getAttribute("alt")).toBe("");
  });

  it("se a imagem não carrega, mostra as iniciais no lugar", () => {
    const { container } = render(<Avatar name="Maria Souza" src="/media/quebrada" />);
    fireEvent.error(/** @type {Element} */ (container.querySelector("img")));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Maria Souza" }).textContent).toBe("MS");
  });

  it("uma imagem nova depois de uma quebrada volta a ser tentada (o endereço mudou)", () => {
    const { container, rerender } = render(<Avatar name="Maria" src="/media/quebrada" />);
    fireEvent.error(/** @type {Element} */ (container.querySelector("img")));
    expect(container.querySelector("img")).toBeNull();
    rerender(<Avatar name="Maria" src="/media/nova" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/nova");
  });
});

describe("Avatar: sem imagem, as iniciais", () => {
  it("um círculo com as iniciais, rotulado com o nome", () => {
    render(<Avatar name="Ana Beatriz de Souza" />);
    const circle = screen.getByRole("img", { name: "Ana Beatriz de Souza" });
    expect(circle.tagName).toBe("SPAN");
    expect(circle.textContent).toBe("AS");
    expect(circle.className).toMatch(/rounded-full/);
  });

  it("decorativo: oculto das tecnologias assistivas (o nome está ao lado)", () => {
    const { container } = render(<Avatar name="Ana Souza" decorative />);
    const circle = /** @type {HTMLElement} */ (container.firstElementChild);
    expect(circle.getAttribute("aria-hidden")).toBe("true");
    expect(circle.getAttribute("role")).toBeNull();
    expect(circle.textContent).toBe("AS");
  });

  it("o círculo tem o tamanho pedido (largura e altura iguais)", () => {
    const { container } = render(<Avatar name="Ana" size={96} />);
    const circle = /** @type {HTMLElement} */ (container.firstElementChild);
    expect(circle.style.width).toBe("96px");
    expect(circle.style.height).toBe("96px");
  });

  it("nome vazio: '?'", () => {
    render(<Avatar name="" />);
    expect(screen.getByRole("img").textContent).toBe("?");
  });

  it("só tokens de tema: fundo de superfície e texto do primeiro plano (contraste AA nos dois modos)", () => {
    const { container } = render(<Avatar name="Ana Souza" />);
    const circle = /** @type {HTMLElement} */ (container.firstElementChild);
    expect(circle.className).toMatch(/\bbg-surface\b/);
    expect(circle.className).toMatch(/\btext-foreground\b/);
    expect(circle.getAttribute("style") ?? "").not.toMatch(/#|rgb|color/i);
  });

  it("HTML no nome é texto, nunca marcação", () => {
    const { container } = render(<Avatar name={'<img src=x onerror="alert(1)"> Fulano'} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.firstElementChild?.getAttribute("aria-label")).toBe('<img src=x onerror="alert(1)"> Fulano');
  });
});

describe("Avatar: nenhuma imagem externa", () => {
  it.each(["https://exemplo.com/a.png", "//exemplo.com/a.png", "http://exemplo.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/outro/caminho.png", "/media/a/b", "/media/a?x=1"])(
    "o src %j nunca vira <img>: vira iniciais",
    (src) => {
      const { container } = render(<Avatar name="Maria Souza" src={src} />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toBe("MS");
    },
  );
});

describe("PortalDirectory com avatares (RF36, RN28)", () => {
  const spaces = [
    { id: "u1", handle: "ana", name: "Espaço da Ana", description: "Notas.", avatarImageId: "av-ana" },
    { id: "u2", handle: "bia", name: "Bia Lima", description: null, avatarImageId: null },
    { id: "u3", handle: "cris", name: "Cris", description: null },
  ];

  it("cada cartão traz o avatar (ou as iniciais), o nome e o handle", () => {
    render(<PortalDirectory spaces={spaces} />);
    const [ana, bia, cris] = screen.getAllByRole("article");
    expect(ana.querySelector("img")?.getAttribute("src")).toBe("/media/av-ana");
    expect(within(ana).getByRole("link", { name: "Espaço da Ana" }).getAttribute("href")).toBe("/ana");
    expect(within(ana).getByText("@ana")).toBeTruthy();
    expect(bia.querySelector("img")).toBeNull();
    expect(bia.textContent).toContain("BL");
    expect(within(bia).getByText("@bia")).toBeTruthy();
    expect(cris.querySelector("img")).toBeNull();
    expect(cris.textContent).toContain("C");
  });

  it("o avatar é decorativo: alt vazio (o nome já está ao lado) e não duplica o nome acessível", () => {
    render(<PortalDirectory spaces={spaces} />);
    const [ana, bia] = screen.getAllByRole("article");
    expect(ana.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(within(bia).queryByRole("img")).toBeNull();
  });

  it("o identificador do avatar só vale com forma de identificador (nada de caminho)", () => {
    render(<PortalDirectory spaces={[{ id: "u1", handle: "ana", name: "Ana", description: null, avatarImageId: "../../etc/passwd" }]} />);
    expect(screen.getByRole("article").querySelector("img")).toBeNull();
  });
});
