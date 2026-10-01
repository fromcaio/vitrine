// Layout do painel administrativo: rota dinâmica, nunca em cache, com a sessão validada no
// servidor (o Proxy é só a verificação otimista). A aparência do painel é da UI (M10).
import { requireAdminSession } from "./_lib/session";

export const metadata = {
  title: "Painel administrativo",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }) {
  await requireAdminSession();
  return children;
}
