// Processamento das imagens (A-029, RF35, RF36, RN29; ADR-034; CT57): o formato vem do CONTEÚDO, a saída é
// reencodada no alvo e SEM metadados, e tudo o que não é PNG, JPEG ou WebP válido termina em `ImageError`
// sem eco do arquivo. As imagens de entrada são geradas aqui com o próprio `sharp` (nenhum arquivo de
// terceiros) e o EXIF com GPS é um texto sentinela que a saída não pode conter.
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ImageError, MAX_IMAGE_BYTES, detectFormat, processImage } from "@/lib/media";

/** Um texto que só existe no EXIF de entrada: se aparecer na saída, o metadado vazou. */
const SENTINEL = "SEGREDO-DO-GPS-12345";

/** @param {number} width @param {number} height */
const raw = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 60 } } });

/** JPEG com EXIF (copyright com a sentinela, GPS e orientação). */
async function jpegWithExif(width = 800, height = 400) {
  return raw(width, height)
    .withExif({ IFD0: { Copyright: SENTINEL, Orientation: "1" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 32/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "46/1 38/1 0/1" } })
    .jpeg()
    .toBuffer();
}

const png = (width = 300, height = 200) => raw(width, height).png().toBuffer();
const webp = (width = 300, height = 200) => raw(width, height).webp().toBuffer();

/** PNG sintético com IHDR de 30000x30000 (CRC correto): a bomba de pixels, sem alocar a imagem. */
function bombPng(width = 30000, height = 30000) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profundidade
  header[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", Buffer.alloc(0)), chunk("IEND", Buffer.alloc(0))]);
}

/** Recusa com `ImageError` e uma mensagem que não repete nada do arquivo. */
async function refused(kind, bytes, options) {
  const error = await processImage(kind, bytes, options).then(
    () => null,
    (caught) => caught,
  );
  expect(error).toBeInstanceOf(ImageError);
  return /** @type {ImageError} */ (error);
}

