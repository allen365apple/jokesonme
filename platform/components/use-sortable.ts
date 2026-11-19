// 最後更新：2026-11-19 15:09
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：新增工具箱的拖曳排序 hook：只從把手拖、pointer capture、只認一個指標、版面中點算落點、落點線、Escape 取消、方向鍵移一格、減少動態時不做動畫。
//
// 單欄（垂直）清單的拖曳排序（change tools-directory「Pointer-based drag with keyboard fallback」，
// 做法照 modern-web-guidance 的 drag-and-drop 指南）。只在瀏覽器用。
// - 呼叫端建立清單容器的 ref 傳進來（CSS 要 position: relative），每個項目是容器的直接子元素並帶 data-sort-id。
// - 把手是 <button>，帶 data-sort-handle（id）、data-sort-label（名稱）並接上回傳的事件；touch-action: none 只套在把手（.sort-handle）。
// - 拖曳中只改 DOM 樣式（項目跟著指標 translate、清單上的落點線），其他項目不動；
//   放開時才呼叫 onReorder(新的整份 id 順序)，由 React state 重排（不直接搬 DOM），再用 FLIP 動畫補位移。
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { dropSlot, moveItem, slotToIndex } from "@/lib/reorder";

type Options = {
  /** 清單容器（呼叫端建立的 ref，掛在 position: relative 的容器上）。 */
  listRef: RefObject<HTMLElement | null>;
  /** 目前順序的 id（用來在順序改變後補動畫與焦點）。 */
  ids: string[];
  /** 新的整份順序；movedId 是被移動的項目。 */
  onReorder: (ids: string[], movedId: string) => void;
  /** 給螢幕閱讀器的訊息（polite live region）。 */
  announce: (message: string) => void;
};

type Drag = {
  id: string;
  name: string;
  from: number;
  slot: number;
  pointerId: number;
  handle: HTMLElement;
  item: HTMLElement;
  startY: number;
  startScroll: number;
  lastY: number;
  lastT: number;
  raf: number;
  stop: () => void;
};

