import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [GitHub],
  // Adicionamos as páginas aqui para o Middleware saber para onde redirecionar
  pages: {
    signIn: "/auth/login",
  },
} satisfies NextAuthConfig;