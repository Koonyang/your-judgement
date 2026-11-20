// 법정 장면(판사 시점, 위 150px 띠): 좌석 플레이스홀더를 그리고 현재 화자만 밝힌다. 상태는 컨트롤러 구독으로 받는다.
import Phaser from 'phaser';
import type { Controller } from '../game/controller';
import type { GameState } from '../engine/state';
import { COURT_H, FONT_STACK, SEATS, SPRITE_H, type SeatKey } from './seats';

const COURT_PHASES = new Set<GameState['phase']>(['opening', 'evidence', 'exam', 'closing']);

export class CourtroomScene extends Phaser.Scene {
  private actors = new Map<SeatKey, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private glow!: Phaser.GameObjects.Ellipse;
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
    // 화자 자리에 비치는 스탠드 빛 (#ffc478)
    this.glow = this.add.ellipse(0, 0, 46, 30, 0xffc478, 0.14).setVisible(false);
    for (const key of Object.keys(SEATS) as SeatKey[]) {
      const seat = SEATS[key];
      const img = this.add.image(seat.x, seat.y, key).setScale(seat.scale ?? 1);
      // 숨쉬기: 사람마다 박자를 달리해 아주 조금 들썩인다(서류 너머로도 법정이 살아 있게).
      this.tweens.add({
        targets: img, scaleY: (seat.scale ?? 1) * 1.04, duration: 1400 + Math.random() * 900,
        delay: Math.random() * 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      const label = this.add
        .text(seat.x, seat.y + (SPRITE_H * (seat.scale ?? 1)) / 2 + 1, seat.label, { fontFamily: FONT_STACK, fontSize: '9px', color: '#8d8272' })
        .setOrigin(0.5, 0)
        .setDepth(5);
      if (seat.back) img.setDepth(4); // 참여관은 자기 책상보다 내 쪽에 앉아 등을 보인다
      this.actors.set(key, { img, label });
    }
    this.drawDesks();
    this.dim = this.add.rectangle(320, COURT_H / 2, 640, COURT_H, 0x07080a, 0.85).setDepth(10);
    this.unsubscribe = c.subscribe(() => this.sync(c));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.sync(c);
  }

  private drawRoom(): void {
    this.add.rectangle(320, 34, 640, 68, 0x0e0f13); // 뒷벽
    for (let r = 0; r < 2; r++) // 방청석 (실루엣)
      for (let x = 24 + r * 9; x < 620; x += 22) if ((x + r) % 5) this.add.rectangle(x, 34 + r * 14, 9, 9, 0x15161c);
    this.add.rectangle(320, 66, 640, 3, 0x1d1f26); // 방청석 난간
    this.add.rectangle(320, 109, 640, 82, 0x0b0c0f); // 바닥
  }

  private drawDesks(): void {
    const desk = (x: number, y: number, w: number, h: number) =>
      this.add.rectangle(x, y, w, h, 0x2a2018).setStrokeStyle(1, 0x3a2c20);
    desk(92, 112, 120, 14); // 검사석
    desk(540, 112, 120, 14); // 변호인·피고인석
    desk(320, 116, 52, 16); // 증언대
    desk(320, 128, 120, 8); // 참여관석 (법대 바로 아래, 참여관 너머)
  }

  private sync(c: Controller): void {
    const s = c.state;
    const exam = c.currentExam();
    // 피고인신문 때는 피고인이 증언대로 나온다.
    const defendantAtStand = exam?.kind === 'defendant';
    const visible: Record<SeatKey, boolean> = {
      judge: false, clerk: true, prosecutor: true, defense: true,
      defendant: !defendantAtStand,
      witness: exam !== null,
    };
    for (const [key, a] of this.actors) {
      a.img.setVisible(visible[key]);
      a.label.setVisible(visible[key] && COURT_PHASES.has(s.phase)); // 법정 밖(숙고·판결)에서는 이름표가 겹쳐 보이지 않게
    }
    const w = this.actors.get('witness')!;
    w.label.setText(exam ? c.speakerName(exam.kind) : SEATS.witness.label);
    w.img.setTexture(defendantAtStand ? 'defendant' : 'witness');

    this.dim.setVisible(!COURT_PHASES.has(s.phase));
    // 양형 숙고는 법정 위에 떠 있는 생각이라 법정을 희미하게 남긴다.
    this.dim.setFillStyle(0x07080a, s.phase === 'sentencing' ? 0.55 : 0.85);
    // 선고 연출은 별도 장면. 끝나면(FINISH_PRONOUNCE·건너뛰기) 장면이 스스로 멈춘다.
    if (s.phase === 'pronounce' && this.lastPhase !== 'pronounce') this.scene.launch('pronounce');
    this.lastPhase = s.phase;

    const line = c.shownLine();
    let seat: SeatKey | null = line?.speaker ?? null;
    if (seat === 'defendant' && defendantAtStand) seat = 'witness';
    this.bob?.stop();
    this.actors.forEach((a, key) => a.img.setY(SEATS[key].y));
    const lit = seat && visible[seat] && !SEATS[seat].hidden ? seat : null;
    // 말하는 사람만 밝고 나머지는 어둠 속에 둔다. 화자가 없거나 재판장이면 모두 중간 밝기.
    this.actors.forEach((a, key) => a.img.setAlpha(lit === null ? 0.7 : key === lit ? 1 : 0.35));
    if (!lit) {
      this.glow.setVisible(false);
      return;
    }
    const a = this.actors.get(lit)!;
    this.glow.setPosition(a.img.x, a.img.y + 4).setVisible(true);
    this.bob = this.tweens.add({ targets: a.img, y: a.img.y - 1, duration: 180, yoyo: true, repeat: 1 });
  }
}
