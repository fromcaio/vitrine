// Rotas do better-auth (Cap. 5 §5.6 e §5.10; ADR-029): o catch-all responde SÓ a
// GET /api/auth/get-session, POST /api/auth/sign-in/email e POST /api/auth/sign-out. Todo o resto,
// inclusive as rotas do plugin `admin`, a troca de senha e o cadastro, responde 404 no envelope
// (a lista de permitidas está em ../../_lib/auth-guard.js). O cadastro público está desabilitado
// em src/lib/auth.js (RF22).
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { guardAuthHandlers } from "../../_lib/auth-guard";

export const { GET, POST } = guardAuthHandlers(toNextJsHandler(auth));
