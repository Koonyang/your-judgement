// 법정 장면(판사 시점, 위 170px 띠(그리는 좌표 150)): 좌석 플레이스홀더를 그리고 현재 화자만 밝힌다. 상태는 컨트롤러 구독으로 받는다.
import Phaser from 'phaser';
import type { Controller } from '../game/controller';
import type { GameState } from '../engine/state';
import { COURT_H, COURT_SCREEN_H, FONT_STACK, SEATS, SPRITE_H, type SeatKey } from './seats';

type Spot = { x: number; y: number; scale: number };
type Actor = { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; spot: Spot; shown: boolean; arrive?: () => void; walk?: Phaser.Tweens.Tween; breathe?: Phaser.Tweens.Tween; fx?: Phaser.FX.ColorMatrix };

const spotOf = (key: SeatKey): Spot => ({ x: SEATS[key].x, y: SEATS[key].y, scale: SEATS[key].scale ?? 1 });
/** 증인이 드나드는 방청석 난간 문. */
const GATE: Spot = { x: 320, y: 62, scale: 1 };
const COURT_PHASES = new Set<GameState['phase']>(['opening', 'evidence', 'exam', 'closing']);

export class CourtroomScene extends Phaser.Scene {
  private actors = new Map<SeatKey, Actor>();
  private witnessOf: string | null = null;
  private wasRecalling = false;
  private waves!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private bob?: Phaser.Tweens.Tween;
  private unsubscribe?: () => void;
  private lastPhase: GameState['phase'] | null = null;

  constructor() {
    super('court');
  }

  create(): void {
    const c = this.registry.get('controller') as Controller;
    // 법정을 화면 위 170px에 꽉 차게 확대(그리는 좌표는 640×150 그대로). 위 끝을 화면 위 끝에 맞춘다.
    const zoom = COURT_SCREEN_H / COURT_H;
    this.cameras.main.setZoom(zoom).centerOn(320, 180 / zoom);
    this.scene.launch('chambers');
    this.drawRoom();
    // 말소리: 머리 위로 번지는 호 세 줄. 소리를 내는 사람이 상대적으로 또렷이 잡힌다.
    this.waves = this.add.container(0, 0, [0, 1, 2].map((i) => {
      const r = 3 + i * 3;
      const g = this.add.graphics().lineStyle(1, 0xffc478, 1).beginPath()
        .arc(0, r, r, Phaser.Math.DegToRad(225), Phaser.Math.DegToRad(315)).strokePath();
      g.setY(-i * 2);
      this.tweens.add({ targets: g, alpha: { from: 0.15, to: 1 }, duration: 300, delay: i * 150, yoyo: true, repeat: -1, repeatDelay: 150 });
      return g;
    })).setDepth(6).setVisible(false);
    for (const key of Object.keys(SEATS) as SeatKey[]) {
      const seat = SEATS[key];
      const img = this.add.image(seat.x, seat.y, key).setScale(seat.scale ?? 1);
      const label = this.add
        .text(seat.x, seat.y + (SPRITE_H * (seat.scale ?? 1)) / 2 + 1, seat.label, { fontFamily: FONT_STACK, fontSize: '9px', color: '#8d8272' })
        .setOrigin(0.5, 0)
        .setDepth(5);
      if (seat.back) img.setDepth(4); // 참여관은 자기 책상보다 내 쪽에 앉아 등을 보인다
      const a: Actor = { img, label, spot: spotOf(key), shown: key !== 'witness', fx: img.preFX?.addColorMatrix() };
      this.actors.set(key, a);
      this.breathe(a);
    }
    this.drawDesks();
    this.dim = this.add.rectangle(320, COURT_H / 2, 640, COURT_H, 0x07080a, 0.85).setDepth(10);
    this.unsubscribe = c.subscribe(() => this.sync(c));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.sync(c);
  }

  private drawRoom(): void {
    this.add.rectangle(320, 34, 640, 68, 0x1a1c22); // 뒷벽
    for (let r = 0; r < 2; r++) // 방청석 (실루엣)
      for (let x = 24 + r * 9; x < 620; x += 22) if ((x + r) % 5) this.add.rectangle(x, 34 + r * 14, 9, 9, 0x262830);
    this.add.rectangle(320, 66, 640, 3, 0x363841); // 방청석 난간
    this.add.rectangle(320, 109, 640, 82, 0x16171c); // 바닥
  }

