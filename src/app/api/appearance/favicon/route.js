// /api/appearance/favicon (Cap. 5 §5.10, tab:api-v1; RF35, RN29): envia (PUT, multipart) ou remove (DELETE) o favicon
// do espaço DO PRÓPRIO usuário (PNG, 64x64). A lógica é de ../../_lib/images.js.
import { imageRoutes } from "../../_lib/images";

const routes = imageRoutes({ kind: "favicon", action: "appearance:update", site: false });

export const PUT = routes.PUT;
export const DELETE = routes.DELETE;
