"use client";

// A barra de coleções do cabeçalho do espaço (P-026; RF13, RNF05, RNF06): UMA só linha, de altura fixa, rolável
// na horizontal, na estética do SectionTabs do outro projeto do autor: os itens se ENCOSTAM de ponta a ponta,
// esticam até a altura da barra, têm cantos retos e a base deles encosta na base do cabeçalho (onde começa a
// sombra). Os links são <a> dentro de <ul>/<li>, em <nav aria-label="Coleções">: são NAVEGAÇÃO, não abas (sem
// role=tab). Eles já vêm no HTML do servidor: a página estática e o leitor sem JavaScript veem os links e rolam a
// faixa pela rolagem nativa; o JavaScript só ACRESCENTA as setas, o arrastar com o ponteiro, a roda do mouse e o
// item ativo centralizado ao entrar.
//
// - As duas setas (pílulas h-7 w-9, de cor translúcida derivada do on-secondary) ocupam o lugar desde o servidor
//   (desativadas, `hidden sm:flex`): a hidratação não mexe em nada (CLS 0). Abaixo de `sm` não há setas: o toque e
//   o arrastar bastam. São <button> com nome, `disabled` nas pontas (saem da ordem de Tab); pressionadas com o
//   mouse, repetem o passo até soltar.
// - A roda só vira rolagem horizontal quando há o que rolar NAQUELE sentido; nas pontas, e sem overflow, o
//   evento passa e a página rola. Gesto horizontal do trackpad e o toque seguem o nativo.
// - Arrastar com mouse ou caneta, acima de um limiar de 4 px, rola a faixa e NÃO dispara o clique do link.
// - Teclado: todos os links ficam na ordem de Tab, e o foco traz o item à vista: a rolagem nativa do foco, mais um
//   ajuste (`keepInView`; o `scroll-padding` do CSS não serve: o Chromium deixa o ÚLTIMO item parcialmente
//   escondido). O foco enche o item como o hover e leva um contorno INTERNO (o overflow não o corta).
// - Movimento reduzido: nada de rolagem suave (o comportamento vale `auto`). Sem barra de rolagem visível.
// - O realce é do tema do dono (tokens): o item ativo (`aria-current`) e o hover/foco enchem com
//   `bg-primary text-on-primary`; só o ATIVO leva o sublinhado grosso (não só a cor, WCAG 1.4.1); nenhum outro
//   estado tem sublinhado, anel ou borda.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";

/** Quanto o arrastar precisa andar (px) para deixar de ser um clique. */
export const DRAG_THRESHOLD = 4;
/** Intervalo (ms) em que a seta pressionada repete o passo. */
export const HOLD_INTERVAL = 160;
/** Folga (px) que o item focado por teclado deixa até a borda da faixa. */
export const FOCUS_MARGIN = 8;

/** O movimento reduzido pede rolagem sem animação. */
function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Roda `fn` logo depois do clique que segue o soltar do ponteiro (a trava do clique só cai aí). @param {() => void} fn */
function afterClick(fn) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