  private drawDesks(): void {
    const desk = (x: number, y: number, w: number, h: number) =>
      this.add.rectangle(x, y, w, h, 0x35281d).setStrokeStyle(1, 0x4a3828);
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
    const witnessIn = exam?.kind === 'witness';
    const visible: Record<SeatKey, boolean> = {
      judge: false, clerk: true, prosecutor: true, defense: true, defendant: true, witness: witnessIn,
    };
    const w = this.actors.get('witness')!;
    const d = this.actors.get('defendant')!;
    // 위치 이동: 피고인은 자기 자리 ↔ 증언대, 증인은 난간 문 → 증언대 → 퇴정. 다음 증인이면 앞 증인이 나간 뒤 들어온다.
    // 쟁점 보드 회상은 걸어 들어오지 않고 그 장면 그대로 나타났다 사라진다.
    const snap = c.recalling || this.wasRecalling;
    this.wasRecalling = c.recalling;
    if (snap) this.place(d, defendantAtStand ? spotOf('witness') : spotOf('defendant'));
    else this.moveTo(d, defendantAtStand ? spotOf('witness') : spotOf('defendant'));
    const id = witnessIn ? exam!.id : null;
    if (id !== this.witnessOf) {
      const enter = () => {
        if (id === null) return;
        w.label.setText(c.speakerName('witness'));
        w.shown = true;
        if (snap) return this.place(w, spotOf('witness'));
        w.img.setPosition(GATE.x, GATE.y).setScale(GATE.scale);
        w.spot = GATE;
        this.moveTo(w, spotOf('witness'));
      };
      if (this.witnessOf !== null && snap) { w.shown = false; enter(); }
      else if (this.witnessOf !== null) this.moveTo(w, GATE, () => { w.shown = false; enter(); });
      else enter();
      this.witnessOf = id;
    }
    const courtOn = COURT_PHASES.has(s.phase) || c.recalling;
    for (const [key, a] of this.actors) {
      const on = key === 'witness' ? w.shown : visible[key];
      a.img.setVisible(on);
      a.label.setVisible(on && !a.walk && courtOn); // 법정 밖(숙고·판결)·걷는 중에는 이름표가 겹쳐 보이지 않게
    }
    d.label.setText(defendantAtStand ? c.speakerName('defendant') : SEATS.defendant.label);

    this.dim.setVisible(!courtOn);
    // 법정 밖 단계는 판사실로 장면을 바꾼다(선고는 별도 장면).
    this.scene.setVisible(!courtOn && s.phase !== 'pronounce', 'chambers');
    // 양형 숙고는 법정 위에 떠 있는 생각이라 법정을 희미하게 남긴다.
    this.dim.setFillStyle(0x07080a, s.phase === 'sentencing' ? 0.55 : 0.85);
    // 선고 연출은 별도 장면. 끝나면(FINISH_PRONOUNCE·건너뛰기) 장면이 스스로 멈춘다.
    if (s.phase === 'pronounce' && this.lastPhase !== 'pronounce') this.scene.launch('pronounce');
    this.lastPhase = s.phase;

    const line = c.shownLine();
    const seat: SeatKey | null = line && line.speaker !== 'thought' ? line.speaker : null;
    this.bob?.stop();
    this.actors.forEach((a) => { if (!a.walk) a.img.setY(a.spot.y); });
    const lit = seat && visible[seat] && !SEATS[seat].hidden ? seat : null;
    // 말하는 사람만 밝히고 나머지는 어둠 속에 둔다. 화자가 없거나 재판장이면 모두 중간 밝기.
    this.actors.forEach((a, key) => {
      a.img.setAlpha(lit === null ? 0.85 : key === lit ? 1 : 0.55);
      // 말하는 사람은 같은 그림을 셰이더로 밝히고 스탠드 빛 색을 얹는다(WebGL). 캔버스 폴백이면 투명도 차이만 남는다.
      const on = key === lit;
      if (on) { a.fx?.brightness(1.7); a.img.setTint(0xffe2b8); } else { a.fx?.reset(); a.img.clearTint(); }
    });
    if (!lit) {
      this.waves.setVisible(false);
      return;
    }
    const a = this.actors.get(lit)!;
    this.waves.setPosition(a.spot.x, a.spot.y - (SPRITE_H * a.spot.scale) / 2 - 2).setVisible(true);
    if (!a.walk) this.bob = this.tweens.add({ targets: a.img, y: a.spot.y - 1, duration: 180, yoyo: true, repeat: 1 });
  }

  private refresh(): void {
    this.sync(this.registry.get('controller') as Controller);
  }

  /** 숨쉬기: 사람마다 박자를 달리해 아주 조금 들썩인다(서류 너머로도 법정이 살아 있게). */
  private breathe(a: Actor): void {
    a.breathe?.remove();
    a.breathe = this.tweens.add({
      targets: a.img, scaleY: a.spot.scale * 1.04, duration: 1400 + Math.random() * 900,
      delay: Math.random() * 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** 걷지 않고 그 자리에 바로 둔다. */
  private place(a: Actor, to: Spot): void {
    a.walk?.remove();
    a.walk = undefined;
    a.arrive = undefined;
    a.spot = to;
    a.img.setPosition(to.x, to.y).setScale(to.scale);
    a.label.setPosition(to.x, to.y + (SPRITE_H * to.scale) / 2 + 1);
    this.breathe(a);
  }

  /** 짧은 걸음: 통통 튀며 목표 자리로 간다. 이미 그 자리(로 가는 중)면 아무것도 안 한다. */
  private moveTo(a: Actor, to: Spot, done?: () => void): void {
    a.arrive = done;
    if (a.spot.x === to.x && a.spot.y === to.y) {
      if (!a.walk) done?.();
      return;
    }
    const from = { x: a.img.x, y: a.img.y, scale: a.img.scaleX };
    a.spot = to;
    a.walk?.remove();
    a.breathe?.remove();
    a.label.setVisible(false);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(2, Math.round(dist / 16));
    const place = (t: number) => {
      const sc = from.scale + (to.scale - from.scale) * t;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t - Math.abs(Math.sin(t * steps * Math.PI)) * 2;
      a.img.setPosition(x, y).setScale(sc);
      a.label.setPosition(x, from.y + (to.y - from.y) * t + (SPRITE_H * sc) / 2 + 1);
    };
    a.walk = this.tweens.addCounter({
      from: 0, to: 1, duration: Math.max(500, dist * 5),
      onUpdate: (tw) => place(tw.getValue() ?? 0),
      onComplete: () => { place(1); a.walk = undefined; const f = a.arrive; a.arrive = undefined; this.breathe(a); f?.(); this.refresh(); },
    });
  }
}
