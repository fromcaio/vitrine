// Conteúdo do portal `/` (RF30; M17): o texto do administrador, em Markdown (o mesmo
// MarkdownRenderer da leitura), e o diretório de espaços quando está ligado. Server Component de
// apresentação: o texto e a lista chegam por props.
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { PortalDirectory } from "./PortalDirectory";

/**
 * @param {object} props
 * @param {string | null} [props.body] texto do portal em Markdown (`Configuration.homeBody`); sem
 *   ele, a página mostra só o diretório
 * @param {import("./PortalDirectory").PublicSpace[] | null} [props.spaces] os espaços; `null` com o
 *   diretório desligado (`directoryEnabled` falso), e então a lista nem é exibida
 * @param {string} props.title título da página (um `h1`, o nome do site)
 */
export function PortalHome({ body = null, spaces = null, title }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
      <h1 className="text-3xl font-semibold break-words">{title}</h1>
      {body ? <MarkdownRenderer markdown={body} /> : null}
      {spaces ? <PortalDirectory spaces={spaces} /> : null}
    </div>
  );
}
