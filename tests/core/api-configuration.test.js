// Route Handlers de configuração (início de M05) sobre o SQLite temporário, com sessão real:
// leitura, atualização, validação de cor (CT24, parte de API) e de links sociais (CT33, parte de
// API) e revalidação do layout raiz (RN10).
import "./env";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as configurationRoute from "@/app/api/configuration/route";
import { prisma } from "@/lib/db";
import { SOCIAL_URL_FIELDS } from "@/lib/validators";
import { apiRequest, createAdminSession, resetContent } from "./helpers";

/** @type {string} */
let cookie;

beforeAll(async () => {
  ({ cookie } = await createAdminSession());
});

beforeEach(async () => {
  await resetContent();
  vi.mocked(revalidatePath).mockClear();
});

const read = () => configurationRoute.GET(apiRequest("/api/configuration", { cookie }));
const put = (body) => configurationRoute.PUT(apiRequest("/api/configuration", { method: "PUT", body, cookie }));

describe("GET /api/configuration", () => {
  it("devolve a configuração padrão, criando o registro único se ausente (RN08)", async () => {
    const response = await read();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).data).toMatchObject({
      id: "default",
      siteName: "Vitrine",
      primaryColor: "#3b82f6",
      secondaryColor: "#1e293b",
      accentColor: "#f59e0b",
      githubUrl: null,
    });
    expect(await prisma.configuration.count()).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("PUT /api/configuration", () => {
  it("atualiza identidade, cores e links, e revalida o layout raiz (RN10)", async () => {
    const response = await put({
      siteName: "Notas de Aula",
      siteDescription: "Material didático de Cálculo",
      primaryColor: "#112233",
      githubUrl: "https://github.com/exemplo",
      logoUrl: "/logo.svg",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      siteName: "Notas de Aula",
      siteDescription: "Material didático de Cálculo",
      primaryColor: "#112233",
      secondaryColor: "#1e293b", // campo ausente não muda
      githubUrl: "https://github.com/exemplo",
      logoUrl: "/logo.svg",
    });
    expect(await prisma.configuration.count()).toBe(1);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("CT24: cor fora de #RRGGBB responde 422 e nada é gravado", async () => {
    const response = await put({ siteName: "Novo nome", primaryColor: "red; background: url(x)" });

    expect(response.status).toBe(422);
    expect((await response.json()).error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Dados inválidos.",
      details: [{ field: "primaryColor", message: "A cor deve estar no formato #RRGGBB." }],
    });
    expect(await prisma.configuration.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(SOCIAL_URL_FIELDS)("CT33: %s com protocolo diferente de http(s) responde 422", async (field) => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://exemplo.test"]) {
      const response = await put({ [field]: url });

      expect(response.status).toBe(422);
      const { error } = await response.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.details.map((detail) => detail.field)).toEqual([field]);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("CT33: campo vazio é aceito e remove o link (RN17)", async () => {
    await put({ githubUrl: "https://github.com/exemplo", youtubeUrl: "https://youtube.com/@exemplo" });

    const response = await put({ githubUrl: "", youtubeUrl: null });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ githubUrl: null, youtubeUrl: null });
  });

  it("aceita os seis links sociais http(s)", async () => {
    const links = Object.fromEntries(SOCIAL_URL_FIELDS.map((field) => [field, `https://exemplo.test/${field}`]));

    const response = await put(links);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject(links);
  });

  it("recusa nome em branco, corpo vazio e JSON malformado", async () => {
    expect((await put({ siteName: "   " })).status).toBe(422);
    expect((await put({})).status).toBe(422);
    expect((await put("{ siteName: ")).status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ignora campos desconhecidos, como o identificador do registro", async () => {
    const response = await put({ id: "outro", siteName: "Notas" });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: "default", siteName: "Notas" });
    expect(await prisma.configuration.count()).toBe(1);
  });
});