describe("detectFormat: o formato vem dos primeiros bytes", () => {
  it("reconhece PNG, JPEG e WebP, e nada mais", async () => {
    expect(detectFormat(await png())).toBe("png");
    expect(detectFormat(await jpegWithExif())).toBe("jpeg");
    expect(detectFormat(await webp())).toBe("webp");
    expect(detectFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectFormat(Buffer.from("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(detectFormat(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBeNull();
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
    // RIFF que não é WebP (WAVE) e assinatura curta demais
    expect(detectFormat(Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt "))).toBeNull();
    expect(detectFormat(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("processImage: a saída no alvo, reencodada e sem metadados", () => {
  it("avatar: 256x256 WebP, corte quadrado centralizado, sem o EXIF nem o GPS", async () => {
    const input = await jpegWithExif();
    expect(input.includes(Buffer.from(SENTINEL))).toBe(true); // a entrada TEM o metadado

    const out = await processImage("avatar", input);

    expect(out).toMatchObject({ mime: "image/webp", width: 256, height: 256 });
    expect(detectFormat(out.bytes)).toBe("webp");
    expect(out.bytes.includes(Buffer.from(SENTINEL))).toBe(false);
    const meta = await sharp(out.bytes).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("Exif"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("avatar: o corte é centralizado (a faixa do meio de uma imagem horizontal fica)", async () => {
    // 3 faixas verticais iguais (vermelha, verde, azul): o corte quadrado centralizado de 300x100 é a verde.
    const stripes = await sharp({ create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .composite([
        { input: await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(), left: 0, top: 0 },
        { input: await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer(), left: 200, top: 0 },
      ])
      .png()
      .toBuffer();

    const out = await processImage("avatar", stripes);
    const { data, info } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];

    // Perto das duas bordas do corte (onde estariam o vermelho e o azul) e no meio: tudo verde.
    for (const [x, y] of [[24, 128], [128, 128], [231, 128]]) {
      const [r, g, b] = pixel(x, y);
      expect(g, `verde em (${x},${y})`).toBeGreaterThan(200);
      expect(r).toBeLessThan(60);
      expect(b).toBeLessThan(60);
    }
  });

  it("logo: até 512 px no maior lado, proporção mantida, WebP; imagem menor não é ampliada", async () => {
    const big = await processImage("logo", await png(2000, 1000));
    expect(big).toMatchObject({ mime: "image/webp", width: 512, height: 256 });

    const small = await processImage("logo", await png(120, 60));
    expect(small).toMatchObject({ mime: "image/webp", width: 120, height: 60 });
  });

  it("logo: a transparência do PNG é mantida (alfa no WebP)", async () => {
    const clear = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } }).png().toBuffer();

    const out = await processImage("logo", clear);

    expect((await sharp(out.bytes).metadata()).hasAlpha).toBe(true);
  });

  it("favicon: 64x64 PNG", async () => {
    const out = await processImage("favicon", await jpegWithExif(500, 300));

    expect(out).toMatchObject({ mime: "image/png", width: 64, height: 64 });
    expect(detectFormat(out.bytes)).toBe("png");
    expect(out.bytes.includes(Buffer.from(SENTINEL))).toBe(false);
  });

  it("aceita os três formatos de entrada (PNG, JPEG, WebP)", async () => {
    for (const bytes of [await png(), await jpegWithExif(), await webp()]) {
      expect((await processImage("avatar", bytes)).width).toBe(256);
    }
  });

  it("o sha256 é o da SAÍDA, e o id muda quando o conteúdo muda", async () => {
    const a = await processImage("avatar", await png());
    const { createHash } = await import("node:crypto");
    expect(a.sha256).toBe(createHash("sha256").update(a.bytes).digest("hex"));
    const b = await processImage("avatar", await sharp({ create: { width: 300, height: 200, channels: 3, background: "#0000ff" } }).png().toBuffer());
    expect(b.sha256).not.toBe(a.sha256);
  });

  it("a orientação do EXIF é aplicada antes de tirar o metadado (retrato de celular)", async () => {
    // 200x100 com a orientação 6 (girar 90°) vira 100x200: o logo (maior lado 200) sai 100x200.
    const rotated = await raw(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);

    const out = await processImage("logo", rotated);

    expect(out).toMatchObject({ width: 100, height: 200 });
  });

  it("o polígloto (JPEG com HTML anexado) sai limpo", async () => {
    const jpeg = await jpegWithExif(200, 200);
    const poly = Buffer.concat([jpeg, Buffer.from("<html><script>alert(document.cookie)</script></html>")]);

    const out = await processImage("avatar", poly);

    expect(out.bytes.includes(Buffer.from("<script>"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("<html>"))).toBe(false);
  });
});

describe("processImage: o que não é imagem válida vira ImageError, sem eco", () => {
  it.each([
    ["SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><script>alert(1)</script></svg>")],
    ["GIF", Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;")],
    ["HTML renomeado", Buffer.from("<!doctype html><html><body><script>alert(1)</script></body></html>")],
    ["ZIP", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6])],
    ["PDF", Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n")],
    ["texto qualquer", Buffer.from("isto não é uma imagem")],
  ])("%s: recusado pelo conteúdo", async (name, bytes) => {
    for (const kind of /** @type {const} */ (["avatar", "logo", "favicon"])) {
      const error = await refused(kind, bytes);
      expect(error.message).toMatch(/PNG, JPEG ou WebP/);
      expect(error.message).not.toContain(name);
      expect(error.message).not.toMatch(/script|svg|html|zip|gif/i);
    }
  });

  it("arquivo vazio", async () => {
    expect((await refused("avatar", Buffer.alloc(0))).message).toMatch(/vazio/);
  });

  it("cabeçalho de PNG válido com o corpo corrompido: ImageError, nunca uma exceção do sharp", async () => {
    const good = await png();
    const broken = Buffer.concat([good.subarray(0, 40), Buffer.from("lixo lixo lixo lixo")]);
    const error = await refused("avatar", broken);
    expect(error.message).toMatch(/Não foi possível ler/);
  });

  it("JPEG truncado", async () => {
    const jpeg = await jpegWithExif();
    await refused("avatar", jpeg.subarray(0, Math.floor(jpeg.length / 3)));
  });

  it("bomba de pixels (30000x30000, 900 MP) é recusada antes de decodificar", async () => {
    const error = await refused("avatar", bombPng());
    expect(error.message).toMatch(/25 megapixels/);
  });

  it("o limite de pixels: 25 MP passam do limite; 5000x5000 (25 MP exatos) é aceito pelo cabeçalho", async () => {
    const over = await refused("logo", bombPng(5001, 5000));
    expect(over.message).toMatch(/25 megapixels/);
    // No limite exato a decisão deixa de ser do cabeçalho: o corpo vazio do PNG sintético falha na leitura.
    const edge = await refused("logo", bombPng(5000, 5000));
    expect(edge.message).toMatch(/Não foi possível ler/);
  });

  it("o tipo declarado diferente do conteúdo é recusado (e o de acordo, ou vazio, passa)", async () => {
    const bytes = await png();
    expect((await refused("avatar", bytes, { declaredType: "image/jpeg" })).message).toMatch(/não confere/);
    await refused("avatar", bytes, { declaredType: "text/html" });
    await refused("avatar", bytes, { declaredType: "image/svg+xml" });

    expect((await processImage("avatar", bytes, { declaredType: "image/png" })).width).toBe(256);
    expect((await processImage("avatar", bytes, { declaredType: "IMAGE/PNG; charset=binary" })).width).toBe(256);
    expect((await processImage("avatar", bytes, { declaredType: "" })).width).toBe(256);
    expect((await processImage("avatar", bytes)).width).toBe(256);
  });

  it("o tipo de imagem desconhecido é erro de programação (não ImageError)", async () => {
    await expect(processImage(/** @type {any} */ ("banner"), await png())).rejects.toThrow(/desconhecido/);
  });
});

it("o teto do arquivo é de 2 MB", () => {
  expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
});
