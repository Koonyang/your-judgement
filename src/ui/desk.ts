// 책상(y170–290): 단계별로 놓인 서류 물건. 누르면 집어 들어 확대 보기를 연다(다시 누르면 내려놓기).
// 물건 testid는 예전 탭 testid를 그대로 쓴다(tab-docs 등).
import { h, show } from './dom';

export type DeskItem = { id: string; testid: string; label: string; kind: 'paper' | 'pile' | 'memo' | 'mic'; open: () => void; disabled?: boolean; attention?: boolean };

export function createDesk(): { el: HTMLElement; plate: HTMLElement; setItems(items: DeskItem[], openId: string | null): void } {
  const plate = h('div', { class: 'nameplate', testid: 'phase-title' });
  const row = h('div', { class: 'desk-items' });
  const el = h('div', { class: 'desk', testid: 'desk' }, plate, row);
  const made = new Map<string, HTMLButtonElement>();
  return {
    el,
    plate,
    setItems(items, openId) {
      const ids = new Set(items.map((x) => x.id));
      for (const [id, b] of made) show(b, ids.has(id));
      for (const it of items) {
        let b = made.get(it.id);
        if (!b) {
          b = h('button', { class: `desk-item ${it.kind}`, testid: it.testid, type: 'button' }, h('span', {}, it.label));
          b.addEventListener('click', () => it.open());
          b.addEventListener('pointerup', () => b!.blur());
          made.set(it.id, b);
        }
        row.append(b); // items 순서대로 다시 배치
        show(b, true);
        b.classList.toggle('lifted', it.id === openId);
        b.disabled = !!it.disabled;
        b.classList.toggle('call', !!it.attention);
        b.setAttribute('aria-label', it.label);
        b.setAttribute('aria-pressed', String(it.id === openId));
      }
    },
  };
}
