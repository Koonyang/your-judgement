// 끌어다 놓기(Pointer Events). 4px 넘게 움직여야 드래그로 본다. 밖에 놓으면 아무 일 없다(outside가 있으면 그것만).
// select: true인 source는 클릭하면 선택되고, 선택된 상태에서 target을 클릭해도 놓은 것으로 친다(드래그가 어려운 경우의 대안).
const SCALE = 2; // #ui-root transform: scale(2)

type SourceOpts = { select?: boolean; outside?: () => void };

export function createDnd(): {
  source(el: HTMLElement, payload: string, opts?: SourceOpts): void;
  target(el: HTMLElement, onDrop: (payload: string) => void): void;
  clear(): void;
} {
  const targets = new WeakMap<Element, (p: string) => void>();
  let selected: { el: HTMLElement; payload: string } | null = null;

  const clear = () => {
    selected?.el.classList.remove('selected');
    selected = null;
  };
  const targetAt = (x: number, y: number): ((p: string) => void) | null => {
    for (let n = document.elementFromPoint(x, y); n; n = n.parentElement) {
      const f = targets.get(n);
      if (f) return f;
    }
    return null;
  };

  return {
    clear,
    target(el, onDrop) {
      targets.set(el, onDrop);
      el.classList.add('drop-target');
      el.addEventListener('click', (e) => {
        if (!selected) return;
        e.stopPropagation();
        const p = selected.payload;
        clear();
        onDrop(p);
      });
    },
    source(el, payload, opts = {}) {
      el.classList.add('drag-source');
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', (down) => {
        if (down.button !== 0) return;
        const sx = down.clientX;
        const sy = down.clientY;
        let ghost: HTMLElement | null = null;
        let dx = 0;
        let dy = 0;
        const move = (e: PointerEvent) => {
          if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
          if (!ghost) {
            const r = el.getBoundingClientRect();
            ghost = el.cloneNode(true) as HTMLElement;
            Object.assign(ghost.style, {
              position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${el.offsetWidth}px`, margin: '0',
              transform: `scale(${SCALE})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: '1000', opacity: '0.85',
            });
            ghost.classList.add('ghost');
            ghost.style.font = getComputedStyle(el).font; // body로 옮기면 #ui-root 글꼴을 잃는다
            document.body.append(ghost);
            el.classList.add('dragging');
            dx = sx - r.left;
            dy = sy - r.top;
          }
          ghost.style.left = `${e.clientX - dx}px`;
          ghost.style.top = `${e.clientY - dy}px`;
        };
        const up = (e: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (!ghost) return; // 클릭: click 이벤트가 처리
          ghost.remove();
          el.classList.remove('dragging');
          // 드래그 뒤 따라오는 click은 무시한다(칩 토글 등이 다시 눌리지 않게).
          const eat = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
          window.addEventListener('click', eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0); // click이 안 오면 남지 않게
          const drop = targetAt(e.clientX, e.clientY);
          clear();
          if (drop) drop(payload);
          else opts.outside?.();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      if (opts.select) {
        el.addEventListener('click', () => {
          if (selected?.el === el) return clear();
          clear();
          selected = { el, payload };
          el.classList.add('selected');
        });
      }
    },
  };
}
