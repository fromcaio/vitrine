// Envio, troca, remoção e leitura das imagens (A-029; RF35, RF36; RN19, RN29; ADR-034; CT57 a CT59), contra os
// Route Handlers REAIS, com o better-auth e o `sharp` reais sobre o banco temporário: o `multipart`, o 413 antes
// de decodificar, o 422 `INVALID_IMAGE` sem eco do arquivo, o EXIF que não sai, o id novo a cada troca (a antiga
// apagada), o 403 do que é de outro dono, a moderação do avatar com o motivo e a notificação, a concorrência
// (um por usuário, dois no servidor), o limite de taxa e o `GET /media/:id` imutável.
import "./env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import * as appearanceFavicon from "@/app/api/appearance/favicon/route";
import * as appearanceLogo from "@/app/api/appearance/logo/route";
import * as configurationFavicon from "@/app/api/configuration/favicon/route";
import * as configurationLogo from "@/app/api/configuration/logo/route";
import * as usersRoute from "@/app/api/users/route";
import * as userAvatarOf from "@/app/api/users/[id]/avatar/route";
import * as myAvatar from "@/app/api/users/me/avatar/route";
import * as meRoute from "@/app/api/users/me/route";
import * as userRoute from "@/app/api/users/[id]/route";
import * as mediaRoute from "@/app/media/[id]/route";
import { acquireImageSlot, resetImageSlots } from "@/app/api/_lib/image-slots";
import { createContent, getAppearance, listNotifications, listPublicSpaces } from "@/lib/db";
import { prisma } from "@/lib/db";
import { BASE_URL, createAdminSession, createUserSession, resetDatabase, routeContext } from "./helpers";

/** @type {{ cookie: string, userId: string }} */
let admin;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let ana;
/** @type {Awaited<ReturnType<typeof createUserSession>>} */
let beto;

const SENTINEL = "SEGREDO-DO-GPS-98765";

const png = (width = 300, height = 200) => sharp({ create: { width, height, channels: 3, background: "#c81e3c" } }).png().toBuffer();
const jpegWithExif = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: "#1e90ff" } })
    .withExif({ IFD0: { Copyright: SENTINEL }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 32/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "46/1 38/1 0/1" } })
    .jpeg()
    .toBuffer();

/**
 * Requisição `multipart/form-data` com o arquivo no campo `file`.
 * @param {string} path
 * @param {Uint8Array | null} bytes `null`: sem o campo `file`
 * @param {{ method?: string, cookie?: string, type?: string, name?: string, headers?: Record<string, string> }} [options]
 */
function upload(path, bytes, { method = "PUT", cookie, type, name = "foto.png", headers = {} } = {}) {
  const form = new FormData();
  if (bytes) form.set("file", new File([bytes], name, type === undefined ? {} : { type }));
  form.set("outro", "ignorado");
  const all = new Headers({ origin: BASE_URL, ...headers });
  if (cookie) all.set("cookie", cookie);
  return new Request(`${BASE_URL}${path}`, { method, headers: all, body: form });
}

/** @param {string} path @param {{ method?: string, cookie?: string }} [options] */
function plain(path, { method = "DELETE", cookie } = {}) {
  const all = new Headers(method === "GET" ? {} : { origin: BASE_URL });
  if (cookie) all.set("cookie", cookie);
  return new Request(`${BASE_URL}${path}`, { method, headers: all });
}

const media = (id, headers = {}) => mediaRoute.GET(new Request(`${BASE_URL}/media/${id}`, { headers }), routeContext({ id }));
const json = async (response) => response.json();
const pages = () => vi.mocked(revalidatePath).mock.calls.map((call) => call[0]).sort();

beforeEach(async () => {
  await resetDatabase();
  resetImageSlots();
  vi.mocked(revalidatePath).mockClear();
  admin = await createAdminSession();
  ana = await createUserSession({ email: "ana@exemplo.test", name: "Ana", handle: "ana" });
  beto = await createUserSession({ email: "beto@exemplo.test", name: "Beto", handle: "beto" });
});

