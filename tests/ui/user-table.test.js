// @vitest-environment jsdom
// Gestão de usuários (RF27, UC13; RN19 a RN24; RNF05, RNF06): a lista, a busca, a paginação e cada ação
// contra uma API simulada com estado (a mesma forma de resposta de `/api/users`).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserTable } from "@/components/admin/UserTable";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") proto.showModal = function showModal() { this.setAttribute("open", ""); };
  if (typeof proto.close !== "function") proto.close = function close() { this.removeAttribute("open"); };
});

/** @typedef {{ id: string, name: string, email: string, handle: string | null, role: "admin" | "user", suspended: boolean, banReason: string | null, banExpires: string | null, mustChangePassword: boolean, createdAt: string | null, updatedAt: string | null }} Row */

/** @param {Partial<Row> & { id: string }} over @returns {Row} */
const row = (over) => ({ name: over.id, email: `${over.id}@exemplo.com`, handle: over.id, role: "user", suspended: false, banReason: null, banExpires: null, mustChangePassword: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: null, ...over });

const SAMPLE = [
  row({ id: "adm", name: "Chefe", role: "admin" }),
  row({ id: "ana", name: "Ana Souza" }),
  row({ id: "bia", name: "Bia Lima", handle: null }),
  row({ id: "cris", name: "Cris Dias", suspended: true, banReason: "Spam repetido", banExpires: "2026-12-25T15:30:00.000Z" }),
  row({ id: "davi", name: "Davi Reis", mustChangePassword: true }),
];

/** A API simulada de /api/users. @param {Row[]} initial @param {{ contents?: Record<string, number>, currentUserId?: string }} [options] */
function fakeApi(initial, { contents = {} } = {}) {
  let rows = structuredClone(initial);
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  /** @type {Map<string, () => Response>} */
  const failures = new Map();
  /** @type {Map<string, Promise<void>>} */
  const gates = new Map();
  let serial = 0;
  const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const problem = (/** @type {string} */ code, /** @type {number} */ status, /** @type {unknown} */ details = [], message = "mensagem do servidor") => json({ error: { code, message, details } }, status);
  const activeAdmins = () => rows.filter((r) => r.role === "admin" && !r.suspended).length;

  /** @param {string} url @param {RequestInit} [init] */
  async function handle(url, init = {}) {
    const method = init.method ?? "GET";
    const full = String(url);
    const [path, query = ""] = full.split("?");
    const params = new URLSearchParams(query);
    const body = typeof init.body === "string" && init.body !== "" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: full, body });
    const key = `${method} ${path}`;
    const gate = gates.get(key);
    if (gate) {
      gates.delete(key);
      await gate;
    }
    const failure = failures.get(key);
    if (failure) {
      failures.delete(key);
      return failure();
    }
    if (method === "GET" && path === "/api/users") {
      const search = (params.get("search") ?? "").toLowerCase();
      const limit = Number(params.get("limit") ?? 50);
      const offset = Number(params.get("offset") ?? 0);
      const matching = rows.filter((r) => !search || r.email.includes(search) || r.name.toLowerCase().includes(search));
      return json({ data: matching.slice(offset, offset + limit), total: matching.length, limit, offset });
    }
    if (method === "POST" && path === "/api/users") {
      if (rows.some((r) => r.email === body.email)) return problem("USER_CONFLICT", 409, [{ field: "email" }]);
      serial += 1;
      const created = row({ id: `novo${serial}`, name: body.name, email: body.email, handle: body.handle, role: body.role, mustChangePassword: true });
      rows.push(created);
      return json({ data: { ...created, temporaryPassword: `SenhaProvisoria${serial}` } }, 201);
    }
    const match = path.match(/^\/api\/users\/([^/]+)(\/password|\/ban)?$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const target = rows.find((r) => r.id === id);
      if (!target) return problem("NOT_FOUND", 404);
      if (match[2] === "/password" && method === "PUT") {
        target.mustChangePassword = true;
        serial += 1;
        return json({ data: { id, temporaryPassword: `Redefinida${serial}` } });
      }
      if (match[2] === "/ban" && method === "POST") {
        if (id === "adm" && activeAdmins() <= 1) return problem("LAST_ADMIN", 409);
        if (!body.reason?.trim()) return problem("VALIDATION_ERROR", 422, [{ field: "reason", message: "Informe o motivo." }]);
        target.suspended = true;
        target.banReason = body.reason;
        target.banExpires = body.expiresAt ?? null;
        return json({ data: target });
      }
      if (match[2] === "/ban" && method === "DELETE") {
        target.suspended = false;
        target.banReason = null;
        target.banExpires = null;
        return json({ data: target });
      }
      if (!match[2] && method === "PATCH") {
        Object.assign(target, body);
        return json({ data: target });
      }
      if (!match[2] && method === "DELETE") {
        if (target.role === "admin" && !target.suspended && activeAdmins() <= 1) return problem("LAST_ADMIN", 409);
        const has = contents[id] ?? 0;
        const content = params.get("content");
        if (has > 0 && !content) return problem("USER_HAS_CONTENT", 409);
        if (content === "transfer" && params.get("onConflict") !== "rename" && contents[`conflito:${id}`]) return problem("SLUG_CONFLICT", 409, [{ conflicts: ["calculo", "fisica"] }]);
        const renamed = content === "transfer" && params.get("onConflict") === "rename" && contents[`conflito:${id}`] ? [{ id: "c1", from: "calculo", to: "calculo-2" }] : [];
        rows = rows.filter((r) => r.id !== id);
        return json({ data: { id, content: has > 0 ? (content === "transfer" ? "transferred" : "deleted") : "none", roots: has, renamed } });
      }
    }
    return problem("NOT_FOUND", 404);
  }

  return {
    calls,
    fetch: vi.fn(handle),
    get rows() {
      return rows;
    },
    /** @param {string} key @param {number} status @param {string} code @param {unknown[]} [details] */
    failNext(key, status, code, details = []) {
      failures.set(key, () => problem(code, status, details));
    },
    /** @param {string} key */
    pause(key) {
      /** @type {() => void} */
      let release = () => {};
      gates.set(key, new Promise((resolve) => (release = () => resolve())));
      return release;
    },
    /** @param {string} method @param {string} prefix */
    callsTo: (method, prefix) => calls.filter((c) => c.method === method && c.path.startsWith(prefix)),
  };
}

