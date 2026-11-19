import Phaser from 'phaser';
import raw from '../data/scenarios/ep01.json';
import { loadScenario } from './engine/scenario/load';
import { Controller } from './game/controller';
import { BootScene } from './scenes/BootScene';
import { CourtroomScene } from './scenes/CourtroomScene';
import { PronounceScene } from './scenes/PronounceScene';
import { mountOverlay } from './ui/overlay';
import './ui/style.css';

const sc = loadScenario(raw);
const controller = new Controller(sc);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  scene: [BootScene, CourtroomScene, PronounceScene],
  callbacks: { preBoot: (g) => g.registry.set('controller', controller) },
});

mountOverlay(document.getElementById('ui-root')!, controller, sc);

// 개발 중 콘솔 디버깅용.
if (import.meta.env.DEV) Object.assign(window, { game, controller });