describe("PUT /api/appearance/logo e /favicon: o espaço do próprio dono", () => {
  it("envia o logotipo: 200 com { id, url, width, height }, WebP até 512 px, gravado no espaço", async () => {
    const response = await appearanceLogo.PUT(upload("/api/appearance/logo", await png(1600, 800), { cookie: ana.cookie }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: expect.any(String), url: `/media/${body.data.id}`, width: 512, height: 256 });
    expect((await getAppearance(ana.id)).logoImageId).toBe(body.data.id);
    const image = await prisma.image.findUnique({ where: { id: body.data.id } });
    expect(image).toMatchObject({ kind: "logo", mime: "image/webp", ownerId: ana.id });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("envia o favicon: 64x64 PNG", async () => {
    const response = await appearanceFavicon.PUT(upload("/api/appearance/favicon", await png(500, 300), { cookie: ana.cookie }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ width: 64, height: 64 });
    expect((await prisma.image.findUnique({ where: { id: body.data.id } }))?.mime).toBe("image/png");
  });

  it("trocar a imagem gera um id NOVO e apaga a antiga (a URL antiga passa a dar 404)", async () => {
    const first = (await json(await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: ana.cookie })))).data;
    const second = (await json(await appearanceLogo.PUT(upload("/api/appearance/logo", await sharp({ create: { width: 90, height: 90, channels: 3, background: "#00aa00" } }).png().toBuffer(), { cookie: ana.cookie })))).data;

    expect(second.id).not.toBe(first.id);
    expect((await media(first.id)).status).toBe(404);
    expect((await media(second.id)).status).toBe(200);
    expect(await prisma.image.count({ where: { ownerId: ana.id, kind: "logo" } })).toBe(1);
  });

  it("DELETE remove a imagem (204), apaga o registro e é idempotente", async () => {
    const sent = (await json(await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: ana.cookie })))).data;

    const removed = await appearanceLogo.DELETE(plain("/api/appearance/logo", { cookie: ana.cookie }));
    expect(removed.status).toBe(204);
    expect((await getAppearance(ana.id)).logoImageId).toBeNull();
    expect((await media(sent.id)).status).toBe(404);
    expect(await prisma.image.count({ where: { ownerId: ana.id } })).toBe(0);

    expect((await appearanceLogo.DELETE(plain("/api/appearance/logo", { cookie: ana.cookie }))).status).toBe(204);
  });

  it("revalida o espaço do dono por caminhos literais (e só o dele)", async () => {
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: ana.id, body: "x" });
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: beto.id, body: "x" });
    vi.mocked(revalidatePath).mockClear();

    await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: ana.cookie }));

    expect(pages()).toEqual(["/ana", "/ana/sobre"]);
  });

  it("o espaço do administrador também tem logotipo e favicon próprios", async () => {
    const response = await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: admin.cookie }));
    expect(response.status).toBe(200);
    expect((await prisma.image.findFirst({ where: { ownerId: admin.userId, kind: "logo" } }))?.id).toBe((await json(response)).data.id);
  });
});

describe("PUT /api/configuration/logo e /favicon: o SISTEMA, só o administrador", () => {
  it("o administrador envia e remove; a imagem não tem dono e vai à configuração", async () => {
    const sent = await configurationLogo.PUT(upload("/api/configuration/logo", await png(900, 300), { cookie: admin.cookie }));
    const body = await json(sent);

    expect(sent.status).toBe(200);
    expect(body.data).toMatchObject({ width: 512, height: 171 });
    expect(await prisma.image.findUnique({ where: { id: body.data.id } })).toMatchObject({ kind: "logo", ownerId: null });
    expect((await prisma.configuration.findFirst())?.logoImageId).toBe(body.data.id);

    const fav = await configurationFavicon.PUT(upload("/api/configuration/favicon", await png(), { cookie: admin.cookie }));
    expect(fav.status).toBe(200);

    expect((await configurationLogo.DELETE(plain("/api/configuration/logo", { cookie: admin.cookie }))).status).toBe(204);
    expect((await configurationFavicon.DELETE(plain("/api/configuration/favicon", { cookie: admin.cookie }))).status).toBe(204);
    expect(await prisma.image.count({ where: { ownerId: null } })).toBe(0);
  });

  it("o usuário comum recebe 403 em PUT e DELETE, e nada é gravado", async () => {
    const put = await configurationLogo.PUT(upload("/api/configuration/logo", await png(), { cookie: ana.cookie }));
    expect(put.status).toBe(403);
    expect((await configurationFavicon.PUT(upload("/api/configuration/favicon", await png(), { cookie: ana.cookie }))).status).toBe(403);
    expect((await configurationLogo.DELETE(plain("/api/configuration/logo", { cookie: ana.cookie }))).status).toBe(403);
    expect(await prisma.image.count()).toBe(0);
  });

  it("revalida o portal e os espaços que HERDAM o logotipo (não o de quem tem o próprio)", async () => {
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: ana.id, body: "x" });
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: beto.id, body: "x" });
    await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: beto.cookie }));
    vi.mocked(revalidatePath).mockClear();

    await configurationLogo.PUT(upload("/api/configuration/logo", await png(), { cookie: admin.cookie }));

    expect(pages()).toEqual(["/", "/ana", "/ana/sobre"]);
  });
});

