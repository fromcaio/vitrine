// Testes de unidade dos validadores de formato (RN03, RN09, RN17; CT24 e CT33, parte de API).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { CONTENT_STATUSES as DB_STATUSES, CONTENT_TYPES as DB_TYPES } from "@/lib/db";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  SLUG_MAX_LENGTH,
  SOCIAL_URL_FIELDS,
  adminBootstrapSchema,
  appearanceUpdateSchema,
  banSchema,
  configurationUpdateSchema,
  contentCreateSchema,
  contentReorderSchema,
  contentUpdateSchema,
  handleError,
  handleSchema,
  hexColorSchema,
  isAssetUrl,
  isHttpUrl,
  normalizeHandle,
  passwordChangeSchema,
  passwordResetCommandSchema,
  passwordResetSchema,
  profileUpdateSchema,
  safeRedirectPath,
  userCreateSchema,
  userDeleteQuerySchema,
  userListQuerySchema,
  userUpdateSchema,
  versionSchema,
  slugSchema,
  socialUrlSchema,
  suggestSlug,
  validate,
} from "@/lib/validators";

/** Campos apontados em `details` por uma validação que falhou. */
function invalidFields(schema, input) {
  const result = validate(schema, input);
  return result.ok ? [] : result.details.map((detail) => detail.field);
}

describe("slug (RN03)", () => {
  it.each(["a", "introducao", "calculo-1", "a1-b2-c3", "2026", "x".repeat(SLUG_MAX_LENGTH)])(
    "aceita %s",
    (slug) => {
      expect(validate(slugSchema, slug)).toEqual({ ok: true, data: slug });
    },
  );

  it.each([
    ["vazio", ""],
    ["maiúsculas", "Introducao"],
    ["acento", "introdução"],
    ["espaço", "notas de aula"],
    ["sublinhado", "notas_de_aula"],
    ["hífen inicial", "-notas"],
    ["hífen final", "notas-"],
    ["hífen duplo", "notas--aula"],
    ["barra", "a/b"],
    ["ponto", "a.b"],
    ["81 caracteres", "x".repeat(SLUG_MAX_LENGTH + 1)],
    ["não é texto", 42],
    ["nulo", null],
  ])("recusa %s", (_label, slug) => {
    expect(validate(slugSchema, slug).ok).toBe(false);
  });

  it("o slug não tem nomes reservados em lugar nenhum: os nomes reservados valem para o handle (RN03, RN20)", () => {
    for (const slug of ["admin", "api", "login", "logout"]) expect(validate(slugSchema, slug).ok, slug).toBe(true);
  });

  it("sugere um slug livre entre os irmãos", () => {
    expect(suggestSlug("introducao", ["introducao"])).toBe("introducao-2");
    expect(suggestSlug("introducao", ["introducao", "introducao-2", "introducao-3"])).toBe("introducao-4");
  });

  it("a sugestão respeita o tamanho máximo e o formato", () => {
    const long = "x".repeat(SLUG_MAX_LENGTH);
    const suggestion = suggestSlug(long, [long]);
    expect(suggestion).toHaveLength(SLUG_MAX_LENGTH);
    expect(validate(slugSchema, suggestion).ok).toBe(true);

    // O corte não pode deixar hífen duplo antes do sufixo
    const hyphenAtCut = `${"x".repeat(SLUG_MAX_LENGTH - 3)}-yy`;
    expect(validate(slugSchema, suggestSlug(hyphenAtCut, [hyphenAtCut])).ok).toBe(true);
  });
});

describe("cor (RN09)", () => {
  it.each(["#3b82f6", "#1E293B", "#000000", "#FfFfFf"])("aceita %s", (color) => {
    expect(validate(hexColorSchema, color).ok).toBe(true);
  });

  it.each([
    "3b82f6",
    "#fff",
    "#3b82f6ff",
    "#3b82fg",
    "red",
    "rgb(0,0,0)",
    "#3b82f6; background: url(x)",
    " #3b82f6",
    "",
  ])("recusa %s", (color) => {
    expect(validate(hexColorSchema, color).ok).toBe(false);
  });
});

