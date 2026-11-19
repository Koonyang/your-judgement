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
      // 몸통
      g.fillStyle(seat.color, 1).fillRect(4, 28, SPRITE_W - 8, SPRITE_H - 28);
      // 머리
      g.fillStyle(0xd9b48f, 1).fillRect(16, 4, SPRITE_W - 32, 26);
      g.fillStyle(0x1d1611, 1).fillRect(16, 4, SPRITE_W - 32, 8);
      g.generateTexture(key, SPRITE_W, SPRITE_H);
      g.destroy();
    }
    this.scene.start('court');
  }
}