describe("PUT /api/users/me/avatar e o avatar no diretório", () => {
  it("envia o avatar: 256x256 WebP, no usuário; o diretório o traz e o portal e o espaço são revalidados", async () => {
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: ana.id, body: "x" });
    vi.mocked(revalidatePath).mockClear();

    const response = await myAvatar.PUT(upload("/api/users/me/avatar", await jpegWithExif(), { cookie: ana.cookie, type: "image/jpeg", name: "eu.jpg" }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ width: 256, height: 256, url: `/media/${body.data.id}` });
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBe(body.data.id);
    expect((await listPublicSpaces()).find((space) => space.handle === "ana")?.avatarImageId).toBe(body.data.id);
    expect(pages()).toEqual(["/", "/ana", "/ana/sobre"]);
  });

  it("o EXIF com GPS NÃO sai: os bytes servidos em /media não têm o metadado", async () => {
    const input = await jpegWithExif();
    expect(input.includes(Buffer.from(SENTINEL))).toBe(true);

    const sent = (await json(await myAvatar.PUT(upload("/api/users/me/avatar", input, { cookie: ana.cookie })))).data;
    const served = Buffer.from(await (await media(sent.id)).arrayBuffer());

    expect(served.includes(Buffer.from(SENTINEL))).toBe(false);
    expect(served.includes(Buffer.from("Exif"))).toBe(false);
    expect((await sharp(served).metadata()).exif).toBeUndefined();
  });

  it("DELETE remove o avatar do próprio usuário (204) e apaga a imagem", async () => {
    const sent = (await json(await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie })))).data;

    expect((await myAvatar.DELETE(plain("/api/users/me/avatar", { cookie: ana.cookie }))).status).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
    expect((await media(sent.id)).status).toBe(404);
  });

  it("a conta com a senha provisória pendente não envia imagem: 403 PASSWORD_CHANGE_REQUIRED", async () => {
    const temp = await createUserSession({ email: "nova@exemplo.test", name: "Nova", handle: "nova", mustChangePassword: true });

    for (const response of [
      await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: temp.cookie })),
      await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: temp.cookie })),
    ]) {
      expect(response.status).toBe(403);
      expect((await json(response)).error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    }
    expect(await prisma.image.count()).toBe(0);
  });

  it("sem sessão, 401; com a origem de outro site, 401", async () => {
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png()))).status).toBe(401);
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie, headers: { origin: "https://outro-site.example" } }))).status).toBe(401);
    expect((await myAvatar.DELETE(plain("/api/users/me/avatar"))).status).toBe(401);
    expect(await prisma.image.count()).toBe(0);
  });
});

