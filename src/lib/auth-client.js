// Cliente React do better-auth, para Componentes Cliente (formulário de login e botão de sair).
// Usa a mesma origem da página (rotas em /api/auth), por isso não precisa de URL base nem de
// variável NEXT_PUBLIC_*.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
