// Desliga a compilação JIT do Zod 4 no navegador (ADR-022). Ao criar um esquema de objeto, o Zod
// sonda `new Function("")` para saber se pode compilar um validador mais rápido. A CSP do site não
// admite `eval`: o Zod captura o erro e segue, mas o navegador registra a tentativa como uma
// violação de CSP (evento `securitypolicyviolation` e erro no console). Com `jitless`, a sonda
// nem acontece, e a validação dá o mesmo resultado, só que sem o atalho compilado.
//
// É um módulo à parte porque PRECISA ser avaliado antes de qualquer esquema ser criado, e o
// `validators.js` (do Core) cria os dele ao ser importado: `schema.js` o importa em primeiro lugar.
// A configuração vale para o Zod do pacote do navegador; o do servidor não é afetado.
import * as z from "zod";

z.config({ jitless: true });
