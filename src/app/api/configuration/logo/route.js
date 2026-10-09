// /api/configuration/logo (Cap. 5 §5.10, tab:api-v1; RF35, RN29): envia (PUT, multipart) ou remove (DELETE) o logotipo
// do SISTEMA. Só o administrador (403 ao usuário comum). Revalida o portal e os espaços que herdam o logotipo
// (ADR-038, item 6). A lógica é de ../../_lib/images.js.
import { imageRoutes } from "../../_lib/images";

const routes = imageRoutes({ kind: "logo", action: "site:update", site: true });

export const PUT = routes.PUT;
export const DELETE = routes.DELETE;
