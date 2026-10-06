// redos-seo.mjs -- ensaio de custo quadrático (ReDoS) das funções de texto que tocam entrada do usuário.
// Uso (a partir da raiz do repositório, com a branch a verificar no diretório):
//   node doc/revisao/redos-seo.mjs
// Roda  (src/lib/seo.js) sobre 20 entradas hostis de 256 KiB (o limite de um corpo, RN25).
// Cada linha mostra o tempo em ms; QUALQUER caso acima de ~50 ms é um achado (a função roda no servidor, que é
// um só processo: um documento pode travá-lo). Nasceu da revisão do M-027 (R-018: 123 s com "[" repetido).
import { plainDescription } from "../../src/lib/seo.js";
const KB = 256 * 1024;
const cases = {
  "crases triplas sem fechar": "```\n".repeat(KB / 4),
  "crases com texto": ("```js\nx\n").repeat(KB / 8),
  "til triplo": "~~~\n".repeat(KB / 4),
  "dólar duplo aberto": "$$ ".repeat(KB / 3),
  "dólar simples alternado": "$a ".repeat(KB / 3),
  "colchetes abertos": "[a](".repeat(KB / 4),
  "colchetes sem fechar": "[".repeat(KB),
  "imagens abertas": "![a](".repeat(KB / 5),
  "asteriscos": "*a ".repeat(KB / 3),
  "negrito aberto": "**a ".repeat(KB / 4),
  "sublinhados": "_a ".repeat(KB / 3),
  "tags abertas": "<a ".repeat(KB / 3),
  "comentário aberto": "<!-- ".repeat(KB / 5),
  "barras": "\\".repeat(KB),
  "tabela": "|-".repeat(KB / 2),
  "hashes": "#".repeat(KB),
  "linhas de espaço": " \n".repeat(KB / 2),
  "ref link": "[a]: ".repeat(KB / 5) ,
  "til duplo": "~~a ".repeat(KB / 4),
  "crase simples": "`a ".repeat(KB / 3),
};
for (const [name, text] of Object.entries(cases)) {
  const t = performance.now();
  plainDescription(text);
  const ms = performance.now() - t;
  console.log(`${ms.toFixed(0).padStart(7)} ms  ${name}`);
}
