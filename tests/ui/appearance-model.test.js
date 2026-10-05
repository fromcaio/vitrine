// Modelo dos formulários de aparência e de configuração (RF31, RN09, RN17, RN25, RN27; CT24):
// rascunho, envio parcial, validação, avisos de contraste por modo, pré-visualização e a tradução
// dos erros da API. Funções puras: rodam sem navegador.
import { describe, expect, it } from "vitest";
import {
  bodyTooLong,
  changedFields,
  draftOf,
  groupWarnings,
  interpretFailure,
  normalizeValue,
  patchOf,
  previewLinks,
  previewStyle,
  validateDraft,
  warningsByMode,
} from "@/components/admin/appearance-model";
import { DEFAULT_PALETTES } from "@/lib/theme";

const RECORD = {
  siteName: "Espaço da Maria",
  siteDescription: "Notas de aula",
  logoUrl: null,
  faviconUrl: "/favicon-maria.png",
  discordUrl: null,
  githubUrl: "https://github.com/maria",
  youtubeUrl: null,
  instagramUrl: null,
  linkedinUrl: null,
  twitchUrl: null,
  ...DEFAULT_PALETTES.light,
  ...DEFAULT_PALETTES.dark,
  id: "ignorado",
  updatedAt: "2026-10-05T10:00:00.000Z",
};
const CONFIG = { ...RECORD, homeBody: "# Portal", directoryEnabled: false };
const OPTIONS = { kind: /** @type {const} */ ("appearance"), maxBodyBytes: 1000 };

const json = (/** @type {number} */ status, /** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const failure = (/** @type {number} */ status, /** @type {unknown[]} */ details = [], code = "VALIDATION_ERROR", headers = {}) =>
  json(status, { error: { code, message: "m", details } }, headers);

describe("draftOf", () => {
  it("monta um texto por campo: nulos viram vazio e os campos desconhecidos são ignorados", () => {
    const draft = draftOf(RECORD, "appearance");
    expect(draft.logoUrl).toBe("");
    expect(draft.discordUrl).toBe("");
    expect(draft.githubUrl).toBe("https://github.com/maria");
    expect(draft.siteName).toBe("Espaço da Maria");
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("updatedAt");
  });

  it("a aparência não tem texto do portal nem diretório; a configuração tem", () => {
    expect(draftOf(RECORD, "appearance")).not.toHaveProperty("homeBody");
    expect(draftOf(RECORD, "appearance")).not.toHaveProperty("directoryEnabled");
    expect(draftOf(CONFIG, "configuration")).toMatchObject({ homeBody: "# Portal", directoryEnabled: false });
    expect(draftOf({ ...CONFIG, homeBody: null, directoryEnabled: undefined }, "configuration")).toMatchObject({ homeBody: "", directoryEnabled: true });
  });

  it("cores ausentes ficam com o padrão da ADR-031", () => {
    const draft = draftOf({ siteName: "X" }, "appearance");
    expect(draft).toMatchObject({ ...DEFAULT_PALETTES.light, ...DEFAULT_PALETTES.dark });
  });
});

