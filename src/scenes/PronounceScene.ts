// 선고 연출: 주문 문장을 박자 간격으로 표시 → 도장 "탁"(화면 흔들림 + 도장 사각형) → 내면의 법봉 3타(화면 플래시 3회).
// 연출 전용(엔진 상태 불변). 끝나면 FINISH_PRONOUNCE. [건너뛰기]는 DOM 오버레이가 같은 액션을 보낸다.
// 효과음은 키만 둔다(로드된 오디오가 없으면 무음).
import Phaser from 'phaser';
import type { Controller } from '../game/controller';
import { assembleJudgment } from '../engine/judgment';
import { FONT_STACK } from './seats';

export const SFX = { stamp: 'sfx-stamp', gavel: 'sfx-gavel' } as const;
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

    this.add.rectangle(640, 360, 1280, 720, 0x0d0a08, 0.9);
    // 판결서 종이
    this.add.rectangle(640, 330, 860, 440, 0xefe6d2).setStrokeStyle(4, 0x1d1611);
    this.add.text(640, 150, '판   결', { fontFamily: FONT_STACK, fontSize: '30px', color: '#2a2118' }).setOrigin(0.5);

    const style = { fontFamily: FONT_STACK, fontSize: '22px', color: '#2a2118', wordWrap: { width: 760, useAdvancedWrap: true } };
    let y = 210;
    const t0 = 400;
    lines.forEach((text, i) => {
      const t = this.add.text(240, y, text, style).setAlpha(0);
      y += t.height + 14;
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
    this.sfx(SFX.stamp);
    this.cameras.main.shake(180, 0.008);
    const box = this.add.container(930, 470).setAngle(-8);
    box.add(this.add.rectangle(0, 0, 96, 96).setStrokeStyle(6, 0xb0302a));
    box.add(this.add.text(0, 0, '판사', { fontFamily: FONT_STACK, fontSize: '28px', color: '#b0302a', align: 'center' }).setOrigin(0.5));
    box.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 120, ease: 'Quad.easeIn' });
  }

  private gavel(): void {
    this.sfx(SFX.gavel);
    this.cameras.main.flash(140, 255, 248, 230);
  }

  private sfx(key: string): void {
    if (this.cache.audio.exists(key)) this.sound.play(key);
  }
}