describe("URL http(s) dos links sociais (RN17)", () => {
  it.each([
    "https://github.com/exemplo",
    "http://exemplo.test",
    "https://discord.gg/abc123",
    "HTTPS://EXEMPLO.TEST/Canal?x=1#topo",
    "https://exemplo.test:8443/a/b",
  ])("aceita %s", (url) => {
    expect(isHttpUrl(url)).toBe(true);
    expect(validate(socialUrlSchema, url)).toEqual({ ok: true, data: url });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://exemplo.test/arquivo",
    "mailto:alguem@exemplo.test",
    "//exemplo.test/caminho",
    "/caminho/relativo",
    "exemplo.test",
    "http:exemplo.test",
    "https://",
    "https:// exemplo.test",
    "vbscript:msgbox(1)",
  ])("recusa %s", (url) => {
    expect(isHttpUrl(url)).toBe(false);
    expect(validate(socialUrlSchema, url).ok).toBe(false);
  });

  it("campo vazio (ou só com espaços) equivale a link ausente", () => {
    expect(validate(socialUrlSchema, "")).toEqual({ ok: true, data: null });
    expect(validate(socialUrlSchema, "   ")).toEqual({ ok: true, data: null });
    expect(validate(socialUrlSchema, null)).toEqual({ ok: true, data: null });
  });

  it("apara os espaços em volta de uma URL válida", () => {
    expect(validate(socialUrlSchema, "  https://exemplo.test  ")).toEqual({
      ok: true,
      data: "https://exemplo.test",
    });
  });
});

describe("logotipo e favicon (D-10)", () => {
  it.each(["https://exemplo.test/logo.png", "/logo.svg", "/imagens/favicon.ico"])("aceita %s", (url) => {
    expect(isAssetUrl(url)).toBe(true);
  });

  it.each(["//exemplo.test/logo.png", "logo.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/\\exemplo.test"])(
    "recusa %s",
    (url) => {
      expect(isAssetUrl(url)).toBe(false);
    },
  );
});

describe("criação de conteúdo (POST /api/contents)", () => {
  const valid = { title: "Introdução", slug: "introducao", type: "DOCUMENT" };

  it("aceita o mínimo e não inventa valores padrão", () => {
    expect(validate(contentCreateSchema, valid)).toEqual({ ok: true, data: valid });
  });

  it("aceita todos os campos do contrato", () => {
    const full = { ...valid, parentId: "colecao-1", body: "# Olá", order: 3, status: "DRAFT" };
    expect(validate(contentCreateSchema, full)).toEqual({ ok: true, data: full });
  });

  it("descarta campos desconhecidos, inclusive o autor (RN13)", () => {
    const result = validate(contentCreateSchema, { ...valid, authorId: "intruso", id: "x", createdAt: "2020" });
    expect(result).toEqual({ ok: true, data: valid });
  });

  it("apara o título e recusa título em branco", () => {
    expect(validate(contentCreateSchema, { ...valid, title: "  Olá  " })).toMatchObject({ data: { title: "Olá" } });
    expect(invalidFields(contentCreateSchema, { ...valid, title: "   " })).toEqual(["title"]);
  });

  it("aponta cada campo inválido", () => {
    expect(invalidFields(contentCreateSchema, {})).toEqual(["title", "slug", "type"]);
    expect(invalidFields(contentCreateSchema, { ...valid, type: "PAGE" })).toEqual(["type"]);
    expect(invalidFields(contentCreateSchema, { ...valid, status: "ARCHIVED" })).toEqual(["status"]);
    expect(invalidFields(contentCreateSchema, { ...valid, order: -1 })).toEqual(["order"]);
    expect(invalidFields(contentCreateSchema, { ...valid, order: 1.5 })).toEqual(["order"]);
    expect(invalidFields(contentCreateSchema, { ...valid, order: "1" })).toEqual(["order"]);
    expect(invalidFields(contentCreateSchema, { ...valid, parentId: "" })).toEqual(["parentId"]);
    expect(invalidFields(contentCreateSchema, { ...valid, body: 42 })).toEqual(["body"]);
  });

  it("aceita slug admin, api ou login na raiz e dentro de uma coleção (RN03)", () => {
    expect(validate(contentCreateSchema, { ...valid, slug: "admin" }).ok).toBe(true);
    expect(validate(contentCreateSchema, { ...valid, slug: "api", parentId: null }).ok).toBe(true);
    expect(validate(contentCreateSchema, { ...valid, slug: "login", parentId: "colecao-1" }).ok).toBe(true);
  });

  it("as mensagens são em português", () => {
    const result = validate(contentCreateSchema, { slug: "Com Espaço", type: "DOCUMENT" });
    expect(result).toEqual({
      ok: false,
      details: [
        { field: "title", message: "Campo obrigatório." },
        { field: "slug", message: "O slug deve conter apenas letras minúsculas, dígitos e hífens." },
      ],
    });
  });

  it("usa os mesmos tipos e estados da camada de dados", () => {
    expect([...CONTENT_TYPES]).toEqual([...DB_TYPES]);
    expect([...CONTENT_STATUSES]).toEqual([...DB_STATUSES]);
  });
});