describe("o que a API recusa no envio (422 INVALID_IMAGE, 413, 400), sem eco do arquivo", () => {
  /** O corpo da recusa não pode conter o nome nem o tipo enviados, nem trechos do arquivo. */
  async function expectInvalid(bytes, options = {}) {
    const response = await myAvatar.PUT(upload("/api/users/me/avatar", bytes, { cookie: ana.cookie, name: "segredo-do-arquivo.png", ...options }));
    const text = await response.text();
    expect(response.status, text).toBe(422);
    const { error } = JSON.parse(text);
    expect(error.code).toBe("INVALID_IMAGE");
    expect(error.details).toEqual([{ field: "file" }]);
    expect(text).not.toContain("segredo-do-arquivo");
    expect(text).not.toMatch(/svg|script|html|alert/i);
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
    expect(await prisma.image.count()).toBe(0);
    return error;
  }

  it.each([
    ["SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "image/svg+xml"],
    ["GIF", Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;"), "image/gif"],
    ["HTML renomeado para .png", Buffer.from("<!doctype html><script>alert(1)</script>"), "image/png"],
    ["ZIP", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 1, 2, 3, 4]), "application/zip"],
    ["arquivo de 0 byte", Buffer.alloc(0), "image/png"],
    ["PNG truncado", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), "image/png"],
  ])("%s", async (_name, bytes, type) => {
    await expectInvalid(bytes, { type });
  });

  it("tipo declarado que não confere com o conteúdo (um PNG declarado como JPEG)", async () => {
    const error = await expectInvalid(await png(), { type: "image/jpeg" });
    expect(error.message).toMatch(/não confere/);
  });

  it("bomba de pixels (cabeçalho de 30000x30000) é recusada antes de decodificar", async () => {
    const { crc32 } = await import("node:zlib");
    const chunk = (type, data) => {
      const body = Buffer.concat([Buffer.from(type), data]);
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      body.copy(out, 4);
      out.writeUInt32BE(crc32(body), 8 + data.length);
      return out;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(30000, 0);
    ihdr.writeUInt32BE(30000, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const bomb = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", Buffer.alloc(0)), chunk("IEND", Buffer.alloc(0))]);

    const error = await expectInvalid(bomb, { type: "image/png" });
    expect(error.message).toMatch(/25 megapixels/);
  });

  it("2 MB + 1 byte de arquivo: 413 ANTES de decodificar; 2 MB exatos passam do limite de leitura", async () => {
    const base = await png(2000, 2000);
    const over = Buffer.concat([base, Buffer.alloc(2 * 1024 * 1024 + 1 - base.length)]); // PNG válido + lixo no fim
    expect(over.length).toBe(2 * 1024 * 1024 + 1);

    const response = await myAvatar.PUT(upload("/api/users/me/avatar", over, { cookie: ana.cookie }));

    expect(response.status).toBe(413);
    expect((await json(response)).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(await prisma.image.count()).toBe(0);
  });

  it("corpo muito maior que o limite de leitura: 413 sem ler tudo (Content-Length declarado)", async () => {
    const response = await myAvatar.PUT(upload("/api/users/me/avatar", Buffer.alloc(3 * 1024 * 1024), { cookie: ana.cookie, type: "image/png" }));
    expect(response.status).toBe(413);
  });

  it("corpo que não é multipart/form-data: 400 VALIDATION_ERROR (também JSON)", async () => {
    const asJson = new Request(`${BASE_URL}/api/users/me/avatar`, {
      method: "PUT",
      headers: { origin: BASE_URL, cookie: ana.cookie, "content-type": "application/json" },
      body: JSON.stringify({ file: "x" }),
    });
    const response = await myAvatar.PUT(asJson);
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe("VALIDATION_ERROR");

    const noType = new Request(`${BASE_URL}/api/users/me/avatar`, { method: "PUT", headers: { origin: BASE_URL, cookie: ana.cookie }, body: "bytes" });
    expect((await myAvatar.PUT(noType)).status).toBe(400);
  });

  it("multipart malformado: 400; sem o campo file: 422 VALIDATION_ERROR com field file", async () => {
    const broken = new Request(`${BASE_URL}/api/users/me/avatar`, {
      method: "PUT",
      headers: { origin: BASE_URL, cookie: ana.cookie, "content-type": "multipart/form-data; boundary=xyz" },
      body: "isto não tem fronteiras",
    });
    expect((await myAvatar.PUT(broken)).status).toBe(400);

    const missing = await myAvatar.PUT(upload("/api/users/me/avatar", null, { cookie: ana.cookie }));
    expect(missing.status).toBe(422);
    const { error } = await json(missing);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details[0].field).toBe("file");
  });

  it("o nome do arquivo enviado nunca é usado (um nome com caminho e script é inofensivo)", async () => {
    const response = await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie, name: "../../etc/<script>alert(1)</script>.png" }));
    expect(response.status).toBe(200);
    const text = JSON.stringify(await json(response));
    expect(text).not.toContain("etc");
    expect(text).not.toContain("script");
  });
});

