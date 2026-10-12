// `/admin/configuracoes` (ADR-040; CT79): a rota antiga das configurações do site. O texto do portal, o estado
// dele, o diretório de espaços e o título dele passaram a `/admin/pagina-inicial` (`?alvo=sistema`), e a
// identidade visual do sistema é de `/admin/aparencia`. Esta rota só responde um redirecionamento PERMANENTE
// (308), sem exigir sessão: quem chega sem entrar é levado ao destino, que decide (login ou 404).
import { permanentRedirect } from "next/navigation";

export default function ConfigurationRedirectPage() {
  permanentRedirect("/admin/pagina-inicial");
}
