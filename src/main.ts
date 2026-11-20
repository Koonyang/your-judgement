import Phaser from 'phaser';
import raw from '../data/scenarios/ep01.json';
import { loadScenario } from './engine/scenario/load';
import { Controller } from './game/controller';
import { BootScene } from './scenes/BootScene';
import { CourtroomScene } from './scenes/CourtroomScene';
import { PronounceScene } from './scenes/PronounceScene';
import { mountOverlay } from './ui/overlay';
import './ui/style.css';
import g11 from 'galmuri/dist/Galmuri11.woff2?url';
import g11b from 'galmuri/dist/Galmuri11-Bold.woff2?url';

// 폰트를 먼저 올려야 Phaser 텍스트가 폴백 글꼴로 굳지 않는다.
for (const [src, weight] of [[g11, '400'], [g11b, '700']] as const) {
  const f = new FontFace('Galmuri11', `url(${src})`, { weight });
  document.fonts.add(await f.load());
}

const sc = loadScenario(raw);
const controller = new Controller(sc);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 360,
  zoom: 2,
  backgroundColor: '#0e0f13',
  pixelArt: true,
  scene: [BootScene, CourtroomScene, PronounceScene],
  callbacks: { preBoot: (g) => g.registry.set('controller', controller) },
});

mountOverlay(document.getElementById('ui-root')!, controller, sc);

// 개발 중 콘솔 디버깅용.
if (import.meta.env.DEV) Object.assign(window, { game, controller });
