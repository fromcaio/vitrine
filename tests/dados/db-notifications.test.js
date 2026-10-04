// Integração: notificações internas em src/lib/db.js (M15; RF33, RN26; CT54). Cobre a criação com
// deduplicação e reabertura, o contador, a listagem, o isolamento por usuário e a retenção:
// poda só do contraste, preguiçosa, e teto de 1000 por usuário com a ordem de remoção da RN26.
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTRAST_RETENTION_DAYS,
  DataError,
  MAX_NOTIFICATIONS_PER_USER,
  countUnread,
  dismiss,
  listNotifications,
  markRead,
  notify,
  prisma,
  pruneNotifications,
  resetNotificationPruneClock,
  resolveNotification,
} from "@/lib/db";
import { createUser, resetDatabase } from "./helpers.js";

/** @param {Promise<unknown>} promise @returns {Promise<DataError>} */
async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return /** @type {DataError} */ (error);
  }
  throw new Error("Era esperado um erro, mas a chamada foi bem-sucedida.");
}

const DAY = 86_400_000;
const NOW = new Date("2026-10-04T12:00:00Z");
/** Instante `n` minutos depois de 2026-01-01: ordena as linhas semeadas, da mais antiga à mais nova. @param {number} n */
const minute = (n) => new Date(Date.UTC(2026, 0, 1, 0, n));
/** @param {number} days */
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);

