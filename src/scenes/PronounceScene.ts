// 선고 연출: 주문 문장을 박자 간격으로 표시 → 도장 "탁"(화면 흔들림 + 도장 사각형) → 내면의 법봉 3타(화면 플래시 3회).
// 연출 전용(엔진 상태 불변). 끝나면 FINISH_PRONOUNCE. [건너뛰기]는 DOM 오버레이가 같은 액션을 보낸다.
// 효과음은 키만 둔다(로드된 오디오가 없으면 무음).
import Phaser from 'phaser';
import type { Controller } from '../game/controller';
import { assembleJudgment } from '../engine/judgment';
import { FONT_STACK } from './seats';
import { normalizeNickname, sealBox, sealLayout } from '../ui/seal';
import { loadNickname } from '../ui/storage';
import { play } from '../ui/audio';

/** 박자 간격(ms) */
export const BEAT_MS = 700;

export class PronounceScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  constructor() {
    super('pronounce');
  }

  create(): void {
    const c = this.registry.get('controller') as Controller;
    this.unsubscribe = c.subscribe((s) => {
      if (s.phase !== 'pronounce') this.scene.stop();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());

    const doc = assembleJudgment(c.sc, c.state);
    const lines = ['주문.', ...doc.order];
    if (doc.sentencingReasons.addendum) lines.push(`"${doc.sentencingReasons.addendum}"`);

    this.add.rectangle(320, 180, 640, 360, 0x07080a, 0.92);
    // 판결서 종이
    this.add.rectangle(320, 165, 430, 220, 0xe8dcc2).setStrokeStyle(2, 0x2a221b);
    this.add.text(320, 75, '판   결', { fontFamily: FONT_STACK, fontSize: '15px', color: '#2a221b' }).setOrigin(0.5);

    const style = { fontFamily: FONT_STACK, fontSize: '11px', color: '#2a221b', wordWrap: { width: 380, useAdvancedWrap: true } };
    let y = 105;
    const t0 = 400;
    lines.forEach((text, i) => {
      const t = this.add.text(120, y, text, style).setAlpha(0);
      y += t.height + 7;
      this.time.delayedCall(t0 + i * BEAT_MS, () => {
        this.tweens.add({ targets: t, alpha: 1, duration: 200 });
      });
    });

    const stampAt = t0 + lines.length * BEAT_MS;
    this.time.delayedCall(stampAt, () => this.stamp());
    for (let k = 0; k < 3; k++) this.time.delayedCall(stampAt + 600 + k * 400, () => this.gavel());
    this.time.delayedCall(stampAt + 600 + 3 * 400 + 600, () => c.dispatch({ type: 'FINISH_PRONOUNCE' }));
  }

  private stamp(): void {
    play('stamp');
    this.cameras.main.shake(180, 0.006);
    // 판결서 서명날인(형소법 §41 [확인필요]) 자리. 승인/거절 도장 동작이 아니라 선고 연출이다.
    const box = this.add.container(465, 235).setAngle(-8);
    const name = normalizeNickname(loadNickname());
    // 서명란: 판결서 끝의 "판사 ○○○" (닉네임이 없으면 직함만)
    this.add.text(410, 235, name ? `판사  ${name}` : '판사', { fontFamily: FONT_STACK, fontSize: '11px', color: '#2a221b' }).setOrigin(1, 0.5);
    const l = sealLayout(name);
    const b = sealBox(l, 52, 15);
    box.add(this.add.rectangle(0, 0, b.w, b.h).setStrokeStyle(3, 0xb8382e));
    for (const cell of l.cells) {
      const x = -b.w / 2 + b.pad + cell.x * b.cw, y = -b.h / 2 + b.pad + cell.y * b.cell;
      box.add(this.add.text(x, y, cell.ch, { fontFamily: FONT_STACK, fontSize: `${b.font}px`, color: '#b8382e', fontStyle: 'bold' }).setOrigin(0.5));
    }
    box.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 120, ease: 'Quad.easeIn' });
  }

  private gavel(): void {
    play('gavel');
    this.cameras.main.flash(140, 255, 196, 120);
  }
}
