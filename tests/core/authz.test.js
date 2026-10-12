// CT37: a matriz de autorização (src/lib/authz.js) é exercida INTEIRA, sem servidor nem banco:
// cada ação contra cada situação, mais papel e ação desconhecidos (falha fechada). A tabela esperada
// é escrita à mão, linha por linha, a partir da prova de conceito do RFC (24 ações × 7 situações);
// o teste "cobre exatamente as ações" impede que uma ação nova entre na matriz sem linha aqui.
import { describe, expect, it } from "vitest";
import { ALLOWED_WHILE_MUST_CHANGE, POLICY, ROLES, authorize, isSuspended } from "@/lib/authz";

// Colunas: anônimo | usuário no próprio | usuário no alheio | admin no próprio | admin no alheio |
// suspenso no próprio | senha provisória no próprio.
//   A = permitido · 401 = UNAUTHENTICATED · 403 = FORBIDDEN · P = 403 PASSWORD_CHANGE_REQUIRED
//   - = não se aplica (ação de coleção, ou de recurso único como a configuração do site: não há "dono alheio")
const SITUATIONS = [
  "anônimo",
  "usuário, próprio",
  "usuário, alheio",
  "admin, próprio",
  "admin, alheio",
  "suspenso, próprio",
  "senha provisória, próprio",
];

/** @type {Record<string, string[]>} */
const EXPECTED = {
  "content:list": ["401", "A", "-", "A", "-", "401", "P"],
  "content:read": ["401", "A", "403", "A", "A", "401", "P"],
  "content:create": ["401", "A", "-", "A", "-", "401", "P"],
  "content:update": ["401", "A", "403", "A", "A", "401", "P"],
  "content:delete": ["401", "A", "403", "A", "A", "401", "P"],
  "content:reorder": ["401", "A", "403", "A", "A", "401", "P"],
  "site:read": ["401", "403", "-", "A", "-", "401", "P"],
  "site:update": ["401", "403", "-", "A", "-", "401", "P"],
  "appearance:read": ["401", "A", "403", "A", "A", "401", "P"],
  "appearance:update": ["401", "A", "403", "A", "403", "401", "P"],
  // Página inicial do espaço (ADR-040): o dono, de qualquer papel; o administrador só modera a de outro
  "home:read": ["401", "A", "403", "A", "403", "401", "P"],
  "home:update": ["401", "A", "403", "A", "403", "401", "P"],
  "home:moderate": ["401", "403", "403", "A", "A", "401", "P"],
  "users:list": ["401", "403", "-", "A", "-", "401", "P"],
  "users:create": ["401", "403", "-", "A", "-", "401", "P"],
  "users:read": ["401", "A", "403", "A", "A", "401", "A"],
  "users:update": ["401", "403", "403", "A", "A", "401", "P"],
  "users:ban": ["401", "403", "403", "A", "A", "401", "P"],
  "users:reset-password": ["401", "403", "403", "A", "A", "401", "P"],
  "users:remove": ["401", "403", "403", "A", "A", "401", "P"],
  "profile:update": ["401", "A", "403", "A", "403", "401", "P"],
  "profile:change-password": ["401", "A", "403", "A", "403", "401", "A"],
  "notifications:list": ["401", "A", "-", "A", "-", "401", "P"],
  "notifications:update": ["401", "A", "403", "A", "403", "401", "P"],
};

const COLLECTION_ACTIONS = new Set([
  "content:list",
  "content:create",
  "site:read",
  "site:update",
  "users:list",
  "users:create",
  "notifications:list",
]);

const ana = { id: "ana", role: "user" };
const admin = { id: "adm", role: "admin" };
const suspended = { id: "ana", role: "user", banned: true, banExpires: null };
const provisional = { id: "ana", role: "user", mustChangePassword: true };

/** @param {ReturnType<typeof authorize>} decision */
function symbol(decision) {
  if (decision.allowed) return "A";
  return decision.code === "PASSWORD_CHANGE_REQUIRED" ? "P" : String(decision.status);
}

/** As sete situações de uma ação, na ordem de SITUATIONS. @param {string} action */
function outcomes(action) {
  const collection = COLLECTION_ACTIONS.has(action);
  const own = collection ? undefined : { ownerId: "ana" };
  return [
    symbol(authorize(null, action, own)),
    symbol(authorize(ana, action, own)),
    collection ? "-" : symbol(authorize(ana, action, { ownerId: "beto" })),
    symbol(authorize(admin, action, collection ? undefined : { ownerId: "adm" })),
    collection ? "-" : symbol(authorize(admin, action, { ownerId: "beto" })),
    symbol(authorize(suspended, action, own)),
    symbol(authorize(provisional, action, own)),
  ];
}

