// Marca do site, do espaço e do painel (D-34, ADR-037): o logo e/ou o nome, o logo ANTES do nome.
// `showLogo` e `showName` valem `true` por padrão; pelo menos um fica ligado (a regra é do servidor e
// do formulário; se as duas chegarem desligadas, o nome aparece, para a barra nunca ficar sem marca).
// Sem imagem (`logoUrl` vazio) o logo é o `DefaultLogo`: sempre existe um logo. Quando o nome está
// oculto, o nome acessível do link passa a ser o do logo (`alt`). Server Component de apresentação:
// recebe tudo por props; o nome é sempre texto escapado.
import { DefaultLogo } from "./DefaultLogo";

/**
 * @param {object} props
 * @param {string} props.name nome do site ou do espaço
 * @param {string | null} [props.logoUrl] logo (`/media/<id>`); sem ele, o logo embutido
 * @param {boolean} [props.showLogo] mostra o logo (padrão)
 * @param {boolean} [props.showName] mostra o nome (padrão)
 * @param {string} [props.nameClassName] classes do nome
 */
export function SiteBrand({ name, logoUrl = null, showLogo = true, showName = true, nameClassName = "text-lg font-semibold" }) {
  const nameVisible = showName || !showLogo;
  const logoVisible = showLogo;
  return (
    <>
      {logoVisible ? (
        logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do próprio site (/media), tamanho fixo
          <img
            src={logoUrl}
            alt={nameVisible ? "" : name}
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-sm object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <DefaultLogo label={nameVisible ? undefined : name} />
        )
      ) : null}
      {nameVisible ? <span className={`min-w-0 break-words ${nameClassName}`.trim()}>{name}</span> : null}
    </>
  );
}
