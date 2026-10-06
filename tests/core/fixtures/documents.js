// Documentos de teste do orçamento de renderização (A-014 A-021; ADR-033): um documento COMUM de ~62 KiB e um
// hostil de 64 KiB, compartilhados pelos testes da função e das rotas.

/**
 * Um documento COMUM de ~62 KiB (títulos, parágrafos, listas, tabelas, código e fórmulas em quantidade de um
 * texto de aula), e não um pior caso: o orçamento tem margem sobre ele.
 */
export function commonDocument() {
  const paragraph = "A derivada de uma função mede a taxa de variação instantânea; em cada ponto, o limite do quociente de Newton descreve a inclinação da reta tangente, e a integral faz o caminho inverso. ";
  let text = "# Cálculo diferencial\n\n";
  for (let i = 1; Buffer.byteLength(text) < 62 * 1024; i++) {
    text += `## Seção ${i}\n\n${paragraph.repeat(3)}**Atenção:** veja o [resumo](https://exemplo.test/${i}).\n\n`;
    if (i % 4 === 0) text += `- primeiro ponto ${i}\n- segundo ponto\n  - aninhado com $a_${i}$\n\n`;
    if (i % 6 === 0) text += `| coluna | valor |\n|---|---|\n| a | ${i} |\n\n`;
    if (i % 8 === 0) text += `\`\`\`python\ndef f(x):\n    return x * ${i}\n\`\`\`\n\n`;
    if (i % 5 === 0) text += `$$\n\int_0^1 x^${i}\,dx = \frac{1}{${i + 1}}\n$$\n\n`;
  }
  return text;
}

/**
 * Um texto hostil que cabe na cota de 64 KiB (65 535 bytes) e passa MUITO do orçamento de 2 s (o
 * renderizador leva mais de 40 s nele): um asterisco em torre. É o que as rotas devem recusar.
 */
export const HOSTILE_64K = `${"*".repeat(32_767)}a${"*".repeat(32_767)}`;
