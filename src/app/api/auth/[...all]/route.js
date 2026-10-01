// Rotas do better-auth (Cap. 5 §5.10): POST /api/auth/sign-in/email, POST /api/auth/sign-out,
// GET /api/auth/get-session e as demais rotas padrão da biblioteca. O cadastro
// (POST /api/auth/sign-up/email) responde 400: está desabilitado em src/lib/auth.js (RF22).
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