describe("atualização de conteúdo (PATCH /api/contents/:id)", () => {
  it("aceita qualquer subconjunto dos campos", () => {
    expect(validate(contentUpdateSchema, { body: "novo corpo" })).toEqual({ ok: true, data: { body: "novo corpo" } });
    expect(validate(contentUpdateSchema, { status: "DRAFT" }).ok).toBe(true);
    expect(validate(contentUpdateSchema, { parentId: null })).toEqual({ ok: true, data: { parentId: null } });
    expect(validate(contentUpdateSchema, { body: null }).ok).toBe(true);
  });

  it("recusa atualização sem nenhum campo conhecido", () => {
    expect(validate(contentUpdateSchema, {}).ok).toBe(false);
    expect(validate(contentUpdateSchema, { authorId: "intruso" }).ok).toBe(false);
  });

  it("valida o formato dos campos informados", () => {
    expect(invalidFields(contentUpdateSchema, { slug: "Inválido" })).toEqual(["slug"]);
    expect(invalidFields(contentUpdateSchema, { status: "X", order: -2 })).toEqual(["order", "status"]);
    expect(invalidFields(contentUpdateSchema, { title: "" })).toEqual(["title"]);
  });
});

describe("lote de reordenação (PATCH /api/contents/reorder)", () => {
  it("aceita itens com e sem parentId", () => {
    const items = [
      { id: "a", order: 0 },
      { id: "b", parentId: null, order: 1 },
      { id: "c", parentId: "a", order: 0 },
    ];
    expect(validate(contentReorderSchema, items)).toEqual({ ok: true, data: items });
  });

  it("recusa o que não é lista, lista vazia e itens malformados", () => {
    expect(validate(contentReorderSchema, { id: "a", order: 0 }).ok).toBe(false);
    expect(validate(contentReorderSchema, []).ok).toBe(false);
    expect(invalidFields(contentReorderSchema, [{ id: "a" }])).toEqual(["0.order"]);
    expect(invalidFields(contentReorderSchema, [{ id: "a", order: 0 }, { order: -1 }])).toEqual(["1.id", "1.order"]);
  });
});