describe("normalizeValue, changedFields e patchOf (envio parcial)", () => {
  it("compara textos sem os espaços das pontas e cores sem diferenciar maiúsculas", () => {
    expect(normalizeValue("siteName", "  Maria  ")).toBe("Maria");
    expect(normalizeValue("primaryColor", " #2563EB ")).toBe("#2563eb");
    expect(normalizeValue("directoryEnabled", false)).toBe(false);
  });

  it("sem mudança, não há campo alterado nem corpo", () => {
    const base = draftOf(RECORD, "appearance");
    expect(changedFields({ ...base }, base)).toEqual([]);
    expect(patchOf({ ...base, primaryColor: "#2563EB", siteName: "  Espaço da Maria " }, base)).toEqual({});
  });

  it("o corpo leva só o que mudou, com a cor em minúsculas e o texto aparado", () => {
    const base = draftOf(RECORD, "appearance");
    const draft = { ...base, darkPrimaryColor: "#FF0000", siteDescription: " Outra ", githubUrl: base.githubUrl };
    expect(patchOf(draft, base)).toEqual({ darkPrimaryColor: "#ff0000", siteDescription: "Outra" });
  });

  it("um link ou texto esvaziado vai como cadeia vazia (o servidor grava como ausente)", () => {
    const base = draftOf(RECORD, "appearance");
    expect(patchOf({ ...base, githubUrl: "", faviconUrl: "   " }, base)).toEqual({ githubUrl: "", faviconUrl: "" });
  });

  it("na configuração, o texto do portal e o diretório entram no corpo só se mudaram", () => {
    const base = draftOf(CONFIG, "configuration");
    expect(patchOf({ ...base, directoryEnabled: true }, base)).toEqual({ directoryEnabled: true });
    expect(patchOf({ ...base, homeBody: "# Novo" }, base)).toEqual({ homeBody: "# Novo" });
    expect(patchOf({ ...base, homeBody: "# Portal  \n" }, base)).toEqual({});
  });
});

describe("validateDraft (RN09, RN17, D-10, RN25)", () => {
  const ok = () => draftOf(RECORD, "appearance");

  it("um rascunho válido não tem erros", () => {
    expect(validateDraft(ok(), OPTIONS)).toEqual({});
  });

  it("o nome é obrigatório", () => {
    expect(validateDraft({ ...ok(), siteName: "   " }, OPTIONS)).toEqual({ siteName: "O nome do site é obrigatório." });
  });

  it.each(["laranja", "#fff", "#12345g", "2563eb", "#2563eb0", ""])("recusa a cor %j (RN09)", (value) => {
    const errors = validateDraft({ ...ok(), accentColor: value, darkAccentColor: value }, OPTIONS);
    expect(errors.accentColor).toBe("A cor deve estar no formato #RRGGBB.");
    expect(errors.darkAccentColor).toBe("A cor deve estar no formato #RRGGBB.");
    expect(Object.keys(errors).sort()).toEqual(["accentColor", "darkAccentColor"]);
  });

  it("aceita a cor em maiúsculas, com espaços nas pontas", () => {
    expect(validateDraft({ ...ok(), primaryColor: " #2563EB " }, OPTIONS)).toEqual({});
  });

  it.each(["ftp://exemplo.com", "javascript:alert(1)", "exemplo.com/maria", "//exemplo.com", "http:exemplo.com", "https://"])(
    "recusa o link social %j (RN17)",
    (value) => {
      expect(validateDraft({ ...ok(), twitchUrl: value }, OPTIONS)).toEqual({ twitchUrl: "Informe uma URL absoluta com protocolo http ou https." });
    },
  );

  it.each(["http://exemplo.com/maria", "https://exemplo.com", "  https://exemplo.com  "])("aceita o link social %j", (value) => {
    expect(validateDraft({ ...ok(), twitchUrl: value }, OPTIONS)).toEqual({});
  });

  it("link vazio equivale a ausente (RN17)", () => {
    expect(validateDraft({ ...ok(), twitchUrl: "", githubUrl: "   " }, OPTIONS)).toEqual({});
  });

  it.each(["logo.png", "//exemplo.com/logo.png", "/\\exemplo.com", "javascript:alert(1)", "ftp://exemplo.com/logo.png"])(
    "recusa o logotipo %j (D-10)",
    (value) => {
      expect(validateDraft({ ...ok(), logoUrl: value, faviconUrl: value }, OPTIONS)).toEqual({
        logoUrl: "Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).",
        faviconUrl: "Informe uma URL http(s) ou o caminho de um arquivo de public/ (iniciado por /).",
      });
    },
  );

  it.each(["/logo.png", "/img/logo.svg", "https://exemplo.com/logo.png", "http://exemplo.com/l.png"])("aceita o logotipo %j", (value) => {
    expect(validateDraft({ ...ok(), logoUrl: value }, OPTIONS)).toEqual({});
  });

  it("o limite do texto do portal é de bytes UTF-8, e não de caracteres (RN25)", () => {
    const base = draftOf(CONFIG, "configuration");
    const options = { kind: /** @type {const} */ ("configuration"), maxBodyBytes: 10 };
    expect(validateDraft({ ...base, homeBody: "a".repeat(10) }, options)).toEqual({});
    expect(validateDraft({ ...base, homeBody: "a".repeat(11) }, options)).toEqual({ homeBody: bodyTooLong(11, 10) });
    // "ação" = 4 caracteres, 6 bytes.
    expect(validateDraft({ ...base, homeBody: "ação" }, { kind: "configuration", maxBodyBytes: 5 })).toEqual({ homeBody: bodyTooLong(6, 5) });
    expect(validateDraft({ ...base, homeBody: "ação" }, { kind: "configuration", maxBodyBytes: 6 })).toEqual({});
  });

  it("o limite é do texto aparado, como o servidor o grava; a aparência não tem texto do portal", () => {
    const base = draftOf(CONFIG, "configuration");
    expect(validateDraft({ ...base, homeBody: `${"a".repeat(10)}${" ".repeat(50)}` }, { kind: "configuration", maxBodyBytes: 10 })).toEqual({});
    expect(validateDraft({ ...draftOf(RECORD, "appearance"), homeBody: "x".repeat(5000) }, OPTIONS)).toEqual({});
  });

  it("a mensagem do limite dá os bytes e o máximo em KiB", () => {
    expect(bodyTooLong(300000, 262144)).toBe("O texto do portal tem 300000 bytes; o máximo é 262144 (256 KiB).");
  });
});

