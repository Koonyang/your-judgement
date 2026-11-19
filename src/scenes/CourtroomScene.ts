// 법정 장면: 좌석 플레이스홀더를 그리고 현재 화자 자리를 강조한다. 상태는 컨트롤러 구독으로 받는다.
import Phaser from 'phaser';
import type { Controller } from '../game/controller';
import type { GameState } from '../engine/state';
import { FONT_STACK, SEATS, SPRITE_H, SPRITE_W, type SeatKey } from './seats';

const COURT_PHASES = new Set<GameState['phase']>(['opening', 'evidence', 'exam', 'closing']);

export class CourtroomScene extends Phaser.Scene {
  private actors = new Map<SeatKey, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private glow!: Phaser.GameObjects.Rectangle;
  private dim!: Phaser.GameObjects.Rectangle;
  private bob?: Phaser.Tweens.Tween;
  private unsubscribe?: () => void;
  private lastPhase: GameState['phase'] | null = null;

  constructor() {
    super('court');
  }

  create(): void {
    const c = this.registry.get('controller') as Controller;
    this.drawRoom();
    this.glow = this.add.rectangle(0, 0, SPRITE_W + 12, SPRITE_H + 12).setStrokeStyle(3, 0xf2d27a).setVisible(false);
    for (const key of Object.keys(SEATS) as SeatKey[]) {
      const seat = SEATS[key];
      const img = this.add.image(seat.x, seat.y, key);
      // 법대 뒤 재판장은 이름표를 옆에 둔다(아래는 법대에 가려진다).
      const [lx, ly, ox, oy] = seat.labelSide
        ? [seat.x + SPRITE_W / 2 + 10, seat.y - 10, 0, 0.5]
        : [seat.x, seat.y + SPRITE_H / 2 + 22, 0.5, 0];
      const label = this.add
        .text(lx, ly, seat.label, { fontFamily: FONT_STACK, fontSize: '15px', color: '#f3ead6' })
        .setOrigin(ox, oy)
        .setBackgroundColor('#1d1611')
        .setPadding(4, 2, 4, 2);
      this.actors.set(key, { img, label });
    }
    this.drawDesks();
    this.dim = this.add.rectangle(640, 360, 1280, 720, 0x0d0a08, 0.72).setDepth(10);
    this.unsubscribe = c.subscribe(() => this.sync(c));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.sync(c);
  }

  private drawRoom(): void {
    this.add.rectangle(640, 150, 1280, 300, 0x3b2819); // 뒷벽 (나무 판넬)
    for (let x = 40; x < 1280; x += 80) this.add.rectangle(x, 150, 4, 300, 0x2e1f13);
    this.add.rectangle(640, 510, 1280, 420, 0x5b4632); // 바닥
    for (let y = 320; y < 720; y += 40) this.add.rectangle(640, y, 1280, 2, 0x4c3a29);
  }

  private drawDesks(): void {
    const desk = (x: number, y: number, w: number, h: number, color = 0x6b4a2e) =>
      this.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0x24170d);
    desk(640, 176, 760, 40, 0x4e341f); // 법대
    desk(640, 270, 220, 22); // 참여관석
    desk(230, 372, 220, 26); // 검사석
    desk(1065, 372, 260, 26); // 변호인·피고인석
    desk(640, 444, 120, 24, 0x7a5a3a); // 증언대
  }

  private sync(c: Controller): void {
    const s = c.state;
    const exam = c.currentExam();
    // 피고인신문 때는 피고인이 증언대로 나온다.
    const defendantAtStand = exam?.kind === 'defendant';
    const visible: Record<SeatKey, boolean> = {
      judge: true, clerk: true, prosecutor: true, defense: true,
      defendant: !defendantAtStand,
      witness: exam !== null,
    };
    for (const [key, a] of this.actors) {
      a.img.setVisible(visible[key]);
      a.label.setVisible(visible[key]);
    }
    const w = this.actors.get('witness')!;
    w.label.setText(exam ? c.speakerName(exam.kind) : SEATS.witness.label);
    w.img.setTexture(defendantAtStand ? 'defendant' : 'witness');

    this.dim.setVisible(!COURT_PHASES.has(s.phase));
    // 선고 연출은 별도 장면. 끝나면(FINISH_PRONOUNCE·건너뛰기) 장면이 스스로 멈춘다.
    if (s.phase === 'pronounce' && this.lastPhase !== 'pronounce') this.scene.launch('pronounce');
    this.lastPhase = s.phase;

    const line = c.shownLine();
    let seat: SeatKey | null = line?.speaker ?? null;
    if (seat === 'defendant' && defendantAtStand) seat = 'witness';
    this.bob?.stop();
    this.actors.forEach((a, key) => a.img.setY(SEATS[key].y));
    if (!seat || !visible[seat]) {
      this.glow.setVisible(false);
      return;
    }
    const a = this.actors.get(seat)!;
    this.glow.setPosition(a.img.x, a.img.y).setVisible(true);
    this.bob = this.tweens.add({ targets: a.img, y: a.img.y - 4, duration: 180, yoyo: true, repeat: 1 });
  }
}