describe("configuração (PUT /api/configuration)", () => {
  it("aceita identidade, cores e os seis links sociais", () => {
    const input = {
      siteName: "Notas de Aula",
      siteDescription: "Material didático",
      primaryColor: "#112233",
      secondaryColor: "#445566",
      accentColor: "#778899",
      logoUrl: "/logo.svg",
      faviconUrl: "https://exemplo.test/favicon.ico",
      ...Object.fromEntries(SOCIAL_URL_FIELDS.map((field) => [field, `https://exemplo.test/${field}`])),
    };
    expect(validate(configurationUpdateSchema, input)).toEqual({ ok: true, data: input });
  });

  it("recusa cor fora de #RRGGBB em cada um dos três campos (CT24)", () => {
    for (const field of ["primaryColor", "secondaryColor", "accentColor"]) {
      expect(invalidFields(configurationUpdateSchema, { [field]: "azul" })).toEqual([field]);
    }
  });

  it("recusa link social que não seja http(s) em cada um dos seis campos (CT33)", () => {
    for (const field of SOCIAL_URL_FIELDS) {
      expect(invalidFields(configurationUpdateSchema, { [field]: "javascript:alert(1)" })).toEqual([field]);
    }
  });

  it("converte campos opcionais vazios em null (RN17)", () => {
    expect(validate(configurationUpdateSchema, { githubUrl: "", siteDescription: "  ", logoUrl: "" })).toEqual({
      ok: true,
      data: { githubUrl: null, siteDescription: null, logoUrl: null },
    });
  });

  it("recusa nome do site em branco e atualização sem campos", () => {
    expect(invalidFields(configurationUpdateSchema, { siteName: "  " })).toEqual(["siteName"]);
    expect(validate(configurationUpdateSchema, {}).ok).toBe(false);
    expect(validate(configurationUpdateSchema, { id: "outro" }).ok).toBe(false);
  });
});

describe("credenciais do administrador inicial (RF22)", () => {
  it("normaliza o e-mail e usa o nome padrão", () => {
    expect(validate(adminBootstrapSchema, { email: "  Admin@Exemplo.Test ", password: "senha-ficticia-123" })).toEqual({
      ok: true,
      data: { email: "admin@exemplo.test", password: "senha-ficticia-123", name: "Administrador" },
    });
  });

  it("variável vazia equivale a não definida", () => {
    const result = validate(adminBootstrapSchema, { email: "", password: "", name: "" });
    expect(result).toEqual({
      ok: false,
      details: [
        { field: "email", message: "Defina ADMIN_EMAIL." },
        { field: "password", message: "Defina ADMIN_PASSWORD." },
      ],
    });
  });

  it("recusa e-mail inválido e senha fora dos limites", () => {
    expect(invalidFields(adminBootstrapSchema, { email: "sem-arroba", password: "senha-ficticia-123" })).toEqual(["email"]);
    expect(invalidFields(adminBootstrapSchema, { email: "a@exemplo.test", password: "curta" })).toEqual(["password"]);
    expect(invalidFields(adminBootstrapSchema, { email: "a@exemplo.test", password: "x".repeat(129) })).toEqual(["password"]);
  });
});

describe("destino do redirecionamento após o login (UC08)", () => {
  it.each(["/admin", "/admin/conteudo?aba=1", "/"])("mantém o caminho interno %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://malicioso.test",
    "//malicioso.test",
    "/\\malicioso.test",
    "admin",
    "javascript:alert(1)",
    "",
    undefined,
    ["/admin"],
  ])("troca %s pelo painel", (value) => {
    expect(safeRedirectPath(value)).toBe("/admin");
  });
});

describe("handle (RN20)", () => {
  it("a lista de reservados é a da RN20 e não tem repetidos", () => {
    expect([...RESERVED_HANDLES]).toEqual(["admin", "api", "login", "logout", "_next"]);
    expect(new Set(RESERVED_HANDLES).size).toBe(RESERVED_HANDLES.length);
  });

  it.each(["ana", "ana-silva", "a1b", "abc", "x".repeat(30), "portal-2026"])("aceita %s", (handle) => {
    expect(handleError(handle)).toBeNull();
    expect(validate(handleSchema, handle)).toEqual({ ok: true, data: handle });
  });

  it.each([
    ["curto", "ab"],
    ["longo", "x".repeat(31)],
    ["maiúscula (sem normalizar)", "Ana"],
    ["hífen no início", "-ana"],
    ["hífen no fim", "ana-"],
    ["hífen repetido", "ana--silva"],
    ["sublinhado", "ana_silva"],
    ["ponto", "ana.silva"],
    ["espaço", "ana silva"],
    ["acento", "aná"],
    ["reservado admin", "admin"],
    ["reservado api", "api"],
    ["reservado login", "login"],
    ["reservado logout", "logout"],
    ["reservado _next", "_next"],
    ["número", 42],
  ])("handleError recusa %s", (_label, handle) => {
    expect(handleError(handle)).toEqual(expect.any(String));
  });

  it("o esquema normaliza (aparas e minúsculas) antes de validar", () => {
    expect(validate(handleSchema, "  Ana-Silva ")).toEqual({ ok: true, data: "ana-silva" });
    expect(validate(handleSchema, "  ADMIN ").ok).toBe(false);
    expect(invalidFields(handleSchema, "ab")).toEqual([""]);
  });

  it("normalizeHandle: vazio, nulo e indefinido viram null; o que não é texto passa para ser recusado", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("   ")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
    expect(normalizeHandle(undefined)).toBeNull();
    expect(normalizeHandle(7)).toBe(7);
  });

  it("o padrão é o mesmo do slug", () => {
    expect(HANDLE_PATTERN.test("ana-silva")).toBe(true);
  });
});

