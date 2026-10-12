"use client";

// A barra de coleções do cabeçalho do espaço (P-026; RF13, RNF05, RNF06): UMA só linha, de altura fixa, rolável
// na horizontal. Os links são <a> dentro de <ul>/<li>, em <nav aria-label="Coleções">: são NAVEGAÇÃO, não abas
// (sem role=tab). Eles já vêm no HTML do servidor: a página estática e o leitor sem JavaScript veem os links e
// rolam a faixa pela rolagem nativa; o JavaScript só ACRESCENTA as setas, o arrastar com o ponteiro, a roda do
// mouse e o item ativo centralizado ao entrar (a ideia do SectionTabs do outro projeto do autor, sem o resto).
//
// - As duas setas ocupam o lugar desde o servidor (desativadas, `hidden sm:flex`): a hidratação não mexe em
//   nada (CLS 0). Abaixo de `sm` não há setas: o toque e o arrastar bastam. São <button> com nome, `disabled`
//   nas pontas (saem da ordem de Tab); pressionadas com o mouse, repetem o passo até soltar.
// - A roda só vira rolagem horizontal quando há o que rolar NAQUELE sentido; nas pontas, e sem overflow, o
//   evento passa e a página rola. Gesto horizontal do trackpad e o toque seguem o nativo.
// - Arrastar com mouse ou caneta, acima de um limiar de 4 px, rola a faixa e NÃO dispara o clique do link.
// - Teclado: todos os links ficam na ordem de Tab, e o foco traz o item à vista: a rolagem nativa do foco, mais
//   um ajuste que deixa uma folga para o esmaecimento das bordas (`keepInView`; o `scroll-padding` do CSS não
//   serve: o Chromium deixa o ÚLTIMO item parcialmente escondido, porque a folga não é alcançável na ponta).
// - Movimento reduzido: nada de rolagem suave (o comportamento vale `auto`).
// - Sem barra de rolagem visível (`.vitrine-sem-barra`), mas com a pista de que há mais: as setas ativas e um
//   esmaecimento (`bg-secondary`) na borda que tem mais conteúdo.
// - O realce é do tema do dono (tokens): o item ativo (`aria-current`) leva `bg-primary text-on-primary`, o
//   negrito e o sublinhado grosso (não só a cor, WCAG 1.4.1); os demais enchem do mesmo modo no hover e no foco
//   por Tab, com um anel interno (pista que não depende da cor, caso a primária seja parecida com a barra).
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";

/** Quanto o arrastar precisa andar (px) para deixar de ser um clique. */
export const DRAG_THRESHOLD = 4;
/** Intervalo (ms) em que a seta pressionada repete o passo. */
export const HOLD_INTERVAL = 160;
/** Folga (px) que o item focado por teclado deixa até a borda da faixa: maior que o esmaecimento (w-6, 24 px). */
export const FOCUS_MARGIN = 28;

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

const ARROW =
  "hidden size-9 shrink-0 items-center justify-center rounded-md border border-on-secondary/40 text-on-secondary " +
  "select-none transition-colors enabled:cursor-pointer enabled:hover:bg-on-secondary enabled:hover:text-secondary " +
  "disabled:opacity-40 sm:flex";

const FADE =
  "pointer-events-none absolute inset-y-0 z-10 w-6 transition-opacity motion-reduce:transition-none from-secondary to-transparent";

/** Altura e forma de todos os itens: iguais em repouso, no hover, no foco e no ativo (sem salto). */
const ITEM = "block h-10 max-w-64 truncate rounded-md px-3 text-sm leading-10 whitespace-nowrap transition-colors motion-reduce:transition-none";
const ITEM_ACTIVE = `${ITEM} bg-primary font-semibold text-on-primary underline decoration-2 underline-offset-4`;
const ITEM_IDLE =
  `${ITEM} font-medium hover:bg-primary hover:text-on-primary hover:ring-1 hover:ring-on-secondary/60 hover:ring-inset ` +
  "focus-visible:bg-primary focus-visible:text-on-primary focus-visible:ring-1 focus-visible:ring-on-secondary/60 focus-visible:ring-inset";

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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(max > 1 && node.scrollLeft < max - 1);
  }, []);

  // O estado das setas e do esmaecimento acompanha a rolagem e as medidas (a janela, a fonte e os itens mudam).
  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    updateScrollState();
    node.addEventListener("scroll", updateScrollState, { passive: true });
    /** @type {ResizeObserver | null} */
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(updateScrollState);
      observer.observe(node);
      for (const child of node.children) observer.observe(child);
    } else {
      window.addEventListener("resize", updateScrollState);
    }
    return () => {
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

  // O item ativo, centralizado ao entrar (antes da pintura, sem animação na primeira vez; depois, suave, salvo o
  // movimento reduzido).
  const currentHref = items.find((item) => item.current)?.href ?? null;
  useLayoutEffect(() => {
    const node = listRef.current;
    const active = node?.querySelector('a[aria-current="page"]');
    if (!node || !active) return;
    const left = centeredScrollLeft(node.getBoundingClientRect(), active.getBoundingClientRect(), node.scrollLeft, node.scrollWidth - node.clientWidth);
    const first = firstCenteringRef.current;
    firstCenteringRef.current = false;
    if (typeof node.scrollTo === "function") node.scrollTo({ left, behavior: first ? "auto" : scrollBehavior() });
    else node.scrollLeft = left;
  }, [currentHref]);

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
    <nav aria-label="Coleções" className="px-4 pb-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Rolar as coleções para a esquerda"
          disabled={!canScrollLeft}
          className={ARROW}
          onPointerDown={(event) => onArrowPointerDown(event, -1)}
          onPointerUp={onArrowPointerEnd}
          onPointerLeave={onArrowPointerEnd}
          onPointerCancel={onArrowPointerEnd}
          onClick={() => onArrowClick(-1)}
        >
          <ChevronRightIcon className="size-4 -scale-x-100" />
        </button>
        <div className="relative min-w-0 flex-1">
          <ul
            ref={listRef}
            className="vitrine-sem-barra flex flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden p-1 cursor-grab touch-pan-x touch-pan-y select-none data-[dragging=true]:cursor-grabbing"
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
              <li key={item.id} className="shrink-0">
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={item.current ? "page" : undefined}
                  draggable={false}
                  className={item.current ? ITEM_ACTIVE : ITEM_IDLE}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <span aria-hidden="true" data-fade="left" className={`${FADE} left-0 bg-linear-to-r ${canScrollLeft ? "opacity-100" : "opacity-0"}`} />
          <span aria-hidden="true" data-fade="right" className={`${FADE} right-0 bg-linear-to-l ${canScrollRight ? "opacity-100" : "opacity-0"}`} />
        </div>
        <button
          type="button"
          aria-label="Rolar as coleções para a direita"
          disabled={!canScrollRight}
          className={ARROW}
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