describe("warningsByMode: o aviso de contraste por modo (RN09, RN27; CT24)", () => {
  const draft = () => draftOf(RECORD, "appearance");

  it("as paletas padrão não geram aviso, em nenhum modo", () => {
    expect(warningsByMode(draft())).toEqual({ light: [], dark: [] });
  });

  it("uma primária noturna escura demais avisa só o modo noturno, no campo darkPrimaryColor", () => {
    const { light, dark } = warningsByMode({ ...draft(), darkPrimaryColor: "#333333" });
    expect(light).toEqual([]);
    expect(dark).toHaveLength(1);
    expect(dark[0]).toMatchObject({ code: "LOW_CONTRAST", field: "darkPrimaryColor", minimum: 4.5 });
    expect(dark[0].message).toContain("primária noturna");
    expect(dark[0].message).toContain("fundo noturno (#0A0A0A)");
  });

  it("uma primária clara clara demais avisa só o modo claro, no campo primaryColor, contra o branco", () => {
    const { light, dark } = warningsByMode({ ...draft(), primaryColor: "#ffff00" });
    expect(dark).toEqual([]);
    expect(light.map((warning) => warning.field)).toEqual(["primaryColor"]);
    expect(light[0].message).toContain("com o branco");
  });

  it("cada modo usa o seu mínimo: 3:1 para o destaque, 4,5:1 para o resto", () => {
    expect(warningsByMode({ ...draft(), darkAccentColor: "#5d5d5d" }).dark).toEqual([]);
    expect(warningsByMode({ ...draft(), darkAccentColor: "#5c5c5c" }).dark).toMatchObject([{ field: "darkAccentColor", minimum: 3 }]);
    expect(warningsByMode({ ...draft(), darkSecondaryColor: "#797979" }).dark).toEqual([]);
    expect(warningsByMode({ ...draft(), darkSecondaryColor: "#787878" }).dark).toMatchObject([{ field: "darkSecondaryColor", minimum: 4.5 }]);
  });

  it("os dois modos ruins dão avisos nos dois, independentes", () => {
    const { light, dark } = warningsByMode({ ...draft(), accentColor: "#ffffe0", darkAccentColor: "#111111" });
    expect(light.map((w) => w.field)).toEqual(["accentColor"]);
    expect(dark.map((w) => w.field)).toEqual(["darkAccentColor"]);
  });

  it("um modo com alguma cor ainda incompleta fica sem avisos, e o outro segue valendo", () => {
    const { light, dark } = warningsByMode({ ...draft(), primaryColor: "#12", darkPrimaryColor: "#000000" });
    expect(light).toEqual([]);
    expect(dark.map((w) => w.field)).toEqual(["darkPrimaryColor"]);
  });

  it("a forma do aviso é a do servidor: cinco chaves, sem chave mode", () => {
    const [warning] = warningsByMode({ ...draft(), darkPrimaryColor: "#333333" }).dark;
    expect(Object.keys(warning).sort()).toEqual(["code", "field", "message", "minimum", "ratio"]);
  });
});