describe("versão do PATCH (RN18)", () => {
  it("aceita o updatedAt ISO 8601 que a API devolve", () => {
    expect(validate(versionSchema, "2026-10-04T12:00:00.000Z").ok).toBe(true);
    expect(validate(versionSchema, new Date().toISOString()).ok).toBe(true);
  });

  it.each(["ontem", "2026-10-04", "", "12345", 12345, null])("recusa %s", (value) => {
    expect(validate(versionSchema, value).ok).toBe(false);
  });

  it("o PATCH aceita a versão sozinha? Não: precisa de ao menos um campo do conteúdo", () => {
    expect(validate(contentUpdateSchema, { version: "2026-10-04T12:00:00.000Z" }).ok).toBe(false);
    expect(validate(contentUpdateSchema, { body: "x", version: "2026-10-04T12:00:00.000Z" })).toEqual({
      ok: true,
      data: { body: "x", version: "2026-10-04T12:00:00.000Z" },
    });
  });
});

describe("configuração do site e aparência (RF30, RF31)", () => {
  it("a configuração aceita as paletas noturnas, o texto do portal e o diretório", () => {
    const result = validate(configurationUpdateSchema, {
      darkPrimaryColor: "#112233",
      darkSecondaryColor: "#445566",
      darkAccentColor: "#778899",
      homeBody: "# Portal",
      directoryEnabled: false,
    });
    expect(result.ok).toBe(true);
  });

  it("recusa cor noturna fora do formato e diretório que não é booleano", () => {
    expect(invalidFields(configurationUpdateSchema, { darkPrimaryColor: "azul" })).toEqual(["darkPrimaryColor"]);
    expect(invalidFields(configurationUpdateSchema, { directoryEnabled: "sim" })).toEqual(["directoryEnabled"]);
  });

  it("a aparência não aceita o texto do portal nem o diretório (campos desconhecidos são descartados)", () => {
    const result = validate(appearanceUpdateSchema, { siteName: "Meu espaço", homeBody: "x", directoryEnabled: true });
    expect(result).toEqual({ ok: true, data: { siteName: "Meu espaço" } });
    expect(validate(appearanceUpdateSchema, { homeBody: "x" }).ok).toBe(false);
  });

  it("a aparência vale as mesmas regras de cor e de link", () => {
    expect(invalidFields(appearanceUpdateSchema, { primaryColor: "vermelho" })).toEqual(["primaryColor"]);
    expect(invalidFields(appearanceUpdateSchema, { githubUrl: "javascript:alert(1)" })).toEqual(["githubUrl"]);
    expect(validate(appearanceUpdateSchema, { discordUrl: "" })).toEqual({ ok: true, data: { discordUrl: null } });
  });
});