/** @type {ReturnType<typeof fakeApi>} */
let api;

/** @param {{ rows?: Row[], contents?: Record<string, number>, currentUserId?: string, activeAdminCount?: number | null, limit?: number, total?: number }} [options] */
function setup({ rows = SAMPLE, contents, currentUserId = "adm", activeAdminCount = 1, limit = 50, total } = {}) {
  api = fakeApi(rows, { contents });
  vi.stubGlobal("fetch", api.fetch);
  const shown = rows.slice(0, limit);
  return render(
    <UserTable initial={{ data: shown, total: total ?? rows.length, limit, offset: 0 }} currentUserId={currentUserId} activeAdminCount={activeAdminCount} />,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const card = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.querySelector(`li[data-user-id="${id}"]`));
const button = (/** @type {RegExp | string} */ name) => /** @type {HTMLButtonElement} */ (screen.getByRole("button", { name }));
const dialog = () => /** @type {HTMLElement} */ (document.querySelector("dialog"));
const inDialog = () => within(dialog());
const ids = () => [...document.querySelectorAll("li[data-user-id]")].map((el) => el.getAttribute("data-user-id"));
const everything = () => `${document.documentElement.outerHTML}${JSON.stringify({ ...localStorage, ...sessionStorage })}`;

describe("a lista", () => {
  it("mostra cada usuário com nome, e-mail, papel e o handle como link ao espaço", () => {
    setup();
    expect(ids()).toEqual(["adm", "ana", "bia", "cris", "davi"]);
    expect(within(card("ana")).getByText("Ana Souza")).toBeTruthy();
    expect(within(card("ana")).getByText("ana@exemplo.com")).toBeTruthy();
    expect(within(card("adm")).getByText("Administrador")).toBeTruthy();
    expect(within(card("ana")).getByText("Usuário")).toBeTruthy();
    expect(within(card("ana")).getByRole("link", { name: "/ana" }).getAttribute("href")).toBe("/ana");
    expect(within(card("bia")).getByText(/Sem handle: sem espaço público/)).toBeTruthy();
  });

  it("o estado vem em texto: Ativo, Suspenso (até quando, motivo) e senha provisória pendente", () => {
    setup();
    expect(within(card("ana")).getByText("Ativo")).toBeTruthy();
    expect(within(card("cris")).getByText(/Suspenso \(até \d{2}\/12\/2026/)).toBeTruthy();
    expect(within(card("cris")).getByText("Motivo: Spam repetido")).toBeTruthy();
    expect(within(card("davi")).getByText("Senha provisória pendente")).toBeTruthy();
  });

  it("suspenso sem prazo diz 'sem prazo'", () => {
    setup({ rows: [row({ id: "x", suspended: true, banReason: "r" })] });
    expect(screen.getByText("Suspenso (sem prazo)")).toBeTruthy();
  });

  it("marca a própria conta com 'Você'", () => {
    setup();
    expect(within(card("adm")).getByText("Você")).toBeTruthy();
    expect(within(card("ana")).queryByText("Você")).toBeNull();
  });

  it("os endereços vêm de modelos de texto (conteúdo do usuário e espaço)", () => {
    render(<UserTable initial={{ data: [SAMPLE[1]], total: 1, limit: 50, offset: 0 }} currentUserId="adm" spaceHref="/espaco/{handle}" contentHref="/painel/{id}/itens" />);
    expect(screen.getByRole("link", { name: "/ana" }).getAttribute("href")).toBe("/espaco/ana");
    expect(screen.getByRole("link", { name: "Ver o conteúdo: Ana Souza" }).getAttribute("href")).toBe("/painel/ana/itens");
  });

  it("o padrão do 'Ver o conteúdo' é /admin/usuarios/{id}/conteudo", () => {
    setup();
    expect(screen.getByRole("link", { name: "Ver o conteúdo: Ana Souza" }).getAttribute("href")).toBe("/admin/usuarios/ana/conteudo");
  });

  it("todo texto de usuário é texto puro", () => {
    setup({ rows: [row({ id: "x", name: "<b>Negrito</b><script>window.__xss=1</script>", email: "<i>e</i>@x.com", handle: null, suspended: true, banReason: "<img src=x onerror=alert(1)>" })] });
    expect(document.querySelector("li b, li i, li script, li img")).toBeNull();
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
    expect(screen.getByText("<b>Negrito</b><script>window.__xss=1</script>")).toBeTruthy();
  });

  it("lista vazia", () => {
    setup({ rows: [] });
    expect(screen.getByText("Nenhum usuário.")).toBeTruthy();
  });

  it("só usa tokens de tema", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/text-white|bg-white|bg-black|(bg|text|border)-(red|blue|gray|slate|green)-\d/);
  });
});

