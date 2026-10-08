"use client";

// Avatar (RF36, RN29; ADR-034): a imagem do usuário (`/media/<id>`, com largura e altura fixas, sem salto
// de layout, e `loading="lazy"` por padrão) ou, sem imagem ou se ela não carrega, as INICIAIS do nome em
// um círculo, só com tokens de tema (fundo de superfície, texto do primeiro plano: contraste AA nos dois
// modos). Aceita só endereço `/media/<id>`: uma URL externa nunca vira `src` (nenhum componente do épico
// carrega imagem de terceiros; a CSP da v1 mantém `https:` só por causa do Markdown).
//
// `decorative`: quando o nome já está escrito ao lado (o diretório, a tabela de usuários), o `alt` é
// vazio e as iniciais ficam ocultas das tecnologias assistivas; sem ele, a imagem leva o nome no `alt` e
// as iniciais viram uma imagem rotulada com o nome.
import { useState } from "react";
import { initialsOf, isMediaUrl } from "./image-model";

/**
 * @param {object} props
 * @param {string} props.name nome da pessoa (das iniciais e do `alt`)
 * @param {string | null} [props.src] `/media/<id>` do avatar; sem ele, as iniciais
 * @param {number} [props.size] lado, em pixels (padrão 40)
 * @param {boolean} [props.decorative] o nome está ao lado: `alt` vazio (padrão `false`)
 * @param {boolean} [props.eager] carrega já, para o que está acima da dobra (padrão: preguiçoso)
 * @param {string} [props.className]
 */
export function Avatar({ name, src = null, size = 40, decorative = false, eager = false, className = "" }) {
  // A imagem que falhou ao carregar (o endereço, não o componente): troca por iniciais.
  const [failed, setFailed] = useState(/** @type {string | null} */ (null));
  const box = { width: size, height: size };
  if (isMediaUrl(src) && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagem já reencodada e pequena, servida por /media
      <img
        src={src}
        alt={decorative ? "" : name}
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(src)}
        style={box}
        className={`shrink-0 rounded-full border border-border-strong bg-surface object-cover ${className}`.trim()}
      />
    );
  }
  return (
    <span
      {...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": name })}
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border-strong bg-surface font-semibold text-foreground ${className}`.trim()}
    >
      {initialsOf(name)}
    </span>
  );
}
