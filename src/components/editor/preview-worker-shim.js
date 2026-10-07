// O que o pipeline de Markdown pede ao DOM ao ser CARREGADO e ao converter fórmulas, e que um worker não
// tem. O Next.js resolve a condição "browser" dos pacotes também para o worker, e duas builds "browser"
// do pipeline usam o DOM:
//   1. `decode-named-character-reference` (micromark) faz `document.createElement("i")` no topo do módulo;
//   2. `hast-util-from-html-isomorphic` (usado pelo `rehype-katex` para ler o HTML que o KaTeX gera) faz
//      `new DOMParser()` no topo do módulo e, para um fragmento, `document.createElement("template")`.
// Sem `document` e sem `DOMParser`, o worker morria ao carregar (`document is not defined`). Este módulo é
// importado ANTES de tudo em `preview-worker.js` e só dá um `document` e um `DOMParser` de mentira, inertes.
//
// O QUE ISSO CUSTA, honestamente: o worker só MEDE se o texto processa dentro do orçamento (não renderiza
// nada), e com o shim ele deixa de fazer duas coisas pequenas e lineares: (1) decodificar entidades nomeadas
// (`&amp;` fica como texto) e (2) converter o HTML de cada fórmula em árvore (o fragmento vira um único nó de
// texto). Todo o resto do pipeline roda de verdade: o parse do micromark, o GFM, a sintaxe de matemática, o
// KaTeX (`renderToString`, que não usa o DOM) e o realce de código. A thread principal, que renderiza, usa os
// decodificadores de verdade, com o DOM. Por isso o worker pode subestimar, de leve, o custo de um texto cheio
// de fórmulas; o orçamento de 1 s tem folga sobre o limite que se quer proteger (a aba congelada por vários
// segundos), e a medição do Chromium (A-023) compara o tempo do worker com o da thread principal.
if (typeof document === "undefined") {
  /** @type {any} */ (globalThis).document = {
    // O KaTeX confere `document.compatMode` ao carregar e avisaria do "quirks mode" no console do worker.
    compatMode: "CSS1Compat",
    createElement(/** @type {string} */ tag) {
      if (tag === "template") {
        let html = "";
        return {
          set innerHTML(value) {
            html = String(value);
          },
          // Um único nó de texto com o HTML: o `rehype-katex` só usa os filhos da raiz.
          get content() {
            return { nodeType: 11, childNodes: html === "" ? [] : [{ nodeType: 3, nodeValue: html }] };
          },
        };
      }
      let text = "";
      return {
        set innerHTML(value) {
          text = String(value);
        },
        get textContent() {
          return text;
        },
      };
    },
  };
}

if (typeof (/** @type {any} */ (globalThis).DOMParser) === "undefined") {
  /** @type {any} */ (globalThis).DOMParser = class {
    parseFromString(/** @type {string} */ html) {
      return { nodeType: 9, childNodes: html === "" ? [] : [{ nodeType: 3, nodeValue: html }] };
    }
  };
}
