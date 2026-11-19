// 작은 DOM 헬퍼.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'testid') el.dataset.testid = v;
    else el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
}

export function button(testid: string, label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { class: cls, testid, type: 'button' }, label);
  b.addEventListener('click', onClick);
  // 마우스로 누른 버튼에 포커스가 남으면 Space/Enter가 그 버튼을 다시 누르게 되므로 푼다.
  b.addEventListener('pointerup', () => b.blur());
  return b;
}

export function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}
