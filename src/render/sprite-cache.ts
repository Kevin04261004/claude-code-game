/**
 * 절차적 스프라이트를 오프스크린 캔버스에 캐싱 — 프레임 루프에서는
 * drawImage만 수행해 Canvas 2D로도 수백 개체를 60fps로 그린다 (§1).
 */
import type { EnemyShape } from '../content/enemies';

const cache = new Map<string, HTMLCanvasElement>();

export function shapeSprite(shape: EnemyShape, color: string, radiusPx: number): HTMLCanvasElement {
  const r = Math.max(2, Math.round(radiusPx));
  const key = `${shape}:${color}:${r}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = r * 2 + 4;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.87, r * 0.5);
      ctx.lineTo(-r * 0.87, r * 0.5);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'diamond':
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
  cache.set(key, c);
  return c;
}

/** 원형 발사체 스프라이트 (틴트 지원) */
export function projectileSprite(color: string, radiusPx: number): HTMLCanvasElement {
  const r = Math.max(2, Math.round(radiusPx));
  const key = `proj:${color}:${r}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = r * 2 + 6;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r + 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}