describe("db.js: notificações", () => {
  /** @type {string} */
  let ana;
  /** @type {string} */
  let bia;

  beforeEach(async () => {
    await resetDatabase();
    resetNotificationPruneClock();
    ana = (await createUser("ana")).id;
    bia = (await createUser("bia")).id;
  });

  /** @param {string} userId @param {Record<string, unknown>} fields */
  const seed = (userId, fields) =>
    prisma.notification.create({ data: /** @type {any} */ ({ userId, data: "{}", type: "MODERATION", ...fields }) });

  describe("notify: criação e validação", () => {
    it("cria a notificação com o data como objeto, gravidade INFO por padrão e conta como não lida", async () => {
      const criada = await notify({ userId: ana, type: "MODERATION", data: { motivo: "conteúdo ofensivo", id: 7 } }, { now: NOW });

      expect(criada).toMatchObject({
        userId: ana,
        type: "MODERATION",
        severity: "INFO",
        dedupeKey: null,
        readAt: null,
        resolvedAt: null,
        data: { motivo: "conteúdo ofensivo", id: 7 },
      });
      expect(await countUnread(ana)).toBe(1);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: criada.id } })).data).toBe(
        '{"motivo":"conteúdo ofensivo","id":7}',
      );
    });

    it("sem data, grava objeto vazio; sem chave, cada chamada cria uma notificação nova", async () => {
      await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });
      await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(2);
      expect((await listNotifications(ana))[0].data).toEqual({});
    });

    it("recusa tipo e gravidade fora do domínio, chave vazia, data não serializável e usuário vazio", async () => {
      expect((await failure(notify({ userId: ana, type: /** @type {any} */ ("OUTRO") }))).code).toBe("INVALID_INPUT");
      expect((await failure(notify({ userId: ana, type: "ACCOUNT", severity: /** @type {any} */ ("GRAVE") }))).code).toBe("INVALID_INPUT");
      expect((await failure(notify({ userId: ana, type: "CONTRAST", dedupeKey: " " }))).code).toBe("INVALID_INPUT");
      const circular = /** @type {any} */ ({});
      circular.self = circular;
      expect((await failure(notify({ userId: ana, type: "ACCOUNT", data: circular }))).code).toBe("INVALID_INPUT");
      expect((await failure(notify({ userId: "", type: "ACCOUNT" }))).code).toBe("INVALID_INPUT");
      expect(await prisma.notification.count()).toBe(0);
    });

    it("destinatário inexistente é recusado pelo banco (AUTHOR_NOT_FOUND)", async () => {
      expect((await failure(notify({ userId: "fantasma", type: "ACCOUNT" }))).code).toBe("AUTHOR_NOT_FOUND");
    });
  });

  describe("deduplicação e reabertura (RN26)", () => {
    it("a mesma chave gera uma só notificação, reaberta: leitura e resolução zeradas, dados e gravidade novos", async () => {
      const primeira = await notify(
        { userId: ana, type: "CONTRAST", severity: "WARNING", dedupeKey: "contrast:dark", data: { campo: "darkPrimaryColor", razao: 3.1 } },
        { now: minute(1) },
      );
      await markRead(ana, [primeira.id], { now: minute(2) });
      await resolveNotification(ana, "contrast:dark", { now: minute(3) });
      expect(await countUnread(ana)).toBe(0);

      const reaberta = await notify(
        { userId: ana, type: "CONTRAST", severity: "CRITICAL", dedupeKey: "contrast:dark", data: { campo: "darkPrimaryColor", razao: 2.2 } },
        { now: minute(10) },
      );

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1);
      expect(reaberta).toMatchObject({
        id: primeira.id,
        severity: "CRITICAL",
        readAt: null,
        resolvedAt: null,
        data: { campo: "darkPrimaryColor", razao: 2.2 },
      });
      expect(reaberta.updatedAt.getTime()).toBe(minute(10).getTime());
      expect(await countUnread(ana)).toBe(1);
    });

    it("duas chaves (uma por modo) coexistem, e a mesma chave de outro usuário é independente", async () => {
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: NOW });
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:dark" }, { now: NOW });
      await notify({ userId: bia, type: "CONTRAST", dedupeKey: "contrast:dark" }, { now: NOW });
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:dark" }, { now: NOW });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(2);
      expect(await prisma.notification.count({ where: { userId: bia } })).toBe(1);
    });

    it("cinco ocorrências seguidas da mesma paleta ruim deixam uma única notificação", async () => {
      for (let i = 0; i < 5; i += 1) {
        await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light", data: { vez: i } }, { now: minute(i) });
      }

      const todas = await listNotifications(ana);
      expect(todas).toHaveLength(1);
      expect(todas[0].data).toEqual({ vez: 4 });
    });
  });

  describe("resolver, contar, ler e dispensar", () => {
    it("resolver tira do contador; reabrir volta a contar; resolver o que não existe não faz nada", async () => {
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: minute(1) });

      expect(await resolveNotification(ana, "contrast:light", { now: minute(2) })).toEqual({ count: 1 });
      expect(await countUnread(ana)).toBe(0);
      expect(await resolveNotification(ana, "contrast:light", { now: minute(3) })).toEqual({ count: 0 });
      expect(await resolveNotification(ana, "contrast:nao-existe")).toEqual({ count: 0 });
      expect((await prisma.notification.findFirstOrThrow({ where: { userId: ana } })).resolvedAt?.getTime()).toBe(minute(2).getTime());
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: minute(4) });
      expect(await countUnread(ana)).toBe(1);
    });

    it("o contador não conta as lidas nem as resolvidas, e é por usuário", async () => {
      const a = await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });
      await notify({ userId: ana, type: "MODERATION" }, { now: NOW });
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: NOW });
      await notify({ userId: bia, type: "ACCOUNT" }, { now: NOW });
      await markRead(ana, [a.id]);
      await resolveNotification(ana, "contrast:light");

      expect(await countUnread(ana)).toBe(1);
      expect(await countUnread(bia)).toBe(1);
    });

    it("markRead marca só as do próprio usuário: ids alheios são ignorados; sem ids, marca todas as suas", async () => {
      const a1 = await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });
      await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });
      const b1 = await notify({ userId: bia, type: "ACCOUNT" }, { now: NOW });

      expect(await markRead(ana, [a1.id, b1.id], { now: NOW })).toEqual({ count: 1 });
      expect(await countUnread(bia)).toBe(1);
      expect(await markRead(ana, undefined, { now: NOW })).toEqual({ count: 1 });
      expect(await countUnread(ana)).toBe(0);
      expect(await markRead(ana, [])).toEqual({ count: 0 });
    });

    it("dismiss exclui só a do próprio usuário", async () => {
      const a1 = await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });
      const b1 = await notify({ userId: bia, type: "ACCOUNT" }, { now: NOW });

      expect(await dismiss(bia, a1.id)).toEqual({ count: 0 });
      expect(await dismiss(ana, a1.id)).toEqual({ count: 1 });
      expect(await prisma.notification.count({ where: { id: b1.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { id: a1.id } })).toBe(0);
    });
  });

  describe("listNotifications", () => {
    it("lista as mais recentes primeiro, só as do usuário, com paginação por cursor sem repetição", async () => {
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push((await notify({ userId: ana, type: "ACCOUNT", data: { i } }, { now: minute(i) })).id);
      }
      await notify({ userId: bia, type: "ACCOUNT" }, { now: minute(9) });

      const primeira = await listNotifications(ana, { take: 2 });
      const segunda = await listNotifications(ana, { take: 2, cursor: primeira[1].id });
      const terceira = await listNotifications(ana, { take: 2, cursor: segunda[1].id });

      expect(primeira.map((n) => n.id)).toEqual([ids[4], ids[3]]);
      expect(segunda.map((n) => n.id)).toEqual([ids[2], ids[1]]);
      expect(terceira.map((n) => n.id)).toEqual([ids[0]]);
    });

    it("unreadOnly traz só as não lidas e não resolvidas; take inválido é INVALID_INPUT", async () => {
      const lida = await notify({ userId: ana, type: "ACCOUNT" }, { now: minute(1) });
      await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: minute(2) });
      await notify({ userId: ana, type: "MODERATION" }, { now: minute(3) });
      await markRead(ana, [lida.id]);
      await resolveNotification(ana, "contrast:light");

      expect((await listNotifications(ana, { unreadOnly: true })).map((n) => n.type)).toEqual(["MODERATION"]);
      expect(await listNotifications(ana)).toHaveLength(3);
      expect((await failure(listNotifications(ana, { take: 0 }))).code).toBe("INVALID_INPUT");
      expect((await failure(listNotifications(ana, { take: 1001 }))).code).toBe("INVALID_INPUT");
    });

    it("um data corrompido no banco não derruba a listagem", async () => {
      await seed(ana, { data: "isto não é json" });

      expect((await listNotifications(ana))[0].data).toEqual({});
    });
  });

  describe("CT54: poda por idade, só do contraste (RN26)", () => {
    it("poda a de contraste lida ou resolvida há mais de 90 dias; protege a não lida, a recente e a de moderação e conta", async () => {
      const velha = daysAgo(CONTRAST_RETENTION_DAYS + 1);
      await seed(ana, { type: "CONTRAST", dedupeKey: "c1", readAt: velha });
      await seed(ana, { type: "CONTRAST", dedupeKey: "c2", resolvedAt: velha });
      await seed(ana, { type: "CONTRAST", dedupeKey: "c3" }); // não lida e antiga: fica
      await seed(bia, { type: "CONTRAST", dedupeKey: "c4", readAt: daysAgo(10) }); // recente: fica
      await seed(ana, { type: "MODERATION", readAt: velha });
      await seed(ana, { type: "ACCOUNT", readAt: velha });
      await seed(bia, { type: "MODERATION", resolvedAt: velha });

      const { count } = await pruneNotifications({ now: NOW });

      expect(count).toBe(2);
      const restantes = await prisma.notification.findMany({ select: { type: true, dedupeKey: true } });
      expect(restantes).toHaveLength(5);
      expect(restantes.filter((n) => n.type === "CONTRAST").map((n) => n.dedupeKey).sort()).toEqual(["c3", "c4"]);
      expect(restantes.filter((n) => n.type !== "CONTRAST")).toHaveLength(3);
    });

    it("o limite é 'mais de 90 dias': exatamente 90 fica, 90 dias e um minuto sai", async () => {
      await seed(ana, { type: "CONTRAST", dedupeKey: "exato", readAt: daysAgo(90) });
      await seed(ana, { type: "CONTRAST", dedupeKey: "passou", readAt: new Date(daysAgo(90).getTime() - 60_000) });

      await pruneNotifications({ now: NOW });

      expect((await prisma.notification.findMany()).map((n) => n.dedupeKey)).toEqual(["exato"]);
    });

    it("a poda preguiçosa roda ao criar uma notificação, no máximo uma vez por dia por processo", async () => {
      const velha = daysAgo(120);
      await seed(ana, { type: "CONTRAST", dedupeKey: "antiga-1", readAt: velha });

      await notify({ userId: bia, type: "ACCOUNT" }, { now: NOW }); // primeira do processo: poda
      expect(await prisma.notification.count({ where: { dedupeKey: "antiga-1" } })).toBe(0);

      await seed(ana, { type: "CONTRAST", dedupeKey: "antiga-2", readAt: velha });
      await notify({ userId: bia, type: "ACCOUNT" }, { now: new Date(NOW.getTime() + 23 * 3_600_000) }); // mesmo dia: não poda
      expect(await prisma.notification.count({ where: { dedupeKey: "antiga-2" } })).toBe(1);

      await notify({ userId: bia, type: "ACCOUNT" }, { now: new Date(NOW.getTime() + 25 * 3_600_000) }); // passou um dia: poda
      expect(await prisma.notification.count({ where: { dedupeKey: "antiga-2" } })).toBe(0);
    });

    it("a poda preguiçosa nunca remove moderação nem conta, por mais antigas e lidas que sejam", async () => {
      await seed(ana, { type: "MODERATION", readAt: daysAgo(400) });
      await seed(ana, { type: "ACCOUNT", readAt: daysAgo(400), resolvedAt: daysAgo(400) });

      await notify({ userId: ana, type: "ACCOUNT" }, { now: NOW });

      expect(await prisma.notification.count({ where: { userId: ana, type: { in: ["MODERATION", "ACCOUNT"] } } })).toBe(3);
    });
  });

  describe("CT54: teto absoluto por usuário (RN26)", () => {
    // Instante logo depois dos dados semeados (janeiro de 2026): a poda por idade, que roda ao criar a
    // primeira notificação do processo, não pode ser a causa das remoções verificadas aqui.
    const LATER = minute(3000);

    /**
     * Semeia, de uma vez, as notificações da usuária Ana, da mais antiga para a mais nova.
     * @param {Array<Record<string, unknown>>} rows
     */
    async function seedMany(rows) {
      await prisma.notification.createMany({
        data: rows.map((row, i) => /** @type {any} */ ({ userId: ana, data: "{}", type: "MODERATION", createdAt: minute(i), updatedAt: minute(i), ...row })),
      });
    }

    /** `n` notificações de moderação não lidas, a partir do minuto `from`. @param {number} n @param {number} [from] */
    const unread = (n, from = 10) => Array.from({ length: n }, (_, i) => ({ createdAt: minute(from + i), updatedAt: minute(from + i) }));

    it("o teto é 1000 e abaixo dele nada é removido", async () => {
      expect(MAX_NOTIFICATIONS_PER_USER).toBe(1000);
      await seedMany(unread(998));

      await notify({ userId: ana, type: "ACCOUNT" }, { now: LATER });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(999);
    });

    it("a 1001.ª é criada (nunca bloqueada) e sai uma: a de contraste lida ou resolvida mais antiga", async () => {
      // As candidatas são mais NOVAS que as não lidas: a mais antiga de todas é não lida e, mesmo assim,
      // a que sai é a de contraste lida ou resolvida mais antiga (a ordem é por estágio, não só por idade).
      await seedMany([
        ...unread(998),
        { type: "CONTRAST", dedupeKey: "contrast:dark", resolvedAt: minute(2001), createdAt: minute(1001), updatedAt: minute(1001) },
        { type: "CONTRAST", dedupeKey: "contrast:light", readAt: minute(2003), createdAt: minute(1003), updatedAt: minute(1003) },
      ]);
      const maisAntigaDeTodas = await prisma.notification.findFirstOrThrow({ where: { userId: ana }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
      expect(maisAntigaDeTodas.type).toBe("MODERATION");

      const nova = await notify({ userId: ana, type: "MODERATION", data: { motivo: "nova" } }, { now: LATER });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { id: nova.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { dedupeKey: "contrast:dark" } })).toBe(0); // a mais antiga saiu
      expect(await prisma.notification.count({ where: { dedupeKey: "contrast:light" } })).toBe(1);
      expect(await prisma.notification.count({ where: { id: maisAntigaDeTodas.id } })).toBe(1); // a não lida mais antiga ficou
      expect(await prisma.notification.count({ where: { userId: ana, type: "MODERATION", readAt: null } })).toBe(999);
    });

    it("a ordem completa: contraste lida/resolvida, depois moderação e conta já lidas, depois a mais antiga não lida", async () => {
      // As três candidatas (contraste resolvida, moderação lida, conta lida) são mais novas que todas as
      // não lidas, para que a ordem dos estágios, e não a idade, decida quem sai primeiro.
      await seedMany([
        ...unread(997, 10),
        { type: "CONTRAST", dedupeKey: "contrast:dark", resolvedAt: minute(1502), createdAt: minute(1501), updatedAt: minute(1501) },
        { type: "MODERATION", readAt: minute(1504), createdAt: minute(1503), updatedAt: minute(1503) },
        { type: "ACCOUNT", readAt: minute(1506), createdAt: minute(1505), updatedAt: minute(1505) },
      ]);
      const restantes = async () => ({
        contraste: await prisma.notification.count({ where: { userId: ana, type: "CONTRAST" } }),
        lidas: await prisma.notification.count({ where: { userId: ana, type: { in: ["MODERATION", "ACCOUNT"] }, readAt: { not: null } } }),
        naoLidas: await prisma.notification.count({ where: { userId: ana, type: { in: ["MODERATION", "ACCOUNT"] }, readAt: null } }),
      });
      expect(await restantes()).toEqual({ contraste: 1, lidas: 2, naoLidas: 997 });

      await notify({ userId: ana, type: "MODERATION" }, { now: minute(2000) });
      expect(await restantes()).toEqual({ contraste: 0, lidas: 2, naoLidas: 998 }); // saiu a de contraste

      await notify({ userId: ana, type: "MODERATION" }, { now: minute(2001) });
      expect(await restantes()).toEqual({ contraste: 0, lidas: 1, naoLidas: 999 }); // saiu a lida mais antiga (moderação)
      expect(await prisma.notification.count({ where: { userId: ana, type: "ACCOUNT", readAt: { not: null } } })).toBe(1);

      await notify({ userId: ana, type: "MODERATION" }, { now: minute(2002) });
      expect(await restantes()).toEqual({ contraste: 0, lidas: 0, naoLidas: 1000 }); // saiu a de conta lida

      const maisAntigaNaoLida = await prisma.notification.findFirstOrThrow({
        where: { userId: ana },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      });
      await notify({ userId: ana, type: "ACCOUNT" }, { now: minute(2003) });
      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { id: maisAntigaNaoLida.id } })).toBe(0); // só então a mais antiga não lida
    });

    it("nenhuma moderação ou conta não lida é removida enquanto houver outra candidata", async () => {
      await seedMany([
        ...unread(998, 5),
        { type: "MODERATION", readAt: minute(1502), createdAt: minute(1501), updatedAt: minute(1501) },
        { type: "CONTRAST", dedupeKey: "contrast:light", readAt: minute(1504), createdAt: minute(1503), updatedAt: minute(1503) },
      ]);
      const naoLidasAntes = await prisma.notification.findMany({ where: { userId: ana, readAt: null }, select: { id: true } });

      await notify({ userId: ana, type: "ACCOUNT" }, { now: LATER });
      await notify({ userId: ana, type: "ACCOUNT" }, { now: new Date(LATER.getTime() + 1000) });

      const ids = new Set((await prisma.notification.findMany({ where: { userId: ana }, select: { id: true } })).map((n) => n.id));
      expect(naoLidasAntes.every((n) => ids.has(n.id))).toBe(true); // as 998 não lidas seguem todas lá
      expect(await prisma.notification.count({ where: { userId: ana, readAt: { not: null } } })).toBe(0);
    });

    it("passando do teto por mais de uma, remove quantas forem necessárias, na mesma ordem", async () => {
      await seedMany([
        ...unread(999, 20),
        { type: "CONTRAST", dedupeKey: "contrast:dark", readAt: minute(1502), createdAt: minute(1501), updatedAt: minute(1501) },
        { type: "CONTRAST", dedupeKey: "contrast:light", readAt: minute(1504), createdAt: minute(1503), updatedAt: minute(1503) },
        { type: "MODERATION", readAt: minute(1506), createdAt: minute(1505), updatedAt: minute(1505) },
      ]); // 1002 linhas: três acima do teto depois da criação

      await notify({ userId: ana, type: "ACCOUNT" }, { now: minute(5000) });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { userId: ana, type: "CONTRAST" } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: ana, readAt: { not: null } } })).toBe(0);
    });

    it("a notificação recém-criada nunca é a removida, mesmo que seja a mais antiga (relógio atrasado)", async () => {
      await seedMany(unread(1000, 5000)); // todas não lidas e "do futuro" em relação ao `now` abaixo

      const nova = await notify({ userId: ana, type: "ACCOUNT", data: { id: "nova" } }, { now: minute(1) });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { id: nova.id } })).toBe(1); // criada e mantida
    });

    it("o teto é por usuário: as de outro usuário não entram na conta nem são removidas", async () => {
      await seedMany(unread(1000));
      await prisma.notification.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({ userId: bia, type: "MODERATION", data: "{}", createdAt: minute(i), updatedAt: minute(i), readAt: minute(i) })),
      });

      await notify({ userId: ana, type: "MODERATION" }, { now: LATER });

      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { userId: bia } })).toBe(5);
    });

    it("reabrir uma notificação deduplicada com o teto cheio não a remove", async () => {
      await seedMany([
        { type: "CONTRAST", dedupeKey: "contrast:light", readAt: minute(2), createdAt: minute(1), updatedAt: minute(1) },
        ...unread(999),
      ]);

      const reaberta = await notify({ userId: ana, type: "CONTRAST", dedupeKey: "contrast:light" }, { now: LATER });

      expect(reaberta).toMatchObject({ readAt: null, resolvedAt: null });
      expect(await prisma.notification.count({ where: { userId: ana } })).toBe(1000);
      expect(await prisma.notification.count({ where: { id: reaberta.id } })).toBe(1);
    });
  });
});
