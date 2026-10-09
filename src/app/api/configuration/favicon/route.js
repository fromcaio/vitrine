// /api/configuration/favicon (Cap. 5 §5.10, tab:api-v1; RF35, RN29): envia (PUT, multipart) ou remove (DELETE) o
// favicon do SISTEMA. Só o administrador. Revalida o portal e os espaços que herdam o favicon. A lógica é de
// ../../_lib/images.js.
import { imageRoutes } from "../../_lib/images";

const routes = imageRoutes({ kind: "favicon", action: "site:update", site: true });

export const PUT = routes.PUT;
export const DELETE = routes.DELETE;