describe("concorrência (um processamento por usuário, dois no servidor) e taxa (10 por minuto)", () => {
  it("com a vaga do usuário ocupada, o envio dele recebe 503 BUSY com Retry-After; outro usuário passa", async () => {
    const release = acquireImageSlot(ana.id);

    const busy = await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }));
    expect(busy.status).toBe(503);
    expect((await json(busy)).error.code).toBe("BUSY");
    expect(Number(busy.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(await prisma.image.count()).toBe(0);

    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: beto.cookie }))).status).toBe(200);

    release();
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }))).status).toBe(200);
  });

  it("com as DUAS vagas do servidor ocupadas por outros, qualquer envio recebe 503", async () => {
    const one = acquireImageSlot("fantasma-1");
    const two = acquireImageSlot("fantasma-2");

    const busy = await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }));
    expect(busy.status).toBe(503);

    one();
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }))).status).toBe(200);
    two();
  });

  it("a vaga é liberada depois de uma recusa (422) e de um envio bom: o seguinte passa", async () => {
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", Buffer.from("lixo"), { cookie: ana.cookie }))).status).toBe(422);
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }))).status).toBe(200);
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }))).status).toBe(200);
  });

  it("dois envios SIMULTÂNEOS do mesmo usuário: no máximo um é processado de cada vez (nunca 500)", async () => {
    const bytes = await png(1800, 1800);
    const responses = await Promise.all([1, 2, 3].map(() => myAvatar.PUT(upload("/api/users/me/avatar", bytes, { cookie: ana.cookie }))));
    const statuses = responses.map((response) => response.status);

    expect(statuses.every((status) => status === 200 || status === 503)).toBe(true);
    expect(statuses).toContain(200);
    // o que sobrou é UMA imagem de avatar do usuário
    expect(await prisma.image.count({ where: { ownerId: ana.id, kind: "avatar" } })).toBe(1);
  });

  it("o 11º envio no minuto recebe 429 RATE_LIMITED com Retry-After (as recusas também contam)", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await myAvatar.PUT(upload("/api/users/me/avatar", Buffer.from("lixo"), { cookie: ana.cookie }))).status).toBe(422);
    }
    const limited = await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }));
    expect(limited.status).toBe(429);
    expect((await json(limited)).error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);

    // o limite é por usuário
    expect((await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: beto.cookie }))).status).toBe(200);
  });
});

