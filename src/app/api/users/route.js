// /api/users (Cap. 5 §5.10, ADR-029): lista e criação de contas. Só o administrador (RF27, RN19).
// Nenhum cadastro público existe: a conta nasce aqui, com a troca de senha obrigatória (RN21).
// Todas as chamadas a `auth.api.*` levam os cabeçalhos do pedido (sem eles, o pacote não verifica
// nada); a autorização do Vitrine vem antes, pela matriz.
import { auth } from "@/lib/auth";
import { getUserByHandle } from "@/lib/db";
import { userCreateSchema, userListQuerySchema } from "@/lib/validators";
import { ApiError, ok, parse } from "../_lib/http";
import { route } from "../_lib/route";
import { authCall, generateTemporaryPassword, publicUser } from "../_lib/users";

/**
 * GET: lista de usuários (`?limit=` de 1 a 100, padrão 50; `?offset=`; `?search=` por parte do
 * e-mail), do mais antigo ao mais novo. `total` acompanha `data`, para a paginação.
 */
export const GET = route({ action: "users:list" }, async ({ request }) => {
  const query = parse(userListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const result = await authCall(() =>
    auth.api.listUsers({
      headers: request.headers,
      query: {
        limit: query.limit,
        offset: query.offset,
        sortBy: "createdAt",
        sortDirection: "asc",
        ...(query.search ? { searchValue: query.search, searchField: "email", searchOperator: "contains" } : {}),
      },
    }),
  );
  const users = /** @type {any[]} */ (result.users);
  return ok(users.map(publicUser), { extra: { total: result.total, limit: query.limit, offset: query.offset } });
});

/**
 * POST: cria a conta (`email`, `name`, `handle`, `role` e senha opcional). Sem senha, o servidor
 * gera a provisória de 16 caracteres, devolvida UMA ÚNICA VEZ em `temporaryPassword` e nunca
 * registrada; com senha, `temporaryPassword` é `null`. A conta nasce com `mustChangePassword`
 * ligado. E-mail ou handle já usado: 409 `USER_CONFLICT` com o campo.
 */
export const POST = route({ action: "users:create", mutation: true, rate: "users" }, async ({ request, readJson }) => {
  const input = parse(userCreateSchema, await readJson());

  // O handle vale também para a conta suspensa: ela volta a usá-lo (RN20).
  if (input.handle && (await getUserByHandle(input.handle, { includeSuspended: true }))) {
    throw new ApiError(409, "USER_CONFLICT", "Já existe um usuário com este handle.", [{ field: "handle" }]);
  }

  const generated = input.password === undefined;
  const password = input.password ?? generateTemporaryPassword();
  const { user } = await authCall(() =>
    auth.api.createUser({
      headers: request.headers,
      body: {
        email: input.email,
        name: input.name,
        password,
        role: input.role,
        data: { mustChangePassword: true, ...(input.handle ? { handle: input.handle } : {}) },
      },
    }),
  );

  return ok(
    { ...publicUser(/** @type {any} */ (user)), temporaryPassword: generated ? password : null },
    { status: 201, headers: { Location: `/api/users/${user.id}` } },
  );
});
