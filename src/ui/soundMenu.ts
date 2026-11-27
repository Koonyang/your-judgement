// 소리 설정: 화면 구석의 작은 [소리] 버튼 → 효과음·대사 소리 켜기/끄기, 글자 속도.
import { getSettings, play, setSettings } from './audio';
import { button, h } from './dom';

const SPEED_LABEL = { normal: '보통', fast: '빠르게', instant: '즉시' } as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

export function createSoundMenu(): HTMLElement {
  const menu = h('div', { class: 'sound-menu', testid: 'sound-menu' });
  menu.hidden = true;
  const paint = () => {
    const s = getSettings();
    const row = (id: string, label: string, on: boolean, flip: () => void) => {
      const b = button(`sound-${id}`, `${label}: ${on ? '켜짐' : '꺼짐'}`, () => { flip(); paint(); play('trust', 0.6); }, 'btn sm');
      b.setAttribute('aria-pressed', String(on));
      return b;
    };
    menu.replaceChildren(
      row('sfx', '효과음', s.sfx, () => setSettings({ sfx: !getSettings().sfx })),
      row('voice', '대사 소리', s.voice, () => setSettings({ voice: !getSettings().voice })),
      button('sound-speed', `글자 속도: ${SPEED_LABEL[s.speed]}`, () => {
        setSettings({ speed: SPEEDS[(SPEEDS.indexOf(getSettings().speed) + 1) % SPEEDS.length] });
        paint();
      }, 'btn sm'),
    );
  };
  const toggle = button('btn-sound', '소리', () => { menu.hidden = !menu.hidden; if (!menu.hidden) paint(); }, 'btn sm sound-btn');
  toggle.setAttribute('aria-label', '소리 설정');
  return h('div', { class: 'sound-box' }, toggle, menu);
}
