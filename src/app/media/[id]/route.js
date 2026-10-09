// GET /media/:id (Cap. 5 §5.10, tab:api-v1; RF35, RF36, RN29; ADR-034): serve a imagem de um logotipo, de um favicon ou
// de um avatar. Fora de /api, PÚBLICO (sem sessão) e SEM `no-store`: o identificador é opaco (mudar a imagem gera um
// id novo), então a resposta é imutável, `Cache-Control: public, max-age=31536000, immutable`. O `Content-Type` é o
// FIXO da saída do `sharp` (WebP ou PNG), `X-Content-Type-Options: nosniff` e o `ETag` é o sha256 do conteúdo;
// `If-None-Match` igual responde 304. Identificador inexistente responde 404, sem distinguir o motivo. Serve também a
// imagem de um espaço suspenso (ADR-034, item 8): o identificador é opaco, e só as páginas do espaço (que dão 404)
// o referenciam. A rota não consulta o dono nem a sessão: lê só a tabela de imagens.
import { getImage } from "@/lib/db";

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Os tipos que o servidor serve: o que o `sharp` produz (qualquer outro valor no banco vira 404). */
const SERVED_TYPES = new Set(["image/webp", "image/png"]);

/** @param {string | null} header o `If-None-Match` da requisição @param {string} etag o ETag atual (com aspas) */
function matches(header, etag) {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim().replace(/^W\//, "");
    return value === "*" || value === etag;
  });
}

/** 404 uniforme: o mesmo corpo vazio para o id inexistente, malformado ou de um tipo que não se serve. */
const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/**
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const image = id.length <= 64 ? await getImage(id) : null;
  if (!image || !SERVED_TYPES.has(image.mime)) return notFound();

  const etag = `"${image.sha256}"`;
  const headers = {
    "Content-Type": image.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": IMMUTABLE,
    ETag: etag,
  };
  if (matches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(image.bytes, { status: 200, headers: { ...headers, "Content-Length": String(image.bytes.byteLength) } });
}