describe("as regras da matriz: a tela não oferece o que o servidor recusaria", () => {
  it("a própria conta: suspender e excluir ficam desabilitados, com a explicação; redefinir a senha continua valendo", () => {
    setup({ activeAdminCount: 3 });
    expect(button("Suspender: Chefe").disabled).toBe(true);
    expect(button("Excluir: Chefe").disabled).toBe(true);
    expect(within(card("adm")).getByText(/É a sua conta/)).toBeTruthy();
    expect(button("Suspender: Chefe").getAttribute("aria-describedby")).toBe(within(card("adm")).getByText(/É a sua conta/).id);
    expect(button("Redefinir a senha: Chefe").disabled).toBe(false);
    expect(button("Editar: Chefe").disabled).toBe(false);
  });

  it("o último administrador ativo (que não é a própria conta): suspender e excluir desabilitados", () => {
    setup({ currentUserId: "ana", activeAdminCount: 1 });
    expect(button("Suspender: Chefe").disabled).toBe(true);
    expect(button("Excluir: Chefe").disabled).toBe(true);
    expect(within(card("adm")).getByText(/último administrador ativo/)).toBeTruthy();
  });

  it("havendo outro administrador ativo, o administrador pode ser suspenso e excluído", () => {
    setup({ currentUserId: "ana", activeAdminCount: 2 });
    expect(button("Suspender: Chefe").disabled).toBe(false);
    expect(button("Excluir: Chefe").disabled).toBe(false);
  });

  it("um usuário comum sempre pode ser suspenso e excluído", () => {
    setup({ activeAdminCount: 1 });
    expect(button("Suspender: Ana Souza").disabled).toBe(false);
    expect(button("Excluir: Ana Souza").disabled).toBe(false);
  });

  it("quem está suspenso tem 'Reativar' no lugar de 'Suspender'", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Suspender: Cris Dias" })).toBeNull();
    expect(button("Reativar: Cris Dias")).toBeTruthy();
  });

  it("sem saber quantos administradores há, a tela não bloqueia (o servidor decide)", () => {
    setup({ currentUserId: "ana", activeAdminCount: null });
    expect(button("Suspender: Chefe").disabled).toBe(false);
  });
});