describe("CT37: matriz papel × recurso × ação", () => {
  it("cobre exatamente as ações da tabela (24), sem sobra nem falta", () => {
    expect(Object.keys(POLICY).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(POLICY)).toHaveLength(24);
  });

  it("tem uma linha esperada por situação", () => {
    for (const [action, row] of Object.entries(EXPECTED)) {
      expect(row, action).toHaveLength(SITUATIONS.length);
    }
  });

  it("o conjunto de ações de coleção do teste é o da tabela", () => {
    const fromPolicy = Object.entries(POLICY)
      .filter(([, row]) => row.scope === "collection")
      .map(([action]) => action);
    expect(fromPolicy.sort()).toEqual([...COLLECTION_ACTIONS].sort());
  });

  // Uma asserção por célula: a falha diz a ação e a situação exatas.
  for (const action of Object.keys(EXPECTED)) {
    describe(action, () => {
      SITUATIONS.forEach((situation, index) => {
        if (EXPECTED[action][index] === "-") return;
        it(`${situation} → ${EXPECTED[action][index]}`, () => {
          expect(outcomes(action)[index]).toBe(EXPECTED[action][index]);
        });
      });
    });
  }

  it("os códigos de erro do envelope: 401 UNAUTHENTICATED, 403 FORBIDDEN e 403 PASSWORD_CHANGE_REQUIRED", () => {
    expect(authorize(null, "content:read", { ownerId: "ana" })).toEqual({
      allowed: false,
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(authorize(ana, "content:read", { ownerId: "beto" })).toEqual({
      allowed: false,
      status: 403,
      code: "FORBIDDEN",
    });
    expect(authorize(provisional, "content:read", { ownerId: "ana" })).toEqual({
      allowed: false,
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  });
});

describe("CT37: o que a matriz marca como moderação (recurso de outro dono)", () => {
  it("o administrador no recurso alheio é permitido com foreign: true", () => {
    expect(authorize(admin, "content:update", { ownerId: "beto" })).toEqual({ allowed: true, foreign: true });
    expect(authorize(admin, "users:ban", { ownerId: "beto" })).toEqual({ allowed: true, foreign: true });
  });

  it("no próprio recurso, foreign é false (inclusive para o administrador)", () => {
    expect(authorize(ana, "content:update", { ownerId: "ana" })).toEqual({ allowed: true, foreign: false });
    expect(authorize(admin, "content:update", { ownerId: "adm" })).toEqual({ allowed: true, foreign: false });
  });

  it("ações de coleção nunca são moderação", () => {
    expect(authorize(admin, "content:list")).toEqual({ allowed: true, foreign: false });
    expect(authorize(ana, "content:create")).toEqual({ allowed: true, foreign: false });
  });
});

describe("CT37: falha fechada", () => {
  it("papel desconhecido nega tudo, em qualquer ação, mesmo no recurso próprio", () => {
    for (const role of ["xyz", "", "Admin", "ADMIN", "admin,user", "user,admin", "superuser", undefined, null, 1, {}]) {
      for (const action of Object.keys(POLICY)) {
        const decision = authorize({ id: "x", role: /** @type {any} */ (role) }, action, { ownerId: "x" });
        expect(decision.allowed, `${String(role)} / ${action}`).toBe(false);
      }
    }
  });

  it("ação desconhecida nega, mesmo para o administrador", () => {
    for (const action of ["content:purge", "", "content", "users:impersonate", "toString", "__proto__", "constructor"]) {
      expect(authorize(admin, action, { ownerId: "adm" }).allowed, action).toBe(false);
      expect(authorize(ana, action, { ownerId: "ana" }).allowed, action).toBe(false);
    }
  });

  it("ação desconhecida de quem não tem sessão continua sendo 401, não 403", () => {
    expect(authorize(null, "content:purge", { ownerId: "x" })).toMatchObject({ status: 401 });
  });

  it("sessão ausente ou malformada é 401", () => {
    for (const actor of [null, undefined, {}, { role: "admin" }, { id: "", role: "admin" }, { id: 7, role: "admin" }, "admin", 42]) {
      expect(authorize(/** @type {any} */ (actor), "content:list"), JSON.stringify(actor)).toMatchObject({
        allowed: false,
        status: 401,
      });
    }
  });

  it("recurso sem dono nunca casa com a regra own (ownerId ausente, indefinido, nulo ou vazio)", () => {
    for (const resource of [undefined, {}, { ownerId: undefined }, { ownerId: null }, { ownerId: "" }]) {
      expect(authorize(ana, "content:update", resource).allowed, JSON.stringify(resource)).toBe(false);
      expect(authorize(ana, "appearance:update", resource).allowed, JSON.stringify(resource)).toBe(false);
    }
  });

  it("recurso sem dono também nega ao administrador (a regra any não dispensa o dono)", () => {
    expect(authorize(admin, "content:update", {}).allowed).toBe(false);
    expect(authorize(admin, "content:update").allowed).toBe(false);
  });

  it("um usuário sem id nunca casa com um recurso sem dono (undefined === undefined)", () => {
    expect(authorize(/** @type {any} */ ({ role: "user" }), "content:update", {}).allowed).toBe(false);
  });

  it("ação de coleção com dono informado diferente do ator é negada ao usuário", () => {
    expect(authorize(ana, "content:list", { ownerId: "beto" })).toMatchObject({ allowed: false, status: 403 });
    expect(authorize(ana, "notifications:list", { ownerId: "beto" })).toMatchObject({ allowed: false, status: 403 });
    expect(authorize(ana, "content:list", { ownerId: "ana" }).allowed).toBe(true);
  });

  it("o administrador não lê as notificações alheias nem em coleção (mínimo privilégio, RN19)", () => {
    expect(authorize(admin, "notifications:list", { ownerId: "beto" })).toMatchObject({ allowed: false, status: 403 });
    expect(authorize(admin, "notifications:update", { ownerId: "beto" })).toMatchObject({ allowed: false, status: 403 });
  });

  it("a tabela e as listas exportadas são imutáveis", () => {
    expect(Object.isFrozen(POLICY)).toBe(true);
    expect(Object.isFrozen(POLICY["content:update"])).toBe(true);
    expect(Object.isFrozen(ROLES)).toBe(true);
    expect(() => {
      "use strict";
      /** @type {any} */ (POLICY["content:update"]).user = "any";
    }).toThrow();
  });

  it("só trocar a senha e ler o próprio perfil escapam da senha provisória", () => {
    expect([...ALLOWED_WHILE_MUST_CHANGE].sort()).toEqual(["profile:change-password", "users:read"]);
  });
});

describe("CT37: suspensão (RN23)", () => {
  const now = new Date("2026-10-04T12:00:00Z");

  it("suspensão sem prazo vale", () => {
    expect(isSuspended({ banned: true, banExpires: null }, now)).toBe(true);
    expect(isSuspended({ banned: true }, now)).toBe(true);
  });

  it("suspensão com prazo vigente vale, em Date, texto ISO ou número", () => {
    const future = new Date("2026-10-05T00:00:00Z");
    expect(isSuspended({ banned: true, banExpires: future }, now)).toBe(true);
    expect(isSuspended({ banned: true, banExpires: future.toISOString() }, now)).toBe(true);
    expect(isSuspended({ banned: true, banExpires: future.getTime() }, now)).toBe(true);
  });

  it("suspensão com prazo vencido não vale (o better-auth só limpa banned no próximo login)", () => {
    const past = new Date("2026-10-03T00:00:00Z");
    expect(isSuspended({ banned: true, banExpires: past }, now)).toBe(false);
    expect(authorize({ id: "ana", role: "user", banned: true, banExpires: past }, "content:read", { ownerId: "ana" }, { now }).allowed).toBe(true);
  });

  it("o instante exato do vencimento já não é suspensão", () => {
    expect(isSuspended({ banned: true, banExpires: now }, now)).toBe(false);
  });

  it("prazo ilegível não devolve o acesso", () => {
    expect(isSuspended({ banned: true, banExpires: "ontem" }, now)).toBe(true);
  });

  it("quem não está suspenso não é suspenso, com banExpires solto", () => {
    expect(isSuspended({ banned: false, banExpires: new Date("2099-01-01") }, now)).toBe(false);
    expect(isSuspended({ banned: null }, now)).toBe(false);
    expect(isSuspended({}, now)).toBe(false);
  });

  it("a suspensão vence a senha provisória e a regra do papel: o administrador suspenso é 401", () => {
    const decision = authorize({ id: "adm", role: "admin", banned: true, mustChangePassword: true }, "users:list");
    expect(decision).toMatchObject({ allowed: false, status: 401 });
  });
});
