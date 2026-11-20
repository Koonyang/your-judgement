// 플레이스홀더 텍스처 생성. 실제 도트 스프라이트가 생기면 같은 키로 load.image 하면 된다.
import Phaser from 'phaser';
import { SEATS, SPRITE_H, SPRITE_W, type SeatKey } from './seats';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    for (const [key, seat] of Object.entries(SEATS) as [SeatKey, (typeof SEATS)[SeatKey]][]) {
      if (this.textures.exists(key)) continue;
      const g = this.make.graphics({}, false);
      g.fillStyle(seat.color, 1).fillRect(1, 8, SPRITE_W - 2, SPRITE_H - 8); // 몸통
      if (seat.back) {
        g.fillStyle(0x0b0b0e, 1).fillRect(3, 0, SPRITE_W - 6, 9); // 뒤통수
      } else {
        g.fillStyle(0x6d625a, 1).fillRect(3, 0, SPRITE_W - 6, 9); // 얼굴
        g.fillStyle(0x0b0b0e, 1).fillRect(3, 0, SPRITE_W - 6, 3).fillRect(5, 4, 1, 1).fillRect(SPRITE_W - 6, 4, 1, 1);
      }
      g.generateTexture(key, SPRITE_W, SPRITE_H);
      g.destroy();
    }
    this.scene.start('court');
  }
}