/** @returns {ScrollBehavior} */
function scrollBehavior() {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/**
 * A posição de rolagem que CENTRALIZA um item, de medidas reais do DOM (sem larguras fixas), presa entre 0 e o
 * máximo: o primeiro e o último ficam colados na borda, inteiros à vista.
 * @param {{ left: number, width: number }} container retângulo da faixa
 * @param {{ left: number, width: number }} item retângulo do item
 * @param {number} scrollLeft rolagem atual
 * @param {number} maxScrollLeft `scrollWidth - clientWidth`
 */
export function centeredScrollLeft(container, item, scrollLeft, maxScrollLeft) {
  const itemCenter = item.left - container.left + scrollLeft + item.width / 2;
  const target = itemCenter - container.width / 2;
  return Math.max(0, Math.min(target, Math.max(0, maxScrollLeft)));
}

/**
 * A nova rolagem que deixa um item inteiro à vista, com uma folga até as bordas, presa entre 0 e o máximo.
 * @param {{ left: number, width: number }} container retângulo da faixa
 * @param {{ left: number, width: number }} item retângulo do item
 * @param {number} scrollLeft rolagem atual
 * @param {number} maxScrollLeft `scrollWidth - clientWidth`
 * @param {number} [margin]
 */
export function keepInViewScrollLeft(container, item, scrollLeft, maxScrollLeft, margin = FOCUS_MARGIN) {
  const start = item.left - container.left;
  const end = start + item.width;
  let delta = 0;
  if (start < margin) delta = start - margin;
  else if (end > container.width - margin) delta = end - (container.width - margin);
  return Math.max(0, Math.min(scrollLeft + delta, Math.max(0, maxScrollLeft)));
}

/**
 * A seta: pílula h-7 w-9 como na referência, com a cor TRANSLÚCIDA derivada do on-secondary (o par on-secondary ×
 * secondary é o que a aparência já valida: o ícone e a pílula seguem qualquer paleta, nos dois modos). Pressionada,
 * enche com a primária, como os itens. O foco é um contorno de 2 px em on-secondary, fora da pílula.
 */
const ARROW =
  "mx-2 hidden h-7 w-9 shrink-0 select-none items-center justify-center self-center rounded-full border border-on-secondary/30 " +
  "bg-on-secondary/10 text-on-secondary transition-colors motion-reduce:transition-none " +
  "enabled:cursor-pointer enabled:hover:border-on-secondary/50 enabled:hover:bg-on-secondary/20 " +
  "enabled:active:bg-primary enabled:active:text-on-primary disabled:pointer-events-none disabled:opacity-40 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-secondary sm:flex";

/**
 * O item (a referência: `flex min-w-[132px] flex-none items-center justify-center px-5 py-2 text-sm font-semibold`):
 * cantos retos, sem borda, sem anel, o mesmo tamanho em todos os estados (sem salto). O <li> estica até a altura da
 * barra e o <a> o preenche; o foco leva um contorno INTERNO (outline-offset negativo, em on-primary), sem a sombra
 * externa do foco global (o overflow a cortaria).
 */
const ITEM =
  "flex min-w-32 flex-1 items-center justify-center px-5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none " +
  "focus-visible:bg-primary focus-visible:text-on-primary focus-visible:shadow-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-primary";
const ITEM_ACTIVE = `${ITEM} bg-primary text-on-primary underline decoration-2 underline-offset-4`;
// Repouso: text-on-secondary/70 como na referência (text-foreground/70); medido >= 7:1 sobre a barra nos dois modos.
const ITEM_IDLE = `${ITEM} text-on-secondary/70 hover:bg-primary hover:text-on-primary`;

/**
 * @param {object} props
 * @param {import("./Navbar").NavbarItem[]} props.items coleções raiz publicadas (`navItemsOf`); sem elas, nada
 *   é desenhado (a `Navbar` já não monta a barra)
 */
export function NavbarCollections({ items }) {
  const listRef = useRef(/** @type {HTMLUListElement | null} */ (null));
  const holdRef = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const cancelClickRef = useRef(false);
  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, scrollLeft: 0, moved: false });
  const firstCenteringRef = useRef(true);
  // Qual seta tem o foco (-1 esquerda, 1 direita, 0 nenhuma): se ela ficar `disabled` na ponta, o navegador solta o
  // foco no <body>; o efeito abaixo o devolve ao vizinho dela na ordem de Tab.
  const arrowFocusRef = useRef(/** @type {-1 | 0 | 1} */ (0));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(max > 1 && node.scrollLeft < max - 1);
  }, []);

  // O estado das setas acompanha a rolagem e as medidas. Com ResizeObserver a medida inicial vem do próprio
  // observador (depois do layout, sem forçá-lo na hidratação); sem ele (jsdom) mede na hora e na janela. A
  // fonte que termina de carregar muda a largura dos itens sem mudar a da faixa: mede de novo quando ela chega.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    node.addEventListener("scroll", updateScrollState, { passive: true });
    /** @type {ResizeObserver | null} */
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(updateScrollState);
      observer.observe(node);
    } else {
      updateScrollState();
      window.addEventListener("resize", updateScrollState);
    }
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) updateScrollState();
    });
    return () => {
      alive = false;
      node.removeEventListener("scroll", updateScrollState);
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [items, updateScrollState]);

  // A roda vira rolagem horizontal SÓ quando a faixa tem o que rolar naquele sentido: nas pontas e sem
  // overflow o evento passa (a página rola). O gesto horizontal do trackpad segue o nativo.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    /** @param {WheelEvent} event */
    const onWheel = (event) => {
      if (event.ctrlKey || event.defaultPrevented) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const delta = event.deltaY;
      const max = node.scrollWidth - node.clientWidth;
      if (max <= 1) return;
      if (delta < 0 && node.scrollLeft <= 0) return;
      if (delta > 0 && node.scrollLeft >= max - 1) return;
      event.preventDefault();
      node.scrollLeft += delta;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // O item ativo, centralizado ao entrar (depois da hidratação, sem animação na primeira vez; depois, suave, salvo o
  // movimento reduzido).
  const currentHref = items.find((item) => item.current)?.href ?? null;
  useEffect(() => {
    const node = listRef.current;
    const active = node?.querySelector('a[aria-current="page"]');
    if (!node || !active) return;
    const left = centeredScrollLeft(node.getBoundingClientRect(), active.getBoundingClientRect(), node.scrollLeft, node.scrollWidth - node.clientWidth);
    const first = firstCenteringRef.current;
    firstCenteringRef.current = false;
    if (typeof node.scrollTo === "function") node.scrollTo({ left, behavior: first ? "auto" : scrollBehavior() });
    else node.scrollLeft = left;
    updateScrollState();
  }, [currentHref, updateScrollState]);

  // A seta que tem o foco e fica desativada (chegou na ponta pelo teclado) não pode deixar o foco se perder: ele vai
  // para o link vizinho na ordem de Tab (o último, para a seta da direita; o primeiro, para a da esquerda).
  useEffect(() => {
    const side = arrowFocusRef.current;
    if (side === 0) return;
    const disabledNow = side < 0 ? !canScrollLeft : !canScrollRight;
    if (!disabledNow) return;
    arrowFocusRef.current = 0;
    const links = listRef.current?.querySelectorAll("a");
    if (!links || links.length === 0) return;
    (side < 0 ? links[0] : links[links.length - 1]).focus();
  }, [canScrollLeft, canScrollRight]);

  const stopHold = useCallback(() => {
    if (holdRef.current !== null) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
  }, []);
  useEffect(() => stopHold, [stopHold]);

  // O foco por teclado leva o item à vista COM uma folga até as bordas (a rolagem nativa só o põe à vista, e o
  // esmaecimento cobriria a ponta dele). O clique do mouse não rola a faixa por isso.
  const keepInView = (/** @type {import("react").FocusEvent<HTMLUListElement>} */ event) => {
    const node = listRef.current;
    const target = event.target;
    if (!node || !(target instanceof HTMLElement) || target.tagName !== "A") return;
    try {
      if (!target.matches(":focus-visible")) return;
    } catch {
      // Sem :focus-visible: trata como teclado.
    }
    const left = keepInViewScrollLeft(node.getBoundingClientRect(), target.getBoundingClientRect(), node.scrollLeft, node.scrollWidth - node.clientWidth);
    if (Math.abs(left - node.scrollLeft) < 1) return;
    if (typeof node.scrollTo === "function") node.scrollTo({ left, behavior: "auto" });
    else node.scrollLeft = left;
  };

  /** Um passo na direção (-1 esquerda, 1 direita): 60% da largura visível. Devolve se ainda havia o que rolar. */
  const step = useCallback((/** @type {-1 | 1} */ direction) => {
    const node = listRef.current;
    if (!node) return false;
    const max = node.scrollWidth - node.clientWidth;
    if ((direction < 0 && node.scrollLeft <= 0) || (direction > 0 && node.scrollLeft >= max - 1)) return false;
    const amount = Math.max(120, Math.round(node.clientWidth * 0.6));
    if (typeof node.scrollBy === "function") node.scrollBy({ left: direction * amount, behavior: scrollBehavior() });
    else node.scrollLeft += direction * amount;
    return true;
  }, []);

  /** Mouse ou caneta pressionados: um passo agora e a repetição até soltar (o toque usa o clique). */
  const onArrowPointerDown = (/** @type {import("react").PointerEvent<HTMLButtonElement>} */ event, /** @type {-1 | 1} */ direction) => {
    if (event.button !== 0 || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    event.preventDefault();
    cancelClickRef.current = true;
    stopHold();
    step(direction);
    holdRef.current = setInterval(() => {
      if (!step(direction)) stopHold();
    }, HOLD_INTERVAL);
  };
  const onArrowPointerEnd = () => {
    stopHold();
    afterClick(() => {
      cancelClickRef.current = false;
    });
  };
  const onArrowClick = (/** @type {-1 | 1} */ direction) => {
    // O clique que segue o pressionar do mouse já foi dado (o passo e a repetição); o do teclado e o do toque
    // chegam sem o ponteiro e passam.
    if (cancelClickRef.current) return;
    step(direction);
  };

  // Arrastar (mouse e caneta): acima do limiar rola a faixa e cancela o clique do link; o toque é do nativo.
  const onPointerDown = (/** @type {import("react").PointerEvent<HTMLUListElement>} */ event) => {
    if (event.button !== 0 || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    const node = listRef.current;
    if (!node) return;
    cancelClickRef.current = false;
    dragRef.current = { active: true, pointerId: event.pointerId, startX: event.clientX, scrollLeft: node.scrollLeft, moved: false };
  };
  const onPointerMove = (/** @type {import("react").PointerEvent<HTMLUListElement>} */ event) => {
    const state = dragRef.current;
    const node = listRef.current;
    if (!state.active || !node) return;
    const delta = event.clientX - state.startX;
    if (!state.moved && Math.abs(delta) > DRAG_THRESHOLD) {
      state.moved = true;
      cancelClickRef.current = true;
      try {
        node.setPointerCapture(state.pointerId);
      } catch {
        // O ponteiro já terminou: segue sem captura.
      }
      node.dataset.dragging = "true";
    }
    if (state.moved) node.scrollLeft = state.scrollLeft - delta;
  };
  const endDrag = () => {
    const state = dragRef.current;
    const node = listRef.current;
    if (!state.active || !node) return;
    if (state.moved) {
      try {
        if (node.hasPointerCapture(state.pointerId)) node.releasePointerCapture(state.pointerId);
      } catch {
        // Sem captura a soltar.
      }
    }
    dragRef.current = { active: false, pointerId: -1, startX: 0, scrollLeft: 0, moved: false };
    delete node.dataset.dragging;
    updateScrollState();
    // O clique vem logo depois de soltar: a trava só cai depois dele.
    afterClick(() => {
      cancelClickRef.current = false;
    });
  };

  return (
    <nav aria-label="Coleções">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label="Rolar as coleções para a esquerda"
          disabled={!canScrollLeft}
          className={ARROW}
          onFocus={() => {
            arrowFocusRef.current = -1;
          }}
          onBlur={() => {
            if (arrowFocusRef.current === -1) arrowFocusRef.current = 0;
          }}
          onPointerDown={(event) => onArrowPointerDown(event, -1)}
          onPointerUp={onArrowPointerEnd}
          onPointerLeave={onArrowPointerEnd}
          onPointerCancel={onArrowPointerEnd}
          onClick={() => onArrowClick(-1)}
        >
          <ChevronRightIcon className="size-4 -scale-x-100" />
        </button>
        <ul
          ref={listRef}
          className="vitrine-sem-barra flex min-w-0 flex-1 flex-nowrap items-stretch overflow-x-auto overflow-y-hidden cursor-grab touch-pan-x touch-pan-y select-none data-[dragging=true]:cursor-grabbing"
          onFocus={keepInView}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={(event) => {
            if (cancelClickRef.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {items.map((item) => (
            <li key={item.id} className="flex max-w-64 shrink-0">
              <Link
                href={item.href}
                title={item.label}
                aria-current={item.current ? "page" : undefined}
                draggable={false}
                className={item.current ? ITEM_ACTIVE : ITEM_IDLE}
              >
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-label="Rolar as coleções para a direita"
          disabled={!canScrollRight}
          className={ARROW}
          onFocus={() => {
            arrowFocusRef.current = 1;
          }}
          onBlur={() => {
            if (arrowFocusRef.current === 1) arrowFocusRef.current = 0;
          }}
          onPointerDown={(event) => onArrowPointerDown(event, 1)}
          onPointerUp={onArrowPointerEnd}
          onPointerLeave={onArrowPointerEnd}
          onPointerCancel={onArrowPointerEnd}
          onClick={() => onArrowClick(1)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </nav>
  );
}