type Snapshot = { rects: Map<string, DOMRect>; scrollY: number };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSortable({ listRef, ids, onReorder, announce }: Options) {
  const drag = useRef<Drag | null>(null);
  const pendingFlip = useRef<Snapshot | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const latest = useRef({ onReorder, announce });
  useLayoutEffect(() => {
    latest.current = { onReorder, announce };
  });

  function items(): HTMLElement[] {
    const list = listRef.current;
    if (!list) return [];
    return Array.from(list.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.sortId);
  }

  function snapshot(): Snapshot {
    const rects = new Map<string, DOMRect>();
    for (const el of items()) rects.set(el.dataset.sortId!, el.getBoundingClientRect());
    return { rects, scrollY: window.scrollY };
  }

  /** FLIP：從舊位置動畫回到新位置（位置用文件座標，捲動過也對得上）。 */
  function animateFrom(snap: Snapshot) {
    if (reducedMotion()) return;
    const scrollDelta = window.scrollY - snap.scrollY;
    for (const el of items()) {
      const old = snap.rects.get(el.dataset.sortId!);
      if (!old) continue;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - (now.top + scrollDelta);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      el.dataset.settling = "";
      const anim = el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
        duration: 200,
        easing: "cubic-bezier(.2,.7,.3,1)",
      });
      const done = () => {
        if (drag.current?.item !== el) delete el.dataset.settling;
      };
      anim.addEventListener("finish", done);
      anim.addEventListener("cancel", done);
    }
  }

  function clearMarker() {
    const list = listRef.current;
    if (!list) return;
    delete list.dataset.drop;
    for (const p of ["--drop-x", "--drop-y", "--drop-w"]) list.style.removeProperty(p);
  }

  /** 依指標位置更新：項目跟著指標、用版面中點算落點、畫落點線（落點是原位就不畫）。 */
  function update(clientY: number) {
    const d = drag.current;
    const list = listRef.current;
    if (!d || !list) return;
    d.lastY = clientY;
    d.item.style.translate = `0 ${clientY - d.startY + (window.scrollY - d.startScroll)}px`;

    const els = items();
    const box = list.getBoundingClientRect();
    const pointer = Math.min(Math.max(clientY - box.top - list.clientTop + list.scrollTop, 0), list.scrollHeight);
    d.slot = dropSlot(els.map((el) => el.offsetTop + el.offsetHeight / 2), pointer);

    if (slotToIndex(d.from, d.slot) === d.from) {
      clearMarker();
      return;
    }
    const prev = els[d.slot - 1]?.getBoundingClientRect();
    const next = els[d.slot]?.getBoundingClientRect();
    const y = prev && next ? (prev.bottom + next.top) / 2 : next ? next.top - 6 : prev ? prev.bottom + 6 : box.top;
    list.style.setProperty("--drop-x", `${box.left}px`);
    list.style.setProperty("--drop-y", `${y}px`);
    list.style.setProperty("--drop-w", `${box.width}px`);
    list.dataset.drop = "";
  }

  /** 結束拖曳。commit＝放開（照落點移動）；否則取消（回原位）。所有結束路徑都走這裡。 */
  function end(commit: boolean) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.stop();
    const snap = snapshot(); // 含被拖項目目前（還帶 translate）的位置，放開後從這裡動畫到新位置
    d.item.style.translate = "";
    delete d.item.dataset.dragging;
    clearMarker();
    document.documentElement.classList.remove("is-sorting");
    if (d.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);

    const to = commit ? slotToIndex(d.from, d.slot) : d.from;
    if (to !== d.from) {
      const order = moveItem(items().map((el) => el.dataset.sortId!), d.from, to);
      pendingFlip.current = snap;
      latest.current.onReorder(order, d.id);
      latest.current.announce(`「${d.name}」已移到第 ${to + 1} 個`);
    } else {
      animateFrom(snap);
      if (!commit) latest.current.announce(`已取消移動「${d.name}」`);
    }
  }

  function onPointerDown(e: PointerEvent<HTMLElement>, id: string, name: string) {
    if (drag.current || e.button !== 0 || !e.isPrimary) return;
    const els = items();
    const from = els.findIndex((el) => el.dataset.sortId === id);
    if (from < 0) return;
    const handle = e.currentTarget;
    const item = els[from];
    handle.setPointerCapture(e.pointerId);

    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        end(false);
      }
    };
    const onScroll = () => {
      if (drag.current) update(drag.current.lastY);
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, { passive: true });

    const d: Drag = {
      id, name, from, slot: from, pointerId: e.pointerId, handle, item,
      startY: e.clientY, startScroll: window.scrollY, lastY: e.clientY, lastT: 0, raf: 0,
      stop: () => {
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("scroll", onScroll);
        cancelAnimationFrame(d.raf);
      },
    };
    drag.current = d;
    item.getAnimations().forEach((a) => a.finish());
    item.dataset.dragging = "";
    document.documentElement.classList.add("is-sorting");

    // 指標靠近視窗上下緣時捲動頁面，讓畫面外的位置也拖得到；速度隨深入邊緣的程度增加。
    const step = (t: number) => {
      const cur = drag.current;
      if (cur !== d) return;
      const dt = cur.lastT ? Math.min(t - cur.lastT, 50) : 16;
      cur.lastT = t;
      const zone = Math.min(Math.max(item.offsetHeight, 48), window.innerHeight / 3);
      let v = 0;
      if (cur.lastY < zone) v = -(zone - cur.lastY) / zone;
      else if (cur.lastY > window.innerHeight - zone) v = (cur.lastY - (window.innerHeight - zone)) / zone;
      v = Math.max(-2, Math.min(2, v));
      if (v !== 0) window.scrollBy(0, (v * 900 * dt) / 1000);
      cur.raf = requestAnimationFrame(step);
    };
    d.raf = requestAnimationFrame(step);
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== e.pointerId) return;
    update(e.clientY);
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== e.pointerId) return;
    update(e.clientY);
    end(true);
  }

  function onPointerCancel(e: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== e.pointerId) return;
    end(false);
  }

  /** 鍵盤：把手聚焦時上下鍵移一格，焦點留在把手。 */
  function onKeyDown(e: KeyboardEvent<HTMLElement>, id: string, name: string) {
    if (drag.current || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const order = items().map((el) => el.dataset.sortId!);
    const from = order.indexOf(id);
    const to = from + (e.key === "ArrowUp" ? -1 : 1);
    if (from < 0 || to < 0 || to >= order.length) return;
    pendingFlip.current = snapshot();
    pendingFocus.current = id;
    latest.current.onReorder(moveItem(order, from, to), id);
    latest.current.announce(`「${name}」已移到第 ${to + 1} 個`);
  }

  // 順序改變後（React 已重排 DOM）：先把焦點放回把手、把項目捲進畫面，再做 FLIP 動畫。
  const orderKey = ids.join(",");
  useLayoutEffect(() => {
    const focusId = pendingFocus.current;
    pendingFocus.current = null;
    if (focusId) {
      const item = items().find((el) => el.dataset.sortId === focusId);
      const handle = item?.querySelector<HTMLElement>(`[data-sort-handle="${focusId}"]`);
      item?.scrollIntoView({ block: "nearest", inline: "nearest" });
      handle?.focus({ preventScroll: true });
    }
    const snap = pendingFlip.current;
    pendingFlip.current = null;
    if (snap) animateFrom(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在順序改變時跑；其餘都是 ref 與 DOM
  }, [orderKey]);

  // 卸載（例如離開編輯模式）時結束進行中的拖曳。
  const endRef = useRef(end);
  useLayoutEffect(() => {
    endRef.current = end;
  });
  useEffect(() => () => endRef.current(false), []);

  /** 把手要帶 data-sort-handle（項目 id）與 data-sort-label（項目名稱，朗讀用）。 */
  function handleOf(e: { currentTarget: HTMLElement }): { id: string; name: string } | null {
    const id = e.currentTarget.dataset.sortHandle;
    return id ? { id, name: e.currentTarget.dataset.sortLabel ?? "" } : null;
  }

  function onHandlePointerDown(e: PointerEvent<HTMLElement>) {
    const h = handleOf(e);
    if (h) onPointerDown(e, h.id, h.name);
  }

  function onHandleKeyDown(e: KeyboardEvent<HTMLElement>) {
    const h = handleOf(e);
    if (h) onKeyDown(e, h.id, h.name);
  }

  return {
    onPointerDown: onHandlePointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown: onHandleKeyDown,
  };
}
