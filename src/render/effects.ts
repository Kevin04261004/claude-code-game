/**
 * 타격 이펙트/데미지 숫자 — cosmetic 채널 구독 (§3.2: catchup 중엔 버스가 음소거).
 * 표시 전용이므로 sim 결정론 제약을 받지 않는다.
 */
import type { EventBus } from '../core/event-bus';
import type { Camera } from './camera';

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  ageMs: number;
}

interface Ring {
  x: number; // 월드 좌표 중심 (nova는 플레이어 중심 0,0)
  y: number;
  radius: number;
  color: string;
  ageMs: number;
}

const TEXT_LIFE_MS = 700;
const RING_LIFE_MS = 350;
const MAX_TEXTS = 120;

export class EffectsLayer {
  private texts: FloatingText[] = [];
  private rings: Ring[] = [];

  constructor(bus: EventBus, private readonly reducedEffects: () => boolean) {
    bus.on('hit', (e) => {
      if (this.reducedEffects() || this.texts.length >= MAX_TEXTS) return;
      this.texts.push({
        x: e['x'] as number,
        y: e['y'] as number,
        text: String(e['amount']),
        color: e['crit'] ? '#ffd24a' : '#ffffff',
        ageMs: 0,
      });
    });
    bus.on('nova', (e) => {
      this.rings.push({ x: 0, y: 0, radius: e['radius'] as number, color: (e['tint'] as string) ?? '#ffffff', ageMs: 0 });
    });
    bus.on('explosion', (e) => {
      this.rings.push({
        x: (e['x'] as number) ?? 0,
        y: (e['y'] as number) ?? 0,
        radius: e['radius'] as number,
        color: '#ff9a5a',
        ageMs: 0,
      });
    });
  }

  update(dtMs: number): void {
    for (const t of this.texts) t.ageMs += dtMs;
    for (const r of this.rings) r.ageMs += dtMs;
    this.texts = this.texts.filter((t) => t.ageMs < TEXT_LIFE_MS);
    this.rings = this.rings.filter((r) => r.ageMs < RING_LIFE_MS);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const r of this.rings) {
      const p = r.ageMs / RING_LIFE_MS;
      const cx = cam.x(r.x);
      const cy = cam.y(r.y);
      const rad = cam.r(r.radius * (0.5 + 0.5 * p));
      // 확장 링 + 안쪽 발광 채움 (사라지며 옅어짐)
      ctx.globalAlpha = (1 - p) * 0.25;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = `bold ${Math.max(10, cam.r(11))}px sans-serif`;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const p = t.ageMs / TEXT_LIFE_MS;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, cam.x(t.x), cam.y(t.y) - cam.r(14) - p * 16);
    }
    ctx.globalAlpha = 1;
  }
}