describe("groupWarnings: os avisos do servidor por modo (prefixo dark)", () => {
  const warning = (/** @type {string} */ field) => ({ code: /** @type {const} */ ("LOW_CONTRAST"), field: /** @type {any} */ (field), ratio: 1, minimum: 4.5, message: field });

  it("separa pelo prefixo dark do campo", () => {
    const grouped = groupWarnings([warning("primaryColor"), warning("darkAccentColor"), warning("accentColor"), warning("darkPrimaryColor")]);
    expect(grouped.light.map((w) => w.field)).toEqual(["primaryColor", "accentColor"]);
    expect(grouped.dark.map((w) => w.field)).toEqual(["darkAccentColor", "darkPrimaryColor"]);
  });

  it("sem avisos, duas listas vazias", () => {
    expect(groupWarnings([])).toEqual({ light: [], dark: [] });
  });
});

describe("previewStyle e previewLinks", () => {
  const base = () => draftOf(RECORD, "appearance");

  it("monta as dez variáveis com as cores do rascunho, em minúsculas, e o texto sobre elas por modo", () => {
    const style = previewStyle({ ...base(), primaryColor: "#7C2D12", darkSecondaryColor: "#7C2D12" }, base());
    expect(style["--vitrine-light-primary"]).toBe("#7c2d12");
    expect(style["--vitrine-light-on-primary"]).toBe("#FFFFFF");
    expect(style["--vitrine-dark-secondary"]).toBe("#7c2d12");
    expect(style["--vitrine-dark-on-secondary"]).toBe("#FFFFFF");
    expect(Object.keys(style)).toHaveLength(10);
  });

  it("uma cor ainda inválida cai para a gravada, sem lançar", () => {
    const style = previewStyle({ ...base(), primaryColor: "#7c", accentColor: "" }, base());
    expect(style["--vitrine-light-primary"]).toBe(DEFAULT_PALETTES.light.primaryColor);
    expect(style["--vitrine-light-accent"]).toBe(DEFAULT_PALETTES.light.accentColor);
  });

  it("a pré-visualização de cada modo usa a paleta do seu modo", () => {
    const style = previewStyle({ ...base(), darkPrimaryColor: "#ff00ff" }, base());
    expect(style["--vitrine-dark-primary"]).toBe("#ff00ff");
    expect(style["--vitrine-light-primary"]).toBe(DEFAULT_PALETTES.light.primaryColor);
  });

  it("os links da pré-visualização são só os preenchidos e válidos", () => {
    expect(previewLinks({ ...base(), githubUrl: "https://github.com/x", twitchUrl: "javascript:1", discordUrl: "   ", youtubeUrl: " https://y.example " })).toEqual({
      githubUrl: "https://github.com/x",
      youtubeUrl: "https://y.example",
    });
  });
});

