// @vitest-environment jsdom
// Envio de imagens (RF35, RF36, RN29; ADR-034): o modelo (formato, tamanho, /media/<id>, iniciais), o
// cliente (multipart, falhas em português, sem eco do arquivo) e o `ImageUpload` (pré-visualização local,
// aviso antes do envio, estado de envio, remover, nada guardado no navegador).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { IMAGE_ENDPOINTS, MESSAGES as CLIENT_MESSAGES, createImageClient } from "@/components/ui/image-client";
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  MESSAGES,
  checkImageFile,
  formatBytes,
  initialsOf,
  isMediaUrl,
  mediaUrlOfId,
} from "@/components/ui/image-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

/** @param {string} name @param {string} type @param {number} [size] */
const file = (name, type, size = 16) => new File([new Uint8Array(size).fill(7)], name, { type });
const json = (/** @type {unknown} */ body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const problem = (/** @type {number} */ status, /** @type {string} */ code, headers = {}) => json({ error: { code, message: "texto do servidor com o nome secreto.png", details: [{ field: "file", message: "x" }] } }, status, headers);

describe("o modelo", () => {
  it("só PNG, JPEG e WebP; 2 MB", () => {
    expect([...IMAGE_TYPES]).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(IMAGE_ACCEPT).toBe("image/png,image/jpeg,image/webp");
    expect(IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it("checkImageFile: aceita os três formatos até o teto", () => {
    for (const type of IMAGE_TYPES) expect(checkImageFile(file("a", type))).toBeNull();
    expect(checkImageFile({ type: "IMAGE/PNG", size: IMAGE_MAX_BYTES })).toBeNull();
  });

  it("checkImageFile: avisa do formato antes de tudo (SVG, GIF, PDF, sem tipo)", () => {
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", "text/html", ""]) expect(checkImageFile(file("a", type))).toBe(MESSAGES.format);
    expect(checkImageFile(file("a", "image/gif", 0))).toBe(MESSAGES.format);
  });

  it("checkImageFile: arquivo vazio e acima de 2 MB (com o tamanho do arquivo)", () => {
    expect(checkImageFile(file("a", "image/png", 0))).toBe(MESSAGES.empty);
    expect(checkImageFile({ type: "image/png", size: IMAGE_MAX_BYTES + 1 })).toBe(`${MESSAGES.tooLarge} Este arquivo tem 2,0 MB.`);
    expect(checkImageFile({ type: "image/png", size: 5 * 1024 * 1024 })).toContain("5,0 MB");
  });

  it("checkImageFile: sem arquivo", () => {
    expect(checkImageFile(null)).toBe(MESSAGES.unreadable);
    expect(checkImageFile(undefined)).toBe(MESSAGES.unreadable);
  });

  it("formatBytes", () => {
    expect([formatBytes(10), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(["10 B", "2,0 KB", "3,0 MB"]);
  });

  it("isMediaUrl: só /media/<id> da mesma origem", () => {
    expect(isMediaUrl("/media/clx9abc_-1")).toBe(true);
    for (const url of ["https://exemplo.com/a.png", "//exemplo.com/media/a", "/media/", "/media/a/b", "/media/a?x=1", "/outra/a", "media/a", "javascript:alert(1)", "data:image/png;base64,AA", "", null, undefined, 3]) {
      expect(isMediaUrl(url)).toBe(false);
    }
  });

  it("mediaUrlOfId", () => {
    expect(mediaUrlOfId("abc123")).toBe("/media/abc123");
    for (const id of ["", "a/b", "../x", "a b", null, undefined, 4]) expect(mediaUrlOfId(id)).toBeNull();
  });

  it("initialsOf: a primeira letra da primeira e da última palavra, em maiúsculas", () => {
    expect(initialsOf("Maria da Silva")).toBe("MS");
    expect(initialsOf("ana")).toBe("A");
    expect(initialsOf("  joão   pedro  ")).toBe("JP");
    expect(initialsOf("Álvaro Ésio")).toBe("ÁÉ");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("😀 Fulano")).toBe("😀F");
  });
});

describe("o cliente", () => {
  it("os endereços: o espaço, o sistema e o avatar", () => {
    expect(IMAGE_ENDPOINTS.page).toEqual({ logo: "/api/appearance/logo", favicon: "/api/appearance/favicon" });
    expect(IMAGE_ENDPOINTS.site).toEqual({ logo: "/api/configuration/logo", favicon: "/api/configuration/favicon" });
    expect(IMAGE_ENDPOINTS.avatar).toBe("/api/users/me/avatar");
  });

  it("upload: PUT multipart com o campo file, sem Content-Type escrito à mão e sem o nome do arquivo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { id: "img1", url: "/media/img1", width: 256, height: 256 } }));
    const client = createImageClient("/api/users/me/avatar", fetchMock);
    const result = await client.upload(file("minha-foto-secreta.png", "image/png", 33));
    expect(result).toEqual({ ok: true, url: "/media/img1", id: "img1", width: 256, height: 256 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/me/avatar");
    expect(init.method).toBe("PUT");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const sent = /** @type {File} */ (init.body.get("file"));
    expect(sent.size).toBe(33);
    expect(sent.type).toBe("image/png");
    expect(sent.name).toBe("imagem");
    expect(JSON.stringify([...init.body.keys()])).toBe('["file"]');
  });

  it("upload: usa o fetch global quando não recebe um", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { id: "i", url: "/media/i", width: 1, height: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    await createImageClient("/api/x").upload(file("a.png", "image/png"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upload: uma URL que não é /media/<id> na resposta é recusada (nenhuma imagem externa)", async () => {
    for (const url of ["https://exemplo.com/a.png", "//x.test/a", "javascript:alert(1)", "/outro/caminho", undefined]) {
      const client = createImageClient("/api/x", vi.fn().mockResolvedValue(json({ data: { id: "i", url } })));
      const result = await client.upload(file("a.png", "image/png"));
      expect(result).toEqual({ ok: false, kind: "server", message: CLIENT_MESSAGES.server });
    }
  });

  it("upload: sem id na resposta, o id sai do endereço; dimensões ruins viram 0", async () => {
    const client = createImageClient("/api/x", vi.fn().mockResolvedValue(json({ data: { url: "/media/abc", width: "x", height: -4 } })));
    expect(await client.upload(file("a.png", "image/png"))).toEqual({ ok: true, url: "/media/abc", id: "abc", width: 0, height: 0 });
  });

  it.each([
    [401, "UNAUTHENTICATED", "unauthenticated", CLIENT_MESSAGES.unauthenticated],
    [403, "FORBIDDEN", "forbidden", CLIENT_MESSAGES.forbidden],
    [403, "PASSWORD_CHANGE_REQUIRED", "password-change", CLIENT_MESSAGES.passwordChange],
    [413, "PAYLOAD_TOO_LARGE", "too-large", CLIENT_MESSAGES.tooLarge],
    [422, "INVALID_IMAGE", "invalid-image", CLIENT_MESSAGES.invalidImage],
    [422, "VALIDATION_ERROR", "validation", CLIENT_MESSAGES.validation],
    [400, "VALIDATION_ERROR", "validation", CLIENT_MESSAGES.validation],
    [500, "INTERNAL", "server", CLIENT_MESSAGES.server],
  ])("upload: %i %s -> %s, em português e sem repassar o texto do servidor", async (status, code, kind, message) => {
    const client = createImageClient("/api/x", vi.fn().mockResolvedValue(problem(status, code)));
    const result = await client.upload(file("a.png", "image/png"));
    expect(result).toEqual({ ok: false, kind, message });
    expect(JSON.stringify(result)).not.toContain("secreto");
  });

  it("upload: 429 cita o Retry-After; 503 BUSY também", async () => {
    const limited = await createImageClient("/api/x", vi.fn().mockResolvedValue(problem(429, "RATE_LIMITED", { "Retry-After": "30" }))).upload(file("a.png", "image/png"));
    expect(limited).toEqual({ ok: false, kind: "rate-limited", message: `${CLIENT_MESSAGES.rateLimited} Tente de novo em 30 segundos.` });
    const busy = await createImageClient("/api/x", vi.fn().mockResolvedValue(problem(503, "BUSY", { "Retry-After": "1" }))).upload(file("a.png", "image/png"));
    expect(busy).toEqual({ ok: false, kind: "busy", message: `${CLIENT_MESSAGES.busy} Tente de novo em 1 segundo.` });
    const plain = await createImageClient("/api/x", vi.fn().mockResolvedValue(problem(429, "RATE_LIMITED"))).upload(file("a.png", "image/png"));
    expect(plain.ok === false && plain.message).toBe(CLIENT_MESSAGES.rateLimited);
  });

  it("upload: 503 sem BUSY é erro do servidor; falha de rede é 'network'", async () => {
    expect(await createImageClient("/api/x", vi.fn().mockResolvedValue(problem(503, "OTHER"))).upload(file("a.png", "image/png"))).toMatchObject({ kind: "server" });
    expect(await createImageClient("/api/x", vi.fn().mockRejectedValue(new TypeError("falhou"))).upload(file("a.png", "image/png"))).toEqual({ ok: false, kind: "network", message: CLIENT_MESSAGES.network });
  });

  it("remove: DELETE sem corpo; 204 dá ok; falhas traduzidas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await createImageClient("/api/appearance/logo", fetchMock).remove()).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(await createImageClient("/api/x", vi.fn().mockResolvedValue(problem(403, "FORBIDDEN"))).remove()).toMatchObject({ ok: false, kind: "forbidden" });
    expect(await createImageClient("/api/x", vi.fn().mockRejectedValue(new Error("x"))).remove()).toMatchObject({ ok: false, kind: "network" });
  });
});

/** @param {Partial<{ upload: any, remove: any }>} [over] */
const fakeClient = (over = {}) => ({
  upload: vi.fn().mockResolvedValue({ ok: true, url: "/media/novo", id: "novo", width: 64, height: 64 }),
  remove: vi.fn().mockResolvedValue({ ok: true }),
  ...over,
});
const fileInput = () => /** @type {HTMLInputElement} */ (screen.getByLabelText(/^Arquivo:/));
const choose = (/** @type {File} */ chosen) => fireEvent.change(fileInput(), { target: { files: [chosen] } });
const alertText = () => screen.queryAllByRole("alert").map((el) => el.textContent).join(" ");

describe("ImageUpload: a tela", () => {
  it("mostra a imagem atual (/media/<id>) com alt, e 'Remover'", () => {
    render(<ImageUpload label="Logotipo" kind="logo" currentUrl="/media/atual1" client={fakeClient()} />);
    const img = screen.getByRole("img", { name: "Logotipo atual" });
    expect(img.getAttribute("src")).toBe("/media/atual1");
    expect(screen.getByRole("button", { name: "Remover logotipo" })).toBeTruthy();
  });

  it("sem imagem: o fallback (ou 'Sem imagem') e nenhum 'Remover'", () => {
    const { unmount } = render(<ImageUpload label="Logotipo" client={fakeClient()} />);
    expect(screen.getByText("Sem imagem")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remover/ })).toBeNull();
    unmount();
    render(<ImageUpload label="Logotipo" client={fakeClient()} fallback={<span>padrão</span>} />);
    expect(screen.getByText("padrão")).toBeTruthy();
  });

  it("uma imagem atual que não é /media/<id> nunca vira <img>", () => {
    for (const url of ["https://exemplo.com/a.png", "javascript:alert(1)", "//x.test/a.png", "data:image/png;base64,AAAA"]) {
      const { container, unmount } = render(<ImageUpload label="Logotipo" currentUrl={url} client={fakeClient()} />);
      expect(container.querySelector("img")).toBeNull();
      unmount();
    }
  });

  it("o seletor tem rótulo, aceita só os três formatos e a ajuda diz formato, tamanho e o que o servidor faz", () => {
    render(<ImageUpload label="Favicon" kind="favicon" client={fakeClient()} />);
    const input = fileInput();
    expect(input.type).toBe("file");
    expect(input.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
    const hint = document.getElementById(/** @type {string} */ (input.getAttribute("aria-describedby")))?.textContent ?? "";
    expect(hint).toContain("PNG, JPEG ou WebP, até 2 MB");
    expect(hint).toContain("64 × 64");
  });

  it("cada tipo explica o que vira: logotipo, favicon e avatar", () => {
    const texts = {};
    for (const kind of /** @type {const} */ (["logo", "favicon", "avatar"])) {
      const { unmount } = render(<ImageUpload label="X" kind={kind} client={fakeClient()} />);
      texts[kind] = document.getElementById(/** @type {string} */ (fileInput().getAttribute("aria-describedby")))?.textContent;
      unmount();
    }
    expect(texts.logo).toContain("512 px");
    expect(texts.favicon).toContain("64 × 64");
    expect(texts.avatar).toContain("256 × 256");
  });
});

describe("ImageUpload: antes de enviar", () => {
  it.each([
    ["foto.gif", "image/gif", MESSAGES.format],
    ["desenho.svg", "image/svg+xml", MESSAGES.format],
    ["doc.pdf", "application/pdf", MESSAGES.format],
  ])("%s: avisa do formato, sem pré-visualização e sem enviar", async (name, type, message) => {
    const client = fakeClient();
    render(<ImageUpload label="Avatar" kind="avatar" client={client} />);
    choose(file(name, type));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/Pré-visualização do arquivo/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Enviar/ })).toBeNull();
    expect(client.upload).not.toHaveBeenCalled();
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("avisa do tamanho (acima de 2 MB) e do arquivo vazio", async () => {
    const client = fakeClient();
    render(<ImageUpload label="Logotipo" client={client} />);
    choose(file("grande.png", "image/png", IMAGE_MAX_BYTES + 1));
    expect(await screen.findByText(/O limite é de 2 MB\. Este arquivo tem 2,0 MB\./)).toBeTruthy();
    choose(file("vazio.png", "image/png", 0));
    expect(await screen.findByText(MESSAGES.empty)).toBeTruthy();
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("exatamente 2 MB passa", async () => {
    render(<ImageUpload label="Logotipo" client={fakeClient()} />);
    choose(file("limite.png", "image/png", IMAGE_MAX_BYTES));
    expect(await screen.findByRole("button", { name: "Enviar logotipo" })).toBeTruthy();
  });

  it("um arquivo válido mostra a pré-visualização LOCAL (data:), ainda sem enviar, com 'Enviar' e 'Cancelar'", async () => {
    const client = fakeClient();
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} />);
    choose(file("novo.png", "image/png"));
    const preview = await screen.findByRole("img", { name: "Pré-visualização: logotipo" });
    expect(preview.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText(/ainda não enviado/)).toBeTruthy();
    expect(client.upload).not.toHaveBeenCalled();
    // a imagem atual continua visível enquanto isso
    expect(screen.getByRole("img", { name: "Logotipo atual" }).getAttribute("src")).toBe("/media/atual1");
    expect(screen.getByRole("button", { name: "Enviar logotipo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("a pré-visualização nunca usa blob: (a CSP só admite 'self', data: e https:)", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));
    render(<ImageUpload label="Logotipo" client={fakeClient()} />);
    choose(file("novo.png", "image/png"));
    await screen.findByRole("img", { name: "Pré-visualização: logotipo" });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("escolher outro arquivo antes do primeiro terminar de ler: vale o último", async () => {
    render(<ImageUpload label="Logotipo" client={fakeClient()} />);
    choose(new File([new Uint8Array([1, 1, 1])], "a.png", { type: "image/png" }));
    choose(new File([new Uint8Array([9, 9, 9])], "b.jpg", { type: "image/jpeg" }));
    const preview = await screen.findByRole("img", { name: "Pré-visualização: logotipo" });
    await waitFor(() => expect(preview.getAttribute("src")).toMatch(/^data:image\/jpeg/));
  });

  it("'Cancelar' descarta o arquivo, não envia e devolve o foco ao seletor", async () => {
    const client = fakeClient();
    render(<ImageUpload label="Logotipo" client={client} />);
    choose(file("novo.png", "image/png"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/Pré-visualização do arquivo/)).toBeNull();
    expect(client.upload).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(fileInput()));
  });
});

describe("ImageUpload: enviar", () => {
  it("envia o arquivo escolhido, troca a imagem atual pelo /media/<id> devolvido, avisa e devolve o foco", async () => {
    const client = fakeClient();
    const onChange = vi.fn();
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} onChange={onChange} />);
    const chosen = file("novo.png", "image/png", 40);
    choose(chosen);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar logotipo" }));
    await screen.findByText("Logotipo enviado.");
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(client.upload.mock.calls[0][0]).toBe(chosen);
    expect(screen.getByRole("img", { name: "Logotipo atual" }).getAttribute("src")).toBe("/media/novo");
    expect(screen.queryByText(/Pré-visualização do arquivo/)).toBeNull();
    expect(onChange).toHaveBeenCalledWith("/media/novo");
    expect(screen.getByRole("status").textContent).toBe("Logotipo enviado.");
    await waitFor(() => expect(document.activeElement).toBe(fileInput()));
  });

  it("durante o envio: 'Enviando…', botões e seletor desabilitados, aria-busy; sem segundo envio", async () => {
    let finish = /** @type {(value: any) => void} */ (() => {});
    const client = fakeClient({ upload: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    const { container } = render(<ImageUpload label="Logotipo" client={client} />);
    choose(file("novo.png", "image/png"));
    const send = await screen.findByRole("button", { name: "Enviar logotipo" });
    fireEvent.click(send);
    const busy = await screen.findByRole("button", { name: "Enviando…" });
    expect(/** @type {HTMLButtonElement} */ (busy).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Cancelar" })).disabled).toBe(true);
    expect(fileInput().disabled).toBe(true);
    expect(container.querySelector("fieldset")?.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);
    expect(client.upload).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, url: "/media/novo", id: "novo", width: 1, height: 1 }));
    await screen.findByText("Logotipo enviado.");
    expect(container.querySelector("fieldset")?.getAttribute("aria-busy")).toBe("false");
  });

  it.each([
    ["INVALID_IMAGE", { ok: false, kind: "invalid-image", message: CLIENT_MESSAGES.invalidImage }],
    ["413", { ok: false, kind: "too-large", message: CLIENT_MESSAGES.tooLarge }],
    ["429", { ok: false, kind: "rate-limited", message: `${CLIENT_MESSAGES.rateLimited} Tente de novo em 20 segundos.` }],
    ["BUSY", { ok: false, kind: "busy", message: CLIENT_MESSAGES.busy }],
  ])("falha %s: a mensagem em português vai ao seletor, a imagem anterior e o arquivo escolhido ficam", async (_name, failure) => {
    const client = fakeClient({ upload: vi.fn().mockResolvedValue(failure) });
    const onChange = vi.fn();
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} onChange={onChange} />);
    choose(file("novo.png", "image/png"));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar logotipo" }));
    await waitFor(() => expect(alertText()).toContain(failure.message));
    expect(screen.getByRole("img", { name: "Logotipo atual" }).getAttribute("src")).toBe("/media/atual1");
    expect(screen.getByRole("img", { name: "Pré-visualização: logotipo" })).toBeTruthy();
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole("button", { name: "Enviar logotipo" })).disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Logotipo enviado.")).toBeNull();
  });

  it("depois de uma falha, tentar de novo funciona e apaga o erro", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: "busy", message: CLIENT_MESSAGES.busy })
      .mockResolvedValueOnce({ ok: true, url: "/media/ok", id: "ok", width: 1, height: 1 });
    render(<ImageUpload label="Avatar" kind="avatar" client={fakeClient({ upload })} />);
    choose(file("a.png", "image/png"));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar avatar" }));
    await waitFor(() => expect(alertText()).toContain(CLIENT_MESSAGES.busy));
    fireEvent.click(screen.getByRole("button", { name: "Enviar avatar" }));
    await screen.findByText("Avatar enviado.");
    expect(alertText()).not.toContain(CLIENT_MESSAGES.busy);
  });

  it("escolher um arquivo novo apaga o aviso de 'enviado' e o erro anterior", async () => {
    render(<ImageUpload label="Logotipo" client={fakeClient()} />);
    choose(file("a.png", "image/png"));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar logotipo" }));
    await screen.findByText("Logotipo enviado.");
    choose(file("desenho.svg", "image/svg+xml"));
    await screen.findByText(MESSAGES.format);
    expect(screen.queryByText("Logotipo enviado.")).toBeNull();
  });
});

describe("ImageUpload: remover", () => {
  it("remove, volta ao fallback, avisa e chama onChange(null)", async () => {
    const client = fakeClient();
    const onChange = vi.fn();
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} onChange={onChange} fallback={<span>padrão</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    await screen.findByText("Logotipo removido.");
    expect(client.remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img", { name: "Logotipo atual" })).toBeNull();
    expect(screen.getByText("padrão")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remover/ })).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() => expect(document.activeElement).toBe(fileInput()));
  });

  it("falha ao remover: mensagem, e a imagem continua", async () => {
    const client = fakeClient({ remove: vi.fn().mockResolvedValue({ ok: false, kind: "forbidden", message: CLIENT_MESSAGES.forbidden }) });
    const onChange = vi.fn();
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    await waitFor(() => expect(alertText()).toContain(CLIENT_MESSAGES.forbidden));
    expect(screen.getByRole("img", { name: "Logotipo atual" })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("enquanto remove: 'Removendo…' desabilitado; não remove duas vezes", async () => {
    let finish = /** @type {(value: any) => void} */ (() => {});
    const client = fakeClient({ remove: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    const busy = await screen.findByRole("button", { name: "Removendo…" });
    expect(/** @type {HTMLButtonElement} */ (busy).disabled).toBe(true);
    fireEvent.click(busy);
    expect(client.remove).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
  });

  it("com um arquivo escolhido (ainda não enviado), 'Remover' não aparece", async () => {
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={fakeClient()} />);
    choose(file("novo.png", "image/png"));
    await screen.findByRole("button", { name: "Enviar logotipo" });
    expect(screen.queryByRole("button", { name: "Remover logotipo" })).toBeNull();
  });
});

describe("ImageUpload: nada fica no navegador", () => {
  it("nenhuma gravação em localStorage, sessionStorage, cookie ou IndexedDB, nem Cache API", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    const cookieBefore = document.cookie;
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={fakeClient()} />);
    choose(file("novo.png", "image/png"));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar logotipo" }));
    await screen.findByText("Logotipo enviado.");
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    await screen.findByText("Logotipo removido.");
    expect(local).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookieBefore);
    expect(open).not.toHaveBeenCalled();
  });

  it("o componente não é um <form> (cabe dentro de outro) e os botões são type=button", () => {
    const { container } = render(<ImageUpload label="Logotipo" currentUrl="/media/atual1" client={fakeClient()} />);
    expect(container.querySelector("form")).toBeNull();
    for (const button of within(container).getAllByRole("button")) expect(button.getAttribute("type")).toBe("button");
  });
});
