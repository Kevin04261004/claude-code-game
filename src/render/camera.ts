/**
 * 뷰포트/좌표 변환 — 월드 원점(플레이어)이 캔버스 중앙에 오도록.
 * 캔버스 크기에 맞춰 아레나가 화면에 들어가도록 균일 스케일.
 */
import { BALANCE } from '../config/balance';

export class Camera {
  scale = 1;
  cx = 0;
  cy = 0;

  fit(canvasWidth: number, canvasHeight: number): void {
    this.cx = canvasWidth / 2;
    this.cy = canvasHeight / 2;
    const worldSize = (BALANCE.SPAWN_RADIUS + 20) * 2;
    this.scale = Math.min(canvasWidth, canvasHeight) / worldSize;
  }

  x(worldX: number): number {
    return this.cx + worldX * this.scale;
  }

  y(worldY: number): number {
    return this.cy + worldY * this.scale;
  }

  r(worldR: number): number {
    return worldR * this.scale;
  }
}
