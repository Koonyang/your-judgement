// 플레이스홀더 텍스처 생성. 실제 도트 스프라이트가 생기면 같은 키로 load.image 하면 된다.
import Phaser from 'phaser';
import { SEATS, SPRITE_H, SPRITE_W, type SeatKey } from './seats';

/** 스탠드 빛(#ffc478)을 받은 색: 원색을 1.5배로 밝히고 빛 색을 30% 섞는다. */
const lit = (c: number): number => {
  const lamp = [0xff, 0xc4, 0x78];
  return [16, 8, 0].reduce((acc, sh, i) => {
    const v = Math.min(255, Math.round(((c >> sh) & 0xff) * 1.5 * 0.7 + lamp[i] * 0.3));
    return acc | (v << sh);
  }, 0);
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    // 말하는 사람은 "-lit" 텍스처로 바꿔 끼운다: 책상 스탠드 빛 가장 밝은 단 정도로 색을 끌어올린 판.
    // shortcut: 플레이스홀더라 밝은 판을 직접 그림, 실제 스프라이트가 생기면 "-lit" 판을 같이 load.image 하거나 셰이더로 교체
    for (const [key, seat] of Object.entries(SEATS) as [SeatKey, (typeof SEATS)[SeatKey]][]) {
      for (const suffix of ['', '-lit']) {
        if (this.textures.exists(key + suffix)) continue;
        const c = suffix ? lit : (x: number) => x;
        const g = this.make.graphics({}, false);
        g.fillStyle(c(seat.color), 1).fillRect(1, 8, SPRITE_W - 2, SPRITE_H - 8); // 몸통
        if (seat.back) {
          g.fillStyle(c(0x0b0b0e), 1).fillRect(3, 0, SPRITE_W - 6, 9); // 뒤통수
        } else {
          g.fillStyle(c(0x8a7d70), 1).fillRect(3, 0, SPRITE_W - 6, 9); // 얼굴
          g.fillStyle(c(0x0b0b0e), 1).fillRect(3, 0, SPRITE_W - 6, 3).fillRect(5, 4, 1, 1).fillRect(SPRITE_W - 6, 4, 1, 1);
        }
        g.generateTexture(key + suffix, SPRITE_W, SPRITE_H);
        g.destroy();
      }
    }
    this.scene.start('court');
  }
}