describe("contas e senhas (RN19 a RN24)", () => {
  const valid = { email: "ana@exemplo.test", name: "Ana", handle: "ana" };

  it("criação: normaliza o e-mail, usa o papel padrão user e descarta campos que o cliente não define", () => {
    const result = validate(userCreateSchema, {
      ...valid,
      email: "  ANA@Exemplo.test ",
      banned: true,
      mustChangePassword: false,
      emailVerified: false,
    });
    expect(result).toEqual({ ok: true, data: { email: "ana@exemplo.test", name: "Ana", handle: "ana", role: "user" } });
  });

  it("criação: e-mail inválido, nome em branco, papel desconhecido, handle reservado e senha fora dos limites", () => {
    expect(invalidFields(userCreateSchema, { ...valid, email: "sem-arroba" })).toEqual(["email"]);
    expect(invalidFields(userCreateSchema, { ...valid, name: "  " })).toEqual(["name"]);
    expect(invalidFields(userCreateSchema, { ...valid, name: "x".repeat(101) })).toEqual(["name"]);
    expect(invalidFields(userCreateSchema, { ...valid, role: "superuser" })).toEqual(["role"]);
    expect(invalidFields(userCreateSchema, { ...valid, handle: "admin" })).toEqual(["handle"]);
    expect(invalidFields(userCreateSchema, { ...valid, password: "curta" })).toEqual(["password"]);
    expect(invalidFields(userCreateSchema, { ...valid, password: "x".repeat(129) })).toEqual(["password"]);
  });

  it("criação: handle é opcional e pode ser nulo; o papel admin é aceito", () => {
    expect(validate(userCreateSchema, { email: "a@exemplo.test", name: "A" }).ok).toBe(true);
    expect(validate(userCreateSchema, { ...valid, handle: null, role: "admin" }).ok).toBe(true);
  });

  it("edição: ao menos um de nome, handle e papel; nada de e-mail, suspensão ou marcador", () => {
    expect(validate(userUpdateSchema, {}).ok).toBe(false);
    expect(validate(userUpdateSchema, { banned: true, mustChangePassword: false, email: "x@exemplo.test" }).ok).toBe(false);
    expect(validate(userUpdateSchema, { role: "admin" }).ok).toBe(true);
    expect(validate(userUpdateSchema, { handle: null })).toEqual({ ok: true, data: { handle: null } });
  });

  it("perfil: só o nome", () => {
    expect(validate(profileUpdateSchema, { name: "Nova", role: "admin" })).toEqual({ ok: true, data: { name: "Nova" } });
    expect(invalidFields(profileUpdateSchema, {})).toEqual(["name"]);
  });

  it("troca de senha: recusa a nova igual à atual e a nova fora dos limites", () => {
    expect(validate(passwordChangeSchema, { current: "senha-antiga-1", next: "senha-nova-2222" }).ok).toBe(true);
    expect(invalidFields(passwordChangeSchema, { current: "mesma-senha-123", next: "mesma-senha-123" })).toEqual(["next"]);
    expect(invalidFields(passwordChangeSchema, { current: "senha-antiga-1", next: "curta" })).toEqual(["next"]);
    expect(invalidFields(passwordChangeSchema, { next: "senha-nova-2222" })).toEqual(["current"]);
  });

  it("redefinição: a senha é opcional, de 8 a 128 caracteres", () => {
    expect(validate(passwordResetSchema, {}).ok).toBe(true);
    expect(validate(passwordResetSchema, { password: "senha-provisoria-1" }).ok).toBe(true);
    expect(invalidFields(passwordResetSchema, { password: "curta" })).toEqual(["password"]);
  });

  it("suspensão: o motivo é obrigatório (1 a 500) e o prazo, se houver, está no futuro", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(validate(banSchema, { reason: "Spam", expiresAt: future }).ok).toBe(true);
    expect(validate(banSchema, { reason: "Spam" }).ok).toBe(true);
    expect(validate(banSchema, { reason: "Spam", expiresAt: null }).ok).toBe(true);
    expect(invalidFields(banSchema, {})).toEqual(["reason"]);
    expect(invalidFields(banSchema, { reason: "   " })).toEqual(["reason"]);
    expect(invalidFields(banSchema, { reason: "x".repeat(501) })).toEqual(["reason"]);
    expect(invalidFields(banSchema, { reason: "Spam", expiresAt: new Date(Date.now() - 1000).toISOString() })).toEqual(["expiresAt"]);
    expect(invalidFields(banSchema, { reason: "Spam", expiresAt: "amanhã" })).toEqual(["expiresAt"]);
  });

  it("exclusão: transferir exige o destino; apagar não aceita destino", () => {
    expect(validate(userDeleteQuerySchema, {}).ok).toBe(true);
    expect(validate(userDeleteQuerySchema, { content: "delete" }).ok).toBe(true);
    expect(validate(userDeleteQuerySchema, { content: "transfer", to: "u1", onConflict: "rename" }).ok).toBe(true);
    expect(invalidFields(userDeleteQuerySchema, { content: "transfer" })).toEqual(["to"]);
    expect(invalidFields(userDeleteQuerySchema, { content: "delete", to: "u1" })).toEqual(["content"]);
    expect(invalidFields(userDeleteQuerySchema, { content: "mover" })).toEqual(["content"]);
    expect(invalidFields(userDeleteQuerySchema, { content: "transfer", to: "u1", onConflict: "apagar" })).toEqual(["onConflict"]);
  });

  it("lista: limite de 1 a 100 (padrão 50) e deslocamento não negativo", () => {
    expect(validate(userListQuerySchema, {})).toEqual({ ok: true, data: { limit: 50, offset: 0 } });
    expect(validate(userListQuerySchema, { limit: "10", offset: "20", search: " ana " })).toEqual({
      ok: true,
      data: { limit: 10, offset: 20, search: "ana" },
    });
    expect(invalidFields(userListQuerySchema, { limit: "0" })).toEqual(["limit"]);
    expect(invalidFields(userListQuerySchema, { limit: "101" })).toEqual(["limit"]);
    expect(invalidFields(userListQuerySchema, { offset: "-1" })).toEqual(["offset"]);
  });
});

