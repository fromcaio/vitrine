// Validação do formulário do editor (M09; RF05, RF26) com o Zod, pelos mesmos esquemas de campo
// que o servidor usa (`src/lib/validators.js`, módulo puro). A validação do servidor continua a
// autoridade (RF21): esta existe para avisar o autor antes do envio, junto de cada campo.
import * as z from "zod";
import { CONTENT_STATUSES, slugSchema, validate } from "@/lib/validators";

/** Campos do formulário. */
export const EDITOR_FIELDS = /** @type {const} */ (["title", "slug", "status", "body"]);

/** Esquema do formulário: título e slug obrigatórios (RN03), estado e corpo. */
export const editorSchema = z.object({
  title: z.string().trim().min(1, { error: "O título é obrigatório." }),
  slug: slugSchema,
  status: z.enum(CONTENT_STATUSES, { error: "O estado deve ser Rascunho ou Publicado." }),
  body: z.string(),
});

/**
 * Resolvedor do react-hook-form para o `editorSchema`. É próprio, de poucas linhas, para não
 * depender do pacote `@hookform/resolvers`: o `validate` de `validators.js` já devolve um item
 * por campo, em português. Devolve os valores já ajustados (o título sem espaços nas pontas).
 * @param {import("./draft").EditorValues} values
 */
export async function editorResolver(values) {
  const result = validate(editorSchema, values);
  if (result.ok) return { values: result.data, errors: {} };

  /** @type {Record<string, { type: string, message: string }>} */
  const errors = {};
  for (const { field, message } of result.details) {
    // Um item por campo: o primeiro erro de cada um.
    if (!(field in errors)) errors[field] = { type: "validation", message };
  }
  return { values: {}, errors };
}

/**
 * @param {import("./draft").EditorValues} a
 * @param {import("./draft").EditorValues} b
 */
export function valuesEqual(a, b) {
  return a.title === b.title && a.slug === b.slug && a.body === b.body && a.status === b.status;
}