describe("interpretFailure: 401, 403, 413, 422 e 429 em português", () => {
  it("401: a sessão expirou, e as alterações continuam na tela", async () => {
    const { fields, general } = await interpretFailure(failure(401, [], "UNAUTHENTICATED"), "appearance");
    expect(fields).toEqual({});
    expect(general).toBe("Sua sessão expirou. Entre de novo para salvar. As suas alterações continuam nesta tela.");
  });

  it("403: o texto depende de quem edita (aparência do usuário ou configuração do site)", async () => {
    expect((await interpretFailure(failure(403, [], "FORBIDDEN"), "appearance")).general).toBe("Você não tem permissão para alterar esta aparência.");
    expect((await interpretFailure(failure(403, [], "FORBIDDEN"), "configuration")).general).toBe("Só o administrador pode alterar a configuração do site.");
  });

  it("429: pede para aguardar e, com o Retry-After, diz os segundos", async () => {
    const withWait = await interpretFailure(failure(429, [], "RATE_LIMITED", { "Retry-After": "30" }), "appearance");
    expect(withWait.general).toBe("Muitas alterações em pouco tempo. Aguarde um instante e tente novamente. Tente de novo em 30 segundos.");
    expect((await interpretFailure(failure(429, [], "RATE_LIMITED", { "Retry-After": "1" }), "appearance")).general).toContain("em 1 segundo.");
    const without = await interpretFailure(failure(429), "appearance");
    expect(without.general).toBe("Muitas alterações em pouco tempo. Aguarde um instante e tente novamente.");
  });

  it("422: as mensagens do servidor vão para o campo certo, uma por campo", async () => {
    const { fields, general } = await interpretFailure(
      failure(422, [
        { field: "primaryColor", message: "A cor deve estar no formato #RRGGBB." },
        { field: "githubUrl", message: "Informe uma URL absoluta com protocolo http ou https." },
        { field: "githubUrl", message: "repetida" },
        { field: "siteName", message: "O nome do site é obrigatório." },
      ]),
      "appearance",
    );
    expect(fields).toEqual({
      primaryColor: "A cor deve estar no formato #RRGGBB.",
      githubUrl: "Informe uma URL absoluta com protocolo http ou https.",
      siteName: "O nome do site é obrigatório.",
    });
    expect(general).toBe("");
  });

  it("422 de um campo que o formulário não tem vira mensagem geral", async () => {
    const { fields, general } = await interpretFailure(failure(422, [{ field: "outro", message: "Algo estranho." }]), "appearance");
    expect(fields).toEqual({});
    expect(general).toBe("Algo estranho.");
  });

  it("422 QUOTA_EXCEEDED: o texto do portal passa os bytes e o máximo (o servidor chama o campo de body)", async () => {
    const { fields } = await interpretFailure(
      failure(422, [{ field: "body", bytes: 300000, max: 262144 }], "QUOTA_EXCEEDED"),
      "configuration",
    );
    expect(fields).toEqual({ homeBody: "O texto do portal tem 300000 bytes; o máximo é 262144 (256 KiB)." });
  });

  it("422 sem detalhes: a mensagem de dados recusados; QUOTA_EXCEEDED sem detalhes usa a do servidor", async () => {
    expect((await interpretFailure(failure(422, []), "appearance")).general).toBe(
      "O servidor não aceitou os dados enviados. Confira os campos e tente de novo.",
    );
    const quota = await interpretFailure(json(422, { error: { code: "QUOTA_EXCEEDED", message: "O texto do portal excede o tamanho máximo.", details: [] } }), "configuration");
    expect(quota.general).toBe("O texto do portal excede o tamanho máximo.");
  });

  it("413: o texto do portal é grande demais para ser enviado", async () => {
    const { fields } = await interpretFailure(failure(413, [], "PAYLOAD_TOO_LARGE"), "configuration");
    expect(fields.homeBody).toBe("O texto do portal é grande demais para ser enviado.");
  });

  it("5xx e corpo que não é JSON: mensagem de servidor, sem lançar", async () => {
    expect((await interpretFailure(new Response("<html>erro</html>", { status: 502 }), "appearance")).general).toBe(
      "O servidor não conseguiu salvar agora. Tente de novo em instantes.",
    );
    expect((await interpretFailure(new Response(null, { status: 422 }), "appearance")).general).toBe(
      "O servidor não aceitou os dados enviados. Confira os campos e tente de novo.",
    );
  });
});
