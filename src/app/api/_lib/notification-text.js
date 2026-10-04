// Texto das notificações em português (RF33, RN26, ADR-026). O banco guarda só `type` e `data`; o
// texto é montado aqui, na leitura, de modo que ajustar uma frase não exige migração. O texto sai
// como TEXTO PURO: quem o exibe (a UI) o escapa. Um evento desconhecido nunca derruba a listagem:
// cai em um aviso genérico.
//
// O texto da notificação de contraste (`CONTRAST`) ainda não existe: depende do P-013 (avisos por
// modo, da UI). Até lá, ela usa o aviso genérico.

const FIELD_LABELS = Object.freeze({
  title: "o título",
  slug: "o endereço (slug)",
  body: "o texto",
  type: "o tipo",
  status: "o estado de publicação",
});

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** @param {unknown} value */
const asText = (value) => (typeof value === "string" ? value : "");

/**
 * Lista em português: "a", "a e b", "a, b e c".
 * @param {string[]} items
 */
function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** @param {unknown} reason */
const reasonSentence = (reason) => (asText(reason) ? ` Motivo: ${asText(reason)}` : "");

/** @param {unknown} title */
const quoted = (title) => (asText(title) ? `“${asText(title)}”` : "um conteúdo seu");

/**
 * Prazo de uma suspensão, ou o texto de "sem prazo".
 * @param {unknown} expiresAt
 */
function suspensionTerm(expiresAt) {
  if (typeof expiresAt !== "string" && !(expiresAt instanceof Date)) return "por tempo indeterminado";
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "por tempo indeterminado" : `até ${DATE_FORMAT.format(date)}`;
}

/**
 * Título e texto de uma notificação, em português.
 * @param {{ type: string, data: Record<string, unknown> }} notification
 * @returns {{ title: string, text: string }}
 */
export function describeNotification({ type, data }) {
  const event = asText(data?.event);

  switch (event) {
    case "ACCOUNT_SUSPENDED":
      return {
        title: "Sua conta foi suspensa",
        text: `Um administrador suspendeu a sua conta ${suspensionTerm(data.expiresAt)}. Enquanto durar, você não entra no painel e o seu espaço fica fora do ar; o seu conteúdo é preservado.${reasonSentence(data.reason)}`,
      };
    case "ACCOUNT_REACTIVATED":
      return {
        title: "Sua conta foi reativada",
        text: "Um administrador reativou a sua conta. Você já pode entrar de novo, e o seu espaço voltou ao ar.",
      };
    case "PASSWORD_RESET":
      return {
        title: "Sua senha foi redefinida",
        text: "Um administrador redefiniu a sua senha. Entre com a senha provisória que ele lhe passou e troque-a em seguida.",
      };
    case "CONTENT_UNPUBLISHED":
      return {
        title: "Conteúdo despublicado",
        text: `Um administrador despublicou ${quoted(data.contentTitle)}: ele voltou a ser rascunho e saiu do ar.${reasonSentence(data.reason)}`,
      };
    case "CONTENT_EDITED": {
      const fields = Array.isArray(data.fields)
        ? data.fields.map((field) => FIELD_LABELS[/** @type {keyof typeof FIELD_LABELS} */ (field)]).filter(Boolean)
        : [];
      const what = fields.length > 0 ? ` (alterou ${joinList(fields)})` : "";
      return {
        title: "Conteúdo editado pela moderação",
        text: `Um administrador editou ${quoted(data.contentTitle)}${what}.${reasonSentence(data.reason)}`,
      };
    }
    case "CONTENT_DELETED": {
      const inside = data.contentType === "COLLECTION" ? ", com tudo o que havia dentro dela" : "";
      return {
        title: "Conteúdo excluído",
        text: `Um administrador excluiu ${quoted(data.contentTitle)}${inside}.${reasonSentence(data.reason)}`,
      };
    }
    default:
      return {
        title: type === "CONTRAST" ? "Aviso de contraste" : "Aviso",
        text: type === "CONTRAST" ? "A paleta do seu espaço tem um aviso de contraste." : "Você tem um aviso do sistema.",
      };
  }
}
