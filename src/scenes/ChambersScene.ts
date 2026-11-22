// 판사실: 법정 밖 단계(대기열·기록 검토·재검토·판단·판결·항소·기록실)의 배경. 법정 띠와 책상 띠 대신 방 하나를 통째로 보여 준다.
// 보이기/숨기기는 CourtroomScene이 단계에 맞춰 정한다. 책상 위 서류(HTML)는 그대로 이 책상 위에 놓인다.
import Phaser from 'phaser';

export class ChambersScene extends Phaser.Scene {
  constructor() {
    super('chambers');
  }

  create(): void {
    const r = (x: number, y: number, w: number, h: number, c: number, a = 1) => this.add.rectangle(x, y, w, h, c, a).setOrigin(0);
    r(0, 0, 640, 360, 0x2a231c); // 벽
    // 창(블라인드 사이로 낮빛)
    r(36, 26, 168, 120, 0x1c1712);
    r(42, 32, 156, 108, 0x55606b);
    for (let y = 36; y < 140; y += 6) r(42, y, 156, 3, 0x6d7782);
    r(118, 32, 4, 108, 0x1c1712);
    // 책장(법전·판례집)
    r(404, 14, 210, 168, 0x1f1914);
    const spines = [0x6b2a24, 0x2c3a4d, 0x4e4434, 0x7a6a4a, 0x3d2f26, 0x5a2420];
    for (let s = 0; s < 3; s++) {
      const y = 22 + s * 54;
      r(410, y + 46, 198, 4, 0x3b2a1c); // 선반
      for (let x = 414, i = s; x < 600; i++) {
        const w = 7 + ((i * 5) % 6);
        const h = 32 + ((i * 7) % 12);
        r(x, y + 46 - h, w, h, spines[i % spines.length]);
        x += w + 1;
      }
    }
    // 책상 상판 + 모서리, 스탠드 빛(책상 CSS와 같은 계단식)
    r(0, 182, 640, 178, 0x3b2a1c);
    r(0, 182, 640, 3, 0x4f3926);
    for (const [w, h, a] of [[340, 86, 0.06], [260, 66, 0.06], [190, 48, 0.07], [120, 30, 0.07]] as const)
      this.add.ellipse(320, 270, w * 2, h * 2, 0xffc478, a); // 상판(y182~) 밖으로 번지지 않게 납작하게
  }
}