describe("comando admin:reset-password", () => {
  it("lê o e-mail da conta e a nova senha, com as mesmas regras do admin:create", () => {
    expect(validate(passwordResetCommandSchema, { email: " Ana@Exemplo.TEST ", password: "senha-provisoria-1" })).toEqual({
      ok: true,
      data: { email: "ana@exemplo.test", password: "senha-provisoria-1" },
    });
    expect(validate(passwordResetCommandSchema, { email: "", password: "" })).toEqual({
      ok: false,
      details: [
        { field: "email", message: "Defina ADMIN_EMAIL." },
        { field: "password", message: "Defina ADMIN_PASSWORD." },
      ],
    });
  });
});

describe("ADMIN_HANDLE do admin:create", () => {
  it("é opcional, normalizado e validado como o handle (RN20)", () => {
    const base = { email: "a@exemplo.test", password: "senha-ficticia-123" };
    expect(validate(adminBootstrapSchema, { ...base, handle: "  Portal " })).toMatchObject({ ok: true, data: { handle: "portal" } });
    expect(validate(adminBootstrapSchema, { ...base, handle: "" })).toMatchObject({ ok: true, data: { handle: undefined } });
    expect(invalidFields(adminBootstrapSchema, { ...base, handle: "admin" })).toEqual(["handle"]);
  });
});

describe("mensagens em português do Brasil (R-007)", () => {
  it("usa o módulo pt-BR do Zod, e não o pt (português de Portugal)", () => {
    const tooSmall = validate(z.string().min(3), "ab");
    const wrongType = validate(z.number(), "x");

    expect(tooSmall.ok).toBe(false);
    // O pt-BR diz "Pequeno demais"; o pt (Portugal) diz "Demasiado pequeno".
    expect(/** @type {any} */ (tooSmall).details[0].message).toBe("Pequeno demais: esperava que o texto tivesse >= 3 caracteres");
    expect(/** @type {any} */ (tooSmall).details[0].message).not.toMatch(/Demasiado/);
    expect(/** @type {any} */ (wrongType).details[0].message).toBe("Entrada inválida: esperava um número, recebeu um texto");
  });

  it("o módulo é importado só do pt-BR, e nunca `z.locales` (todos os idiomas: +257 kB no navegador)", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "lib", "validators.js"), "utf8");

    expect(source).toContain('from "zod/v4/locales/pt-BR.js"');
    // O uso (`z.locales.ptBR()`), e não a menção em comentário.
    expect(source).not.toMatch(/z\.locales\s*[.[]/);
    // O português de Portugal (`pt.js`) não pode voltar por engano.
    expect(source).not.toMatch(/from\s+"zod\/v4\/locales\/pt\.js"/);
  });
});
