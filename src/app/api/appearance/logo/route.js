// /api/appearance/logo (Cap. 5 §5.10, tab:api-v1; RF35, RN29): envia (PUT, multipart) ou remove (DELETE) o logotipo do
// espaço DO PRÓPRIO usuário (WebP, até 512 px no maior lado). Sem identificador: age sempre sobre o dono da
// sessão (RN19). A lógica é de ../../_lib/images.js.
import { imageRoutes } from "../../_lib/images";

const routes = imageRoutes({ kind: "logo", action: "appearance:update", site: false });

export const PUT = routes.PUT;
export const DELETE = routes.DELETE;