describe("busca e paginação", () => {
  it("buscar envia ?search= e volta ao começo; 'Limpar a busca' remove o filtro", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Buscar por e-mail ou nome"), { target: { value: "  ana " } });
    fireEvent.click(button("Buscar"));
    await waitFor(() => expect(ids()).toEqual(["ana"]));
    expect(api.calls.at(-1)?.path).toBe("/api/users?limit=50&offset=0&search=ana");
    expect(screen.getByText("Mostrando 1 a 1 de 1 usuário.")).toBeTruthy();
    fireEvent.click(button("Limpar a busca"));
    await waitFor(() => expect(ids()).toHaveLength(5));
    expect(screen.queryByRole("button", { name: "Limpar a busca" })).toBeNull();
  });

  it("uma busca sem resultado diz isso", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Buscar por e-mail ou nome"), { target: { value: "ninguem" } });
    fireEvent.click(button("Buscar"));
    await screen.findByText("Nenhum usuário encontrado para esta busca.");
  });

  it("a paginação mostra 'a a b de n', navega com offset e desabilita as pontas", async () => {
    setup({ limit: 2 });
    expect(screen.getByText("Mostrando 1 a 2 de 5 usuários.")).toBeTruthy();
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();
    expect(button("Anterior").disabled).toBe(true);
    fireEvent.click(button("Próxima"));
    await waitFor(() => expect(ids()).toEqual(["bia", "cris"]));
    expect(api.calls.at(-1)?.path).toBe("/api/users?limit=2&offset=2");
    expect(screen.getByText("Mostrando 3 a 4 de 5 usuários.")).toBeTruthy();
    fireEvent.click(button("Próxima"));
    await waitFor(() => expect(ids()).toEqual(["davi"]));
    expect(button("Próxima").disabled).toBe(true);
    fireEvent.click(button("Anterior"));
    await waitFor(() => expect(ids()).toEqual(["bia", "cris"]));
  });

  it("sem mais de uma página, não há paginação", () => {
    setup();
    expect(screen.queryByRole("navigation", { name: "Páginas de usuários" })).toBeNull();
  });

  it("uma falha ao buscar mostra a mensagem e mantém a lista", async () => {
    setup();
    api.failNext("GET /api/users", 500, "INTERNAL");
    fireEvent.click(button("Buscar"));
    await screen.findByText(/O servidor não conseguiu atender agora/);
    expect(ids()).toHaveLength(5);
  });
});

describe("criar (a senha provisória, uma única vez)", () => {
  /** Preenche e envia o formulário de novo usuário. */
  async function createBia2() {
    fireEvent.click(button("Novo usuário"));
    const form = screen.getByRole("region", { name: "Novo usuário" });
    fireEvent.change(within(form).getByLabelText("E-mail"), { target: { value: "carla@exemplo.com" } });
    fireEvent.change(within(form).getByLabelText("Nome de exibição"), { target: { value: "Carla Nunes" } });
    fireEvent.change(within(form).getByLabelText(/^Handle/), { target: { value: "carla" } });
    fireEvent.click(within(form).getByRole("button", { name: "Criar usuário" }));
  }

  it("abre o formulário com o foco no primeiro campo", () => {
    setup();
    fireEvent.click(button("Novo usuário"));
    expect(screen.getByRole("region", { name: "Novo usuário" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("E-mail"));
    expect(button("Novo usuário").disabled).toBe(true);
  });

  it("cria, atualiza a lista e mostra a senha provisória UMA vez", async () => {
    setup();
    await createBia2();
    await screen.findByText("SenhaProvisoria1");
    expect(screen.getByRole("region", { name: /Conta criada: senha provisória de carla@exemplo\.com/ })).toBeTruthy();
    expect(ids()).toContain("novo1");
    expect(screen.queryByRole("region", { name: "Novo usuário" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: /senha provisória de carla/ })));
  });

  it("a senha NÃO sobrevive ao fechar: some da árvore, dos atributos e dos armazenamentos", async () => {
    setup();
    await createBia2();
    await screen.findByText("SenhaProvisoria1");
    expect(everything()).toContain("SenhaProvisoria1");
    fireEvent.click(button(/Já anotei a senha/));
    expect(screen.queryByText("SenhaProvisoria1")).toBeNull();
    expect(everything()).not.toContain("SenhaProvisoria1");
    expect(document.activeElement).toBe(button("Novo usuário"));
  });

  it("a senha nunca vai a armazenamento, console nem URL durante o fluxo", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, /** @type {any} */ (m)).mockImplementation(() => {}));
    const url = window.location.href;
    setup();
    await createBia2();
    await screen.findByText("SenhaProvisoria1");
    fireEvent.click(button(/Já anotei a senha/));
    expect(setItem).not.toHaveBeenCalled();
    expect(window.location.href).toBe(url);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(api.calls)).not.toContain("SenhaProvisoria1");
  });

  it("uma recarga da lista (outra ação) não traz a senha de volta depois de fechada", async () => {
    setup();
    await createBia2();
    await screen.findByText("SenhaProvisoria1");
    fireEvent.click(button(/Já anotei a senha/));
    fireEvent.click(button("Buscar"));
    await waitFor(() => expect(api.callsTo("GET", "/api/users").length).toBeGreaterThan(1));
    expect(everything()).not.toContain("SenhaProvisoria1");
  });

  it("e-mail repetido: a mensagem fica no formulário, que segue aberto", async () => {
    setup();
    fireEvent.click(button("Novo usuário"));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("Nome de exibição"), { target: { value: "Outra Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar usuário" }));
    await screen.findByText("Já existe uma conta com este e-mail.");
    expect(screen.getByRole("region", { name: "Novo usuário" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /senha provisória/ })).toBeNull();
  });

  it("cancelar fecha o formulário e devolve o foco ao botão", () => {
    setup();
    fireEvent.click(button("Novo usuário"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("region", { name: "Novo usuário" })).toBeNull();
    return waitFor(() => expect(document.activeElement).toBe(button("Novo usuário")));
  });
});

