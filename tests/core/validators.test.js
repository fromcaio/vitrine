// Testes de unidade dos validadores de formato (RN03, RN09, RN17; CT24 e CT33, parte de API).
import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES as DB_STATUSES, CONTENT_TYPES as DB_TYPES } from "@/lib/db";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  RESERVED_ROOT_SLUGS,
  SLUG_MAX_LENGTH,
  SOCIAL_URL_FIELDS,
  adminBootstrapSchema,
  configurationUpdateSchema,
  contentCreateSchema,
  contentReorderSchema,
  contentUpdateSchema,
  hexColorSchema,
  isAssetUrl,
  isHttpUrl,
  isReservedRootSlug,
  safeRedirectPath,
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

  it("reserva admin, api, login e _next somente no nível raiz", () => {
    expect([...RESERVED_ROOT_SLUGS]).toEqual(["admin", "api", "login", "_next"]);
    for (const slug of ["admin", "api", "login"]) {
      expect(isReservedRootSlug(slug, null)).toBe(true);
      expect(isReservedRootSlug(slug, undefined)).toBe(true);
      expect(isReservedRootSlug(slug, "colecao-1")).toBe(false);
    }
    expect(isReservedRootSlug("administracao", null)).toBe(false);
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

  it("recusa slug reservado na raiz e o aceita dentro de uma coleção", () => {
    expect(invalidFields(contentCreateSchema, { ...valid, slug: "admin" })).toEqual(["slug"]);
    expect(invalidFields(contentCreateSchema, { ...valid, slug: "api", parentId: null })).toEqual(["slug"]);
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
