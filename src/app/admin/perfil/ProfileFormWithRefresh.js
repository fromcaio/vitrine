"use client";

// Envoltório Cliente do `ProfileForm` da UI (RF28): o `onSaved` é uma função, e uma página de Servidor não
// passa funções a um Componente Cliente. Depois de gravar o nome, `router.refresh()` busca de novo a página
// no servidor, e o nome no cabeçalho do painel (o layout) se atualiza sem recarregar.
import { useRouter } from "next/navigation";
import { ProfileForm } from "@/components/admin/ProfileForm";

/**
 * @param {object} props
 * @param {{ name: string, email: string, handle: string | null, role: "admin" | "user" }} props.user
 * @param {string | null} props.spaceHref
 */
export function ProfileFormWithRefresh({ user, spaceHref }) {
  const router = useRouter();
  return <ProfileForm user={user} spaceHref={spaceHref} onSaved={() => router.refresh()} />;
}
