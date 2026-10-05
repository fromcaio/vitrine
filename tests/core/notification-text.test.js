// Texto das notificações em português (RF33, RN26, ADR-026): montado a partir de `type` e `data`.
import { describe, expect, it } from "vitest";
import { describeNotification } from "@/app/api/_lib/notification-text";

const describeEvent = (data, type = "MODERATION") => describeNotification({ type, data });

describe("describeNotification: eventos da conta", () => {
  it("suspensão sem prazo, com o motivo", () => {
    expect(describeEvent({ event: "ACCOUNT_SUSPENDED", reason: "Spam", expiresAt: null })).toEqual({
      title: "Sua conta foi suspensa",
      text: "Um administrador suspendeu a sua conta por tempo indeterminado. Enquanto durar, você não entra no painel e o seu espaço fica fora do ar; o seu conteúdo é preservado. Motivo: Spam",
    });
  });

  it("suspensão com prazo: a data em português, no fuso de Brasília", () => {
    const { text } = describeEvent({ event: "ACCOUNT_SUSPENDED", reason: "Spam", expiresAt: "2026-12-24T15:30:00.000Z" });

    expect(text).toContain("suspendeu a sua conta até 24/12/2026");
    expect(text).toContain("12:30"); // 15:30 UTC = 12:30 em Brasília
    expect(text).not.toContain("indeterminado");
  });

  it("prazo ilegível cai em sem prazo, nunca em 'Invalid Date'", () => {
    const { text } = describeEvent({ event: "ACCOUNT_SUSPENDED", reason: "x", expiresAt: "ontem" });

    expect(text).toContain("por tempo indeterminado");
    expect(text).not.toContain("Invalid");
  });

  it("reativação e senha redefinida", () => {
    expect(describeEvent({ event: "ACCOUNT_REACTIVATED" }, "ACCOUNT").title).toBe("Sua conta foi reativada");
    expect(describeEvent({ event: "PASSWORD_RESET" }, "ACCOUNT")).toEqual({
      title: "Sua senha foi redefinida",
      text: "Um administrador redefiniu a sua senha. Entre com a senha provisória que ele lhe passou e troque-a em seguida.",
    });
  });
});

describe("describeNotification: moderação de conteúdo", () => {
  it("despublicado", () => {
    expect(describeEvent({ event: "CONTENT_UNPUBLISHED", contentTitle: "Limites", reason: "Fora das regras" })).toEqual({
      title: "Conteúdo despublicado",
      text: "Um administrador despublicou “Limites”: ele voltou a ser rascunho e saiu do ar. Motivo: Fora das regras",
    });
  });

  it("editado: lista os campos em português", () => {
    const one = describeEvent({ event: "CONTENT_EDITED", contentTitle: "Limites", reason: "Erro", fields: ["body"] });
    const two = describeEvent({ event: "CONTENT_EDITED", contentTitle: "Limites", reason: "Erro", fields: ["title", "body"] });
    const three = describeEvent({ event: "CONTENT_EDITED", contentTitle: "Limites", reason: "Erro", fields: ["title", "slug", "status"] });

    expect(one.text).toBe("Um administrador editou “Limites” (alterou o texto). Motivo: Erro");
    expect(two.text).toContain("(alterou o título e o texto)");
    expect(three.text).toContain("(alterou o título, o endereço (slug) e o estado de publicação)");
    expect(one.title).toBe("Conteúdo editado pela moderação");
  });

  it("editado sem campos conhecidos: omite o parêntese", () => {
    const { text } = describeEvent({ event: "CONTENT_EDITED", contentTitle: "Limites", reason: "Erro", fields: ["campo-novo"] });

    expect(text).toBe("Um administrador editou “Limites”. Motivo: Erro");
  });

  it("excluído: a coleção leva o que havia dentro; o documento, não", () => {
    const collection = describeEvent({ event: "CONTENT_DELETED", contentTitle: "Cálculo", contentType: "COLLECTION", reason: "Plágio" });
    const document = describeEvent({ event: "CONTENT_DELETED", contentTitle: "Limites", contentType: "DOCUMENT", reason: "Plágio" });

    expect(collection).toEqual({
      title: "Conteúdo excluído",
      text: "Um administrador excluiu “Cálculo”, com tudo o que havia dentro dela. Motivo: Plágio",
    });
    expect(document.text).toBe("Um administrador excluiu “Limites”. Motivo: Plágio");
  });

  it("sem título ou sem motivo, o texto continua legível", () => {
    expect(describeEvent({ event: "CONTENT_DELETED", contentType: "DOCUMENT" }).text).toBe("Um administrador excluiu um conteúdo seu.");
  });

  it("o motivo e o título entram como texto puro (a UI escapa)", () => {
    const { text } = describeEvent({ event: "CONTENT_EDITED", contentTitle: "<b>x</b>", reason: "<script>", fields: ["body"] });

    expect(text).toContain("<b>x</b>");
    expect(text).toContain("<script>");
  });
});

describe("describeNotification: o que não se conhece", () => {
  it("evento desconhecido e dados vazios caem no aviso genérico", () => {
    expect(describeEvent({ event: "FUTURO" }, "ACCOUNT")).toEqual({ title: "Aviso", text: "Você tem um aviso do sistema." });
    expect(describeEvent({}, "MODERATION").title).toBe("Aviso");
  });

  it("contraste, até existir o texto próprio (P-013), usa o aviso de contraste genérico", () => {
    expect(describeEvent({}, "CONTRAST")).toEqual({
      title: "Aviso de contraste",
      text: "A paleta do seu espaço tem um aviso de contraste.",
    });
  });

  it("valores de tipo errado em data não derrubam a montagem", () => {
    expect(() => describeEvent({ event: "CONTENT_EDITED", contentTitle: 42, reason: { a: 1 }, fields: "body" })).not.toThrow();
    expect(() => describeEvent({ event: 7 })).not.toThrow();
  });
});
