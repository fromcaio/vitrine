// /api/users/me/avatar (Cap. 5 §5.10, tab:api-v1; RF36, RN29): envia (PUT, multipart) ou remove (DELETE) o avatar do
// PRÓPRIO usuário (WebP, 256x256, corte quadrado centralizado). Revalida o espaço do dono e o portal (o avatar
// entra no diretório). Permitido a qualquer papel; com a senha provisória pendente, 403. A lógica é de
// ../../../_lib/images.js.
import { imageRoutes } from "../../../_lib/images";

const routes = imageRoutes({ kind: "avatar", action: "profile:update", site: false, directory: true });

export const PUT = routes.PUT;
export const DELETE = routes.DELETE;