describe("editar", () => {
  it("abre o formulário de edição no lugar, salva e atualiza a lista", async () => {
    setup();
    fireEvent.click(button("Editar: Ana Souza"));
    const form = screen.getByRole("region", { name: "Editar usuário" });
    fireEvent.change(within(form).getByLabelText("Nome de exibição"), { target: { value: "Ana Maria" } });
    fireEvent.click(within(form).getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Os dados de Ana Maria foram salvos.");
    expect(within(card("ana")).getByText("Ana Maria")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Editar usuário" })).toBeNull();
    expect(api.callsTo("PATCH", "/api/users/ana")[0].body).toEqual({ name: "Ana Maria" });
  });
});

describe("redefinir a senha", () => {
  it("pede confirmação, avisa o que acontece e mostra a nova senha provisória uma vez", async () => {
    setup();
    fireEvent.click(button("Redefinir a senha: Ana Souza"));
    expect(screen.getByRole("alertdialog", { name: "Redefinir a senha de Ana Souza?" })).toBeTruthy();
    expect(inDialog().getByText(/sessões da pessoa são encerradas/)).toBeTruthy();
    expect(api.callsTo("PUT", "/api/users/ana/password")).toHaveLength(0);
    fireEvent.click(inDialog().getByRole("button", { name: "Redefinir a senha" }));
    await screen.findByText("Redefinida1");
    expect(screen.getByRole("region", { name: /Senha redefinida: senha provisória de ana@exemplo\.com/ })).toBeTruthy();
    expect(document.querySelector("dialog")).toBeNull();
    fireEvent.click(button(/Já anotei a senha/));
    expect(everything()).not.toContain("Redefinida1");
  });

  it("cancelar não envia nada", () => {
    setup();
    fireEvent.click(button("Redefinir a senha: Ana Souza"));
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    expect(api.callsTo("PUT", "/api/users")).toHaveLength(0);
  });

  it("uma falha aparece dentro do diálogo, que continua aberto", async () => {
    setup();
    api.failNext("PUT /api/users/ana/password", 500, "INTERNAL");
    fireEvent.click(button("Redefinir a senha: Ana Souza"));
    fireEvent.click(inDialog().getByRole("button", { name: "Redefinir a senha" }));
    await inDialog().findByText(/O servidor não conseguiu atender agora/);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(screen.queryByRole("region", { name: /senha provisória/ })).toBeNull();
  });
});

describe("suspender (RN23, RN26)", () => {
  const open = () => fireEvent.click(button("Suspender: Ana Souza"));
  const reason = () => /** @type {HTMLTextAreaElement} */ (inDialog().getByLabelText("Motivo"));
  const confirm = () => fireEvent.click(inDialog().getByRole("button", { name: "Suspender" }));

  it("abre o diálogo de moderação com o foco no motivo e o campo de prazo", () => {
    setup();
    open();
    expect(screen.getByRole("alertdialog", { name: "Suspender Ana Souza" })).toBeTruthy();
    expect(document.activeElement).toBe(reason());
    expect(inDialog().getByLabelText(/Prazo/)).toBeTruthy();
    expect(inDialog().getByText(/será notificada e verá este motivo/)).toBeTruthy();
  });

  it("o motivo vazio ou só de espaços é recusado antes de enviar", () => {
    setup();
    open();
    confirm();
    expect(inDialog().getByText("Informe o motivo.")).toBeTruthy();
    fireEvent.change(reason(), { target: { value: "   \n " } });
    confirm();
    expect(api.callsTo("POST", "/api/users/ana/ban")).toHaveLength(0);
  });

  it("sem prazo: envia o motivo aparado e nenhum expiresAt, e atualiza a linha", async () => {
    setup();
    open();
    fireEvent.change(reason(), { target: { value: "  Spam nos comentários  " } });
    confirm();
    await screen.findByText(/Ana Souza foi suspenso\(a\)/);
    expect(api.callsTo("POST", "/api/users/ana/ban")[0].body).toEqual({ reason: "Spam nos comentários" });
    expect(within(card("ana")).getByText("Suspenso (sem prazo)")).toBeTruthy();
    expect(within(card("ana")).getByText("Motivo: Spam nos comentários")).toBeTruthy();
    expect(button("Reativar: Ana Souza")).toBeTruthy();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("com prazo: converte para ISO 8601 e o envia", async () => {
    setup();
    open();
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    const local = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(inDialog().getByLabelText(/Prazo/), { target: { value: local } });
    confirm();
    await screen.findByText(/foi suspenso/);
    const sent = api.callsTo("POST", "/api/users/ana/ban")[0].body;
    expect(sent.expiresAt).toBe(new Date(local).toISOString());
    expect(sent.reason).toBe("Motivo");
  });

  it("um prazo no passado é recusado antes de enviar, com a mensagem no campo", () => {
    setup();
    open();
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    fireEvent.change(inDialog().getByLabelText(/Prazo/), { target: { value: "2020-01-01T10:00" } });
    confirm();
    expect(inDialog().getByText("O prazo da suspensão deve estar no futuro.")).toBeTruthy();
    expect(document.activeElement).toBe(inDialog().getByLabelText(/Prazo/));
    expect(api.callsTo("POST", "/api/users/ana/ban")).toHaveLength(0);
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("o último administrador (se a tela errar): o 409 aparece DENTRO do diálogo, que segue aberto com o texto", async () => {
    setup({ currentUserId: "ana", activeAdminCount: null });
    fireEvent.click(button("Suspender: Chefe"));
    fireEvent.change(reason(), { target: { value: "Motivo digitado" } });
    confirm();
    await inDialog().findByText(/último administrador ativo: ele não pode ser rebaixado, suspenso nem excluído/);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(reason().value).toBe("Motivo digitado");
    // E a tela aprende: o botão agora está desabilitado.
    fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
    expect(button("Suspender: Chefe").disabled).toBe(true);
  });

  it("a recusa do motivo pelo servidor (422) aparece no diálogo", async () => {
    setup();
    api.failNext("POST /api/users/ana/ban", 422, "VALIDATION_ERROR", [{ field: "reason", message: "O motivo deve ter no máximo 500 caracteres." }]);
    open();
    fireEvent.change(reason(), { target: { value: "x" } });
    confirm();
    await inDialog().findByText("O motivo deve ter no máximo 500 caracteres.");
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("suspender um administrador atualiza a contagem: o outro passa a ser o último", async () => {
    const rows = [row({ id: "adm", name: "Chefe", role: "admin" }), row({ id: "adm2", name: "Dona", role: "admin" }), row({ id: "ana", name: "Ana Souza" })];
    setup({ rows, currentUserId: "ana", activeAdminCount: 2 });
    fireEvent.click(button("Suspender: Chefe"));
    fireEvent.change(reason(), { target: { value: "Motivo" } });
    confirm();
    await screen.findByText(/Chefe foi suspenso/);
    expect(button("Suspender: Dona").disabled).toBe(true);
    expect(button("Excluir: Dona").disabled).toBe(true);
  });
});

describe("reativar", () => {
  it("pede confirmação e reativa", async () => {
    setup();
    fireEvent.click(button("Reativar: Cris Dias"));
    expect(screen.getByRole("dialog", { name: "Reativar Cris Dias?" })).toBeTruthy();
    fireEvent.click(inDialog().getByRole("button", { name: "Reativar" }));
    await screen.findByText("Cris Dias foi reativado(a).");
    expect(api.callsTo("DELETE", "/api/users/cris/ban")).toHaveLength(1);
    expect(within(card("cris")).getByText("Ativo")).toBeTruthy();
    expect(button("Suspender: Cris Dias")).toBeTruthy();
  });
});

describe("excluir (RN24)", () => {
  it("um usuário sem conteúdo sai na hora, depois da confirmação", async () => {
    setup();
    fireEvent.click(button("Excluir: Ana Souza"));
    expect(screen.getByRole("alertdialog", { name: "Excluir Ana Souza?" })).toBeTruthy();
    expect(api.callsTo("DELETE", "/api/users/ana")).toHaveLength(0);
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/Ana Souza foi excluído\(a\)\. A conta não tinha conteúdo\./);
    expect(ids()).not.toContain("ana");
    expect(api.callsTo("DELETE", "/api/users/ana")[0].path).toBe("/api/users/ana");
  });

  it("o foco vai ao botão 'Novo usuário' depois de excluir", async () => {
    setup();
    fireEvent.click(button("Excluir: Ana Souza"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/foi excluído/);
    await waitFor(() => expect(document.activeElement).toBe(button("Novo usuário")));
  });

  describe("com conteúdo: a escolha do destino", () => {
    /** Abre o diálogo de exclusão de Ana (com conteúdo) e passa ao passo da escolha. */
    async function toChoice(contents = { ana: 3 }) {
      setup({ contents });
      button("Excluir: Ana Souza").focus(); // como um clique de verdade: o botão fica focado
      fireEvent.click(button("Excluir: Ana Souza"));
      fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
      await screen.findByRole("alertdialog", { name: "O que fazer com o conteúdo de Ana Souza?" });
    }
    const confirm = () => fireEvent.click(inDialog().getByRole("button", { name: "Excluir a conta" }));

    it("o 409 USER_HAS_CONTENT leva ao passo da escolha, sem nada pré-selecionado", async () => {
      await toChoice();
      expect(inDialog().getByText(/Esta conta tem conteúdo/)).toBeTruthy();
      expect(inDialog().getAllByRole("radio").every((radio) => !(/** @type {HTMLInputElement} */ (radio).checked))).toBe(true);
      expect(api.callsTo("DELETE", "/api/users/ana")).toHaveLength(1);
    });

    it("sem escolher o destino, não exclui e pede a escolha (nada de excluir por omissão)", async () => {
      await toChoice();
      confirm();
      await inDialog().findByText(/Escolha o que fazer com o conteúdo/);
      expect(api.callsTo("DELETE", "/api/users/ana")).toHaveLength(1); // só a tentativa sem escolha
      expect(dialog().hasAttribute("open")).toBe(true);
    });

    it("transferir exige o usuário de destino", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByLabelText("Transferir o conteúdo para outro usuário"));
      confirm();
      await inDialog().findByText("Escolha o usuário que receberá o conteúdo.");
      expect(api.callsTo("DELETE", "/api/users/ana")).toHaveLength(1);
    });

    it("o destino nunca é o próprio usuário excluído", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByLabelText("Transferir o conteúdo para outro usuário"));
      const options = within(inDialog().getByLabelText("Usuário de destino")).getAllByRole("option").map((o) => o.textContent);
      expect(options.some((text) => /Ana Souza/.test(text ?? ""))).toBe(false);
      expect(options.some((text) => /Bia Lima \(bia@exemplo\.com\)/.test(text ?? ""))).toBe(true);
    });

    it("transferir envia content=transfer&to=… e, por padrão, recusa conflito (sem onConflict)", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByLabelText("Transferir o conteúdo para outro usuário"));
      fireEvent.change(inDialog().getByLabelText("Usuário de destino"), { target: { value: "bia" } });
      confirm();
      await screen.findByText(/Ana Souza foi excluído\(a\)\. O conteúdo \(3 itens na raiz\) foi transferido\./);
      expect(api.callsTo("DELETE", "/api/users/ana").at(-1)?.path).toBe("/api/users/ana?content=transfer&to=bia&onConflict=fail");
    });

    it("renomear envia onConflict=rename e o resumo mostra as raízes renomeadas", async () => {
      await toChoice({ ana: 2, "conflito:ana": 1 });
      fireEvent.click(inDialog().getByLabelText("Transferir o conteúdo para outro usuário"));
      fireEvent.change(inDialog().getByLabelText("Usuário de destino"), { target: { value: "bia" } });
      fireEvent.click(inDialog().getByLabelText(/Renomear os itens em conflito/));
      confirm();
      await screen.findByText(/foi transferido/);
      expect(api.callsTo("DELETE", "/api/users/ana").at(-1)?.path).toBe("/api/users/ana?content=transfer&to=bia&onConflict=rename");
      expect(screen.getByText(/Itens renomeados na raiz do destino/)).toBeTruthy();
      expect(screen.getByText("calculo", { selector: "code" })).toBeTruthy();
      expect(screen.getByText("calculo-2", { selector: "code" })).toBeTruthy();
    });

    it("conflito de slug com 'recusar tudo': a mensagem lista os slugs e o diálogo segue aberto", async () => {
      await toChoice({ ana: 2, "conflito:ana": 1 });
      fireEvent.click(inDialog().getByLabelText("Transferir o conteúdo para outro usuário"));
      fireEvent.change(inDialog().getByLabelText("Usuário de destino"), { target: { value: "bia" } });
      confirm();
      await inDialog().findByText(/Endereços em conflito: calculo, fisica\./);
      expect(dialog().hasAttribute("open")).toBe(true);
      expect(ids()).toContain("ana");
    });

    it("excluir junto exige digitar o e-mail da conta (confirmação explícita)", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByLabelText("Excluir o conteúdo junto com a conta"));
      expect(inDialog().getByText(/será apagado para sempre/)).toBeTruthy();
      confirm();
      await inDialog().findByText(/digite o e-mail da conta/);
      fireEvent.change(inDialog().getByLabelText(/digite o e-mail da conta/), { target: { value: "outra@pessoa.com" } });
      confirm();
      await waitFor(() => expect(inDialog().getByLabelText(/digite o e-mail da conta/).getAttribute("aria-invalid")).toBe("true"));
      expect(api.callsTo("DELETE", "/api/users/ana")).toHaveLength(1);
    });

    it("com o e-mail certo (qualquer caixa), exclui o conteúdo junto", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByLabelText("Excluir o conteúdo junto com a conta"));
      fireEvent.change(inDialog().getByLabelText(/digite o e-mail da conta/), { target: { value: " ANA@exemplo.com " } });
      confirm();
      await screen.findByText(/O conteúdo foi excluído junto\./);
      expect(api.callsTo("DELETE", "/api/users/ana").at(-1)?.path).toBe("/api/users/ana?content=delete");
      expect(ids()).not.toContain("ana");
    });

    it("cancelar em qualquer passo não exclui nada e devolve o foco", async () => {
      await toChoice();
      fireEvent.click(inDialog().getByRole("button", { name: "Cancelar" }));
      expect(document.querySelector("dialog")).toBeNull();
      expect(ids()).toContain("ana");
      await waitFor(() => expect(document.activeElement).toBe(button("Excluir: Ana Souza")));
    });
  });

  it("o último administrador (se a tela errar): o 409 aparece no diálogo, que segue aberto", async () => {
    setup({ currentUserId: "ana", activeAdminCount: null });
    fireEvent.click(button("Excluir: Chefe"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await inDialog().findByText(/último administrador ativo/);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(ids()).toContain("adm");
  });

  it("um usuário que já não existe (404): avisa, fecha o diálogo e recarrega a lista", async () => {
    setup();
    api.failNext("DELETE /api/users/ana", 404, "NOT_FOUND");
    fireEvent.click(button("Excluir: Ana Souza"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/não existe mais/);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("o resumo pode ser fechado", async () => {
    setup();
    fireEvent.click(button("Excluir: Ana Souza"));
    fireEvent.click(inDialog().getByRole("button", { name: "Excluir" }));
    await screen.findByText(/foi excluído/);
    fireEvent.click(button("Fechar o resumo"));
    expect(screen.queryByText(/foi excluído/)).toBeNull();
  });
});

describe("sessão e erros", () => {
  it("401 oferece o caminho para o login", async () => {
    setup();
    api.failNext("GET /api/users", 401, "UNAUTHENTICATED");
    fireEvent.click(button("Buscar"));
    await screen.findByText(/Sua sessão expirou/);
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
  });

  it("as regiões viva de erro e de estado estão sempre presentes", () => {
    setup();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('[role="status"]')).not.toBeNull();
  });
});
