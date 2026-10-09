// Perfil do próprio usuário (RF28; CT39): a página usa `requireSession` e monta o `ProfileForm` da UI com o
// perfil DA SESSÃO (`publicUser`, só os quatro campos que o formulário mostra) e o endereço do espaço público.
// Só o nome é editável (o formulário envia `PATCH /api/users/me` com `{ name }`; e-mail, handle e papel só
// o administrador altera). O avatar é o do próprio usuário (`/media/<id>`, A-029; `ImageUpload` contra
// `/api/users/me/avatar`). O envoltório Cliente chama `router.refresh()` para atualizar o cabeçalho.
import { publicUser } from "../../api/_lib/users";
import { spaceHrefOf } from "../_lib/content-tree";
import { requireSession } from "../_lib/session";
import { ProfileFormWithRefresh } from "./ProfileFormWithRefresh";

export const metadata = {
  title: "Perfil",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const { user } = await requireSession({ path: "/admin/perfil" });
  const { name, email, handle, role, avatarImageId } = publicUser(user);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Perfil</h1>
      <ProfileFormWithRefresh
        user={{ name, email, handle, role }}
        spaceHref={spaceHrefOf(handle)}
        avatar={{ url: avatarImageId ? `/media/${avatarImageId}` : null }}
      />
    </div>
  );
}
