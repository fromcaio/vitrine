// @vitest-environment jsdom
// P-032 (RNF02): a folha do KaTeX só vai a quem tem fórmula. O MarkdownRenderer não a importa; o MathStyles (Componente
// Cliente) a pede depois da hidratação, e só quando o texto tem fórmula; a leitura de documentos e a pré-visualização
// do editor a importam por conta própria (para a matemática nunca aparecer sem estilo ali).
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

const loaded = vi.hoisted(() => ({ times: 0 }));
vi.mock("katex/dist/katex.min.css", () => {
  loaded.times += 1;
  return {};
});

afterEach(cleanup);

const source = (/** @type {string} */ file) => fs.readFileSync(path.resolve(import.meta.dirname, "../../src/components", file), "utf8");

describe("a folha do KaTeX sob demanda", () => {
  it("um texto sem fórmula não pede a folha (a página inicial sem fórmula não a recebe)", async () => {
    render(<MarkdownRenderer markdown={"# Título\n\nTexto **simples**, com `código` e um [link](https://exemplo.test)."} headingOffset={1} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loaded.times).toBe(0);
  });

  it("um texto com fórmula pede a folha, uma vez, depois de montar", async () => {
    render(<MarkdownRenderer markdown={"A fórmula $x^2$ vale."} />);
    await waitFor(() => expect(loaded.times).toBe(1));
  });
});

describe("quem importa a folha por conta própria", () => {
  it("DocumentView (a leitura) a importa de forma estática: nenhum documento com fórmula aparece sem estilo", () => {
    expect(source("reading/DocumentView.js")).toMatch(/^import "katex\/dist\/katex\.min\.css";$/m);
  });

  it("Preview (o editor) a pede assim que o texto parece ter fórmula, em um pedaço à parte (nunca estática)", () => {
    const preview = source("editor/Preview.js");
    expect(preview).toMatch(/void import\("katex\/dist\/katex\.min\.css"\)/);
    expect(preview).not.toMatch(/^import "katex/m);
  });

  it("só esses três arquivos citam a folha em src/components (o MarkdownRenderer, o SpaceHome e o PortalHome, não)", () => {
    const roots = ["markdown", "reading", "editor", "layout", "admin", "ui"];
    /** @type {string[]} */
    const found = [];
    for (const dir of roots) {
      for (const file of fs.readdirSync(path.resolve(import.meta.dirname, "../../src/components", dir))) {
        if (!file.endsWith(".js")) continue;
        // Só código (os comentários podem citar a folha): um `import "…katex….css"` ou um `import("…katex….css")`.
        if (/^\s*import "[^"]*katex[^"]*\.css"|void import\("[^"]*katex[^"]*\.css"\)/m.test(source(`${dir}/${file}`))) found.push(`${dir}/${file}`);
      }
    }
    expect(found.sort()).toEqual(["editor/Preview.js", "markdown/MathStyles.js", "reading/DocumentView.js"]);
  });
});