describe("DELETE /api/users/:id/avatar: a moderação do administrador", () => {
  const remove = (id, { reason, cookie }) =>
    userAvatarOf.DELETE(plain(`/api/users/${id}/avatar${reason === undefined ? "" : `?reason=${encodeURIComponent(reason)}`}`, { cookie }), routeContext({ id }));

  beforeEach(async () => {
    await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie }));
    vi.mocked(revalidatePath).mockClear();
  });

  it("com o motivo: 204, a imagem é apagada e o dono recebe a notificação MODERATION AVATAR_REMOVED com o motivo", async () => {
    const before = (await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId;

    const response = await remove(ana.id, { reason: "Imagem imprópria para o ambiente", cookie: admin.cookie });

    expect(response.status).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).toBeNull();
    expect((await media(before)).status).toBe(404);
    const [notification] = await listNotifications(ana.id);
    expect(notification).toMatchObject({ type: "MODERATION", severity: "WARNING", data: { event: "AVATAR_REMOVED", reason: "Imagem imprópria para o ambiente" } });
    expect(pages()).toContain("/");
  });

  it("o motivo é obrigatório (422 com field reason) e nada muda sem ele", async () => {
    for (const reason of [undefined, "", "   "]) {
      const response = await remove(ana.id, { reason, cookie: admin.cookie });
      expect(response.status).toBe(422);
      expect((await json(response)).error.details[0].field).toBe("reason");
    }
    expect((await remove(ana.id, { reason: "x".repeat(501), cookie: admin.cookie })).status).toBe(422);
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).not.toBeNull();
    expect(await prisma.notification.count()).toBe(0);
  });

  it("o usuário comum recebe 403 (nem o próprio avatar, nem o de outro, por esta rota)", async () => {
    expect((await remove(ana.id, { reason: "teste", cookie: beto.cookie })).status).toBe(403);
    expect((await remove(ana.id, { reason: "teste", cookie: ana.cookie })).status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatarImageId).not.toBeNull();
  });

  it("404 se o usuário não existe ou não tem avatar; 403 sobre o PRÓPRIO avatar do administrador", async () => {
    expect((await remove("nao-existe", { reason: "teste", cookie: admin.cookie })).status).toBe(404);
    expect((await remove(beto.id, { reason: "teste", cookie: admin.cookie })).status).toBe(404);
    expect((await remove(admin.userId, { reason: "teste", cookie: admin.cookie })).status).toBe(403);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("o administrador SÓ remove: não há rota que troque o avatar de outro (RN19)", () => {
    expect(userAvatarOf.PUT).toBeUndefined();
    expect(userAvatarOf.POST).toBeUndefined();
  });

  it("a notificação é gravada na MESMA transação: se a remoção falha (sem avatar), nenhuma nasce", async () => {
    await remove(ana.id, { reason: "primeira", cookie: admin.cookie });
    expect(await prisma.notification.count()).toBe(1);

    const again = await remove(ana.id, { reason: "segunda", cookie: admin.cookie });

    expect(again.status).toBe(404);
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe("GET /api/users traz avatarImageId (lista, detalhe e o próprio perfil)", () => {
  const list = () => usersRoute.GET(new Request(`${BASE_URL}/api/users`, { headers: { cookie: admin.cookie } }));

  it("null sem avatar, o id com avatar, na lista, no detalhe e em /api/users/me", async () => {
    const before = (await json(await list())).data.find((user) => user.id === ana.id);
    expect(before.avatarImageId).toBeNull();

    const sent = (await json(await myAvatar.PUT(upload("/api/users/me/avatar", await png(), { cookie: ana.cookie })))).data;

    const after = (await json(await list())).data;
    expect(after.find((user) => user.id === ana.id).avatarImageId).toBe(sent.id);
    expect(after.find((user) => user.id === beto.id).avatarImageId).toBeNull();

    const detail = await userRoute.GET(new Request(`${BASE_URL}/api/users/${ana.id}`, { headers: { cookie: admin.cookie } }), routeContext({ id: ana.id }));
    expect((await json(detail)).data.avatarImageId).toBe(sent.id);

    const me = await meRoute.GET(new Request(`${BASE_URL}/api/users/me`, { headers: { cookie: ana.cookie } }));
    expect((await json(me)).data.avatarImageId).toBe(sent.id);
  });
});

describe("GET /media/:id", () => {
  async function sendLogo() {
    return (await json(await appearanceLogo.PUT(upload("/api/appearance/logo", await png(), { cookie: ana.cookie })))).data;
  }

  it("serve a imagem, PÚBLICA (sem sessão), com o tipo fixo, nosniff, ETag e cache imutável", async () => {
    const sent = await sendLogo();

    const response = await media(sent.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const image = await prisma.image.findUnique({ where: { id: sent.id } });
    expect(response.headers.get("etag")).toBe(`"${image?.sha256}"`);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.equals(Buffer.from(image?.bytes ?? []))).toBe(true);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("o favicon sai como image/png", async () => {
    const sent = (await json(await appearanceFavicon.PUT(upload("/api/appearance/favicon", await png(), { cookie: ana.cookie })))).data;
    expect((await media(sent.id)).headers.get("content-type")).toBe("image/png");
  });

  it("If-None-Match com o ETag atual responde 304 sem corpo (e com os cabeçalhos de cache)", async () => {
    const sent = await sendLogo();
    const etag = (await media(sent.id)).headers.get("etag") ?? "";

    for (const header of [etag, `W/${etag}`, `"outro", ${etag}`, "*"]) {
      const response = await media(sent.id, { "if-none-match": header });
      expect(response.status, header).toBe(304);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
    expect((await media(sent.id, { "if-none-match": '"outro"' })).status).toBe(200);
  });

  it("identificador inexistente, malformado ou longo demais: 404 igual, sem distinguir", async () => {
    const responses = [await media("nao-existe"), await media("../../etc/passwd"), await media("x".repeat(500)), await media("")];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect(new Set(responses.map((r) => r.headers.get("cache-control"))).size).toBe(1);
  });

  it("serve também a imagem de um espaço SUSPENSO (ADR-034, item 8)", async () => {
    const sent = await sendLogo();
    await prisma.user.update({ where: { id: ana.id }, data: { banned: true, banReason: "teste" } });

    expect((await media(sent.id)).status).toBe(200);
  });

  it("um tipo que o servidor não produz (fora de WebP e PNG) nunca é servido", async () => {
    const odd = await prisma.image.create({ data: { kind: "logo", mime: "image/svg+xml", bytes: Buffer.from("<svg/>"), width: 1, height: 1, sha256: "0".repeat(64) } });
    expect((await media(odd.id)).status).toBe(404);
  });
});

describe("/api/footer-links e /api/configuration/footer-links (RF24, RN17, ADR-035)", () => {
  const put = (route, path, body, cookie) => route.PUT(new Request(`${BASE_URL}${path}`, { method: "PUT", headers: { origin: BASE_URL, cookie, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const get = (route, path, cookie) => route.GET(new Request(`${BASE_URL}${path}`, { headers: { cookie } }));
  let footer;
  let siteFooter;

  beforeEach(async () => {
    footer = await import("@/app/api/footer-links/route");
    siteFooter = await import("@/app/api/configuration/footer-links/route");
  });

  const LINKS = [
    { icon: "github", url: "https://github.com/ana" },
    { icon: "email", url: "mailto:ana@exemplo.com" },
    { icon: "website", url: "https://ana.exemplo.com" },
  ];

  it("GET vazio; PUT grava na ORDEM do vetor; GET devolve a mesma ordem; PUT substitui a lista inteira", async () => {
    expect((await json(await get(footer, "/api/footer-links", ana.cookie))).data).toEqual([]);

    const saved = await put(footer, "/api/footer-links", { links: LINKS }, ana.cookie);
    expect(saved.status).toBe(200);
    expect((await json(saved)).data).toEqual(LINKS);
    expect((await json(await get(footer, "/api/footer-links", ana.cookie))).data).toEqual(LINKS);

    const replaced = await put(footer, "/api/footer-links", { links: [LINKS[2], LINKS[0]] }, ana.cookie);
    expect((await json(replaced)).data).toEqual([LINKS[2], LINKS[0]]);
    expect(await prisma.footerLink.count({ where: { ownerId: ana.id } })).toBe(2);

    expect((await put(footer, "/api/footer-links", { links: [] }, ana.cookie)).status).toBe(200);
    expect(await prisma.footerLink.count({ where: { ownerId: ana.id } })).toBe(0);
  });

  it("cada usuário tem o seu rodapé: o do Beto não é o da Ana (sem herdar o do sistema)", async () => {
    await put(footer, "/api/footer-links", { links: LINKS }, ana.cookie);
    await put(siteFooter, "/api/configuration/footer-links", { links: [LINKS[0]] }, admin.cookie);

    expect((await json(await get(footer, "/api/footer-links", beto.cookie))).data).toEqual([]);
    expect((await json(await get(footer, "/api/footer-links", ana.cookie))).data).toEqual(LINKS);
  });

  it("um item inválido recusa o LOTE (422 VALIDATION_ERROR, um details por item, field links[i].campo) e nada muda", async () => {
    await put(footer, "/api/footer-links", { links: [LINKS[0]] }, ana.cookie);

    const response = await put(
      footer,
      "/api/footer-links",
      {
        links: [
          { icon: "github", url: "javascript:alert(1)" },
          { icon: "x", url: "https://x.com/ana" },
          { icon: "email", url: "https://nao-e-mailto.test" },
          { icon: "tiktok", url: "https://tiktok.com/ana" },
        ],
      },
      ana.cookie,
    );

    expect(response.status).toBe(422);
    const { error } = await json(response);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details.map((detail) => detail.field)).toEqual(["links[0].url", "links[2].url", "links[3].icon"]);
    expect((await json(await get(footer, "/api/footer-links", ana.cookie))).data).toEqual([LINKS[0]]);
  });

  it.each([
    ["javascript:", { icon: "github", url: "javascript:alert(1)" }],
    ["data:", { icon: "website", url: "data:text/html,<script>alert(1)</script>" }],
    ["http:", { icon: "github", url: "http://github.com/ana" }],
    ["sem esquema", { icon: "github", url: "github.com/ana" }],
    ["mailto fora do email", { icon: "github", url: "mailto:ana@exemplo.com" }],
    ["e-mail com parâmetros", { icon: "email", url: "mailto:ana@exemplo.com?subject=oi" }],
  ])("RN17: %s é recusado", async (_name, link) => {
    const response = await put(footer, "/api/footer-links", { links: [link] }, ana.cookie);
    expect(response.status).toBe(422);
    expect(await prisma.footerLink.count()).toBe(0);
  });

  it("ícone repetido e o nono link são recusados; 8 passam", async () => {
    const dup = await put(footer, "/api/footer-links", { links: [LINKS[0], { icon: "github", url: "https://github.com/outra" }] }, ana.cookie);
    expect(dup.status).toBe(422);
    expect((await json(dup)).error.details[0].field).toBe("links[1].icon");

    const icons = ["github", "linkedin", "instagram", "youtube", "x", "facebook", "bluesky", "mastodon", "telegram"];
    const nine = await put(footer, "/api/footer-links", { links: icons.map((icon) => ({ icon, url: `https://exemplo.com/${icon}` })) }, ana.cookie);
    expect(nine.status).toBe(422);
    const eight = await put(footer, "/api/footer-links", { links: icons.slice(0, 8).map((icon) => ({ icon, url: `https://exemplo.com/${icon}` })) }, ana.cookie);
    expect(eight.status).toBe(200);
  });

  it("o rodapé do espaço revalida o espaço do dono; o do sistema, só o portal", async () => {
    await createContent({ title: "Sobre", slug: "sobre", type: "DOCUMENT", authorId: ana.id, body: "x" });
    vi.mocked(revalidatePath).mockClear();
    await put(footer, "/api/footer-links", { links: LINKS }, ana.cookie);
    expect(pages()).toEqual(["/ana", "/ana/sobre"]);

    vi.mocked(revalidatePath).mockClear();
    await put(siteFooter, "/api/configuration/footer-links", { links: [LINKS[0]] }, admin.cookie);
    expect(pages()).toEqual(["/"]);
  });

  it("o rodapé do sistema é do administrador: o usuário comum recebe 403 em GET e PUT", async () => {
    expect((await get(siteFooter, "/api/configuration/footer-links", ana.cookie)).status).toBe(403);
    expect((await put(siteFooter, "/api/configuration/footer-links", { links: [LINKS[0]] }, ana.cookie)).status).toBe(403);
    expect(await prisma.footerLink.count({ where: { ownerId: null } })).toBe(0);

    const saved = await put(siteFooter, "/api/configuration/footer-links", { links: LINKS }, admin.cookie);
    expect((await json(saved)).data).toEqual(LINKS);
    expect((await json(await get(siteFooter, "/api/configuration/footer-links", admin.cookie))).data).toEqual(LINKS);
  });

  it("sem sessão, 401; origem de outro site, 401; corpo que não é JSON, 400", async () => {
    expect((await put(footer, "/api/footer-links", { links: [] }, undefined)).status).toBe(401);
    const foreign = new Request(`${BASE_URL}/api/footer-links`, {
      method: "PUT",
      headers: { origin: "https://outro-site.example", cookie: ana.cookie, "content-type": "application/json" },
      body: JSON.stringify({ links: [] }),
    });
    expect((await footer.PUT(foreign)).status).toBe(401);
    const notJson = new Request(`${BASE_URL}/api/footer-links`, { method: "PUT", headers: { origin: BASE_URL, cookie: ana.cookie, "content-type": "text/plain" }, body: "x" });
    expect((await footer.PUT(notJson)).status).toBe(400);
  });
});
