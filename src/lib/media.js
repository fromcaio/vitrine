// Processamento das imagens enviadas (A-029, RF35, RF36, RN29; ADR-034; Cap. 5 §5.12, `sec:arq-upload`).
// A defesa é TRANSFORMAR, e não só validar: a imagem que o servidor guarda e serve é a que o `sharp`
// gerou, e não a que o usuário enviou. O formato vem do CONTEÚDO (os primeiros bytes), nunca do nome do
// arquivo nem do tipo declarado; só PNG, JPEG e WebP chegam ao decodificador (SVG, GIF, HTML, ZIP e o que
// mais for param antes). A saída não tem metadados (o EXIF, inclusive o GPS, não sai) e tem o formato e o
// tamanho do alvo: avatar 256x256 WebP (corte quadrado centralizado), logotipo até 512 px no maior lado
// (WebP, com alfa) e favicon 64x64 PNG. O `sharp` roda no pool de threads do libuv: não bloqueia o laço de
// eventos do servidor. Este módulo é puro (sem banco nem HTTP): quem o chama converte `ImageError` na
// resposta 422 `INVALID_IMAGE`. As mensagens são em português e NUNCA repetem o arquivo, o nome nem o tipo
// enviados.
import { createHash } from "node:crypto";
import sharp from "sharp";

/** Tamanho máximo do arquivo enviado: 2 MB (RF35). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Dimensão máxima da entrada, em pixels (largura x altura): 25 megapixels (bomba de descompressão). */
export const MAX_IMAGE_PIXELS = 25_000_000;

/** Os tipos de imagem do envio, na saída do servidor. */
export const IMAGE_KINDS = /** @type {const} */ (["avatar", "logo", "favicon"]);

/** @typedef {typeof IMAGE_KINDS[number]} ImageKind */

/**
 * Imagem pronta para `replaceImage` (Dados): os bytes reencodados e os metadados da SAÍDA.
 * @typedef {{ mime: string, bytes: Buffer, width: number, height: number, sha256: string }} ProcessedImage
 */

/** A imagem enviada não vale (formato, tamanho, dimensão ou arquivo corrompido). */
export class ImageError extends Error {
  /** @param {string} message em português, sem eco do arquivo */
  constructor(message) {
    super(message);
    this.name = "ImageError";
  }
}

const MESSAGES = Object.freeze({
  empty: "O arquivo está vazio. Escolha uma imagem PNG, JPEG ou WebP.",
  format: "Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.",
  declared: "O tipo do arquivo não confere com o conteúdo. Envie uma imagem PNG, JPEG ou WebP.",
  unreadable: "Não foi possível ler a imagem. Envie um arquivo PNG, JPEG ou WebP válido.",
  tooManyPixels: "A imagem é grande demais (no máximo 25 megapixels). Reduza as dimensões e envie de novo.",
});

// O pool de threads do libuv já roda cada operação; o `sharp` ainda divide uma operação em threads, e o
// servidor aceita no máximo dois processamentos ao mesmo tempo. O cache de operações só guardaria memória.
sharp.cache(false);
sharp.concurrency(2);

/**
 * O formato PELO CONTEÚDO: assinatura de PNG, de JPEG ou de WebP (RIFF....WEBP). `null` para todo o resto.
 * @param {Uint8Array} bytes
 * @returns {"png" | "jpeg" | "webp" | null}
 */
export function detectFormat(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "webp";
  }
  return null;
}

const DECLARED_TYPES = Object.freeze({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });

/**
 * O tipo que o cliente declarou confere com o conteúdo? Vazio (não declarado) passa: a decisão é do
 * conteúdo. Um tipo declarado diferente do detectado (`image/jpeg` com um PNG dentro, `text/html` com uma
 * imagem) é recusado.
 * @param {string | undefined | null} declared
 * @param {"png" | "jpeg" | "webp"} detected
 */
function declaredMatches(declared, detected) {
  const type = String(declared ?? "").split(";")[0].trim().toLowerCase();
  return type === "" || type === DECLARED_TYPES[detected];
}

/**
 * Decodifica, confere e REENCODA a imagem para o alvo (`kind`). Falha de decodificação, formato fora de
 * PNG, JPEG e WebP, arquivo vazio, dimensão acima de 25 megapixels ou tipo declarado que não confere com
 * o conteúdo lançam `ImageError`. O tamanho em bytes (2 MB) é conferido ANTES, na leitura do corpo.
 * @param {ImageKind} kind
 * @param {Uint8Array} input
 * @param {{ declaredType?: string | null }} [options] `declaredType`: o tipo que o cliente declarou
 * @returns {Promise<ProcessedImage>}
 */
export async function processImage(kind, input, { declaredType } = {}) {
  if (!IMAGE_KINDS.includes(kind)) throw new Error(`Tipo de imagem desconhecido: ${String(kind)}`);
  if (!input || input.length === 0) throw new ImageError(MESSAGES.empty);

  const detected = detectFormat(input);
  if (!detected) throw new ImageError(MESSAGES.format);
  if (!declaredMatches(declaredType, detected)) throw new ImageError(MESSAGES.declared);

  try {
    const source = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error", sequentialRead: true });
    // O cabeçalho dá as dimensões sem decodificar: a bomba de descompressão é recusada antes do custo.
    const meta = await source.metadata();
    if (!meta.width || !meta.height) throw new ImageError(MESSAGES.unreadable);
    if (meta.width * meta.height > MAX_IMAGE_PIXELS) throw new ImageError(MESSAGES.tooManyPixels);

    // `rotate()` aplica a orientação do EXIF; sem `withMetadata`, a saída não leva nenhum metadado.
    let pipeline = source.rotate();
    /** @type {string} */
    let mime;
    if (kind === "avatar") {
      pipeline = pipeline.resize(256, 256, { fit: "cover", position: "centre" }).webp({ quality: 85 });
      mime = "image/webp";
    } else if (kind === "logo") {
      pipeline = pipeline.resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 });
      mime = "image/webp";
    } else {
      pipeline = pipeline.resize(64, 64, { fit: "cover", position: "centre" }).png({ compressionLevel: 9 });
      mime = "image/png";
    }
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { mime, bytes: data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    // A mensagem do `sharp` pode citar o conteúdo: não vai ao usuário (só o limite de pixels é reconhecido).
    if (/pixel limit/i.test(String(/** @type {any} */ (error)?.message))) throw new ImageError(MESSAGES.tooManyPixels);
    throw new ImageError(MESSAGES.unreadable);
  }
}
