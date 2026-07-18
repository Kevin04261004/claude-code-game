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

/** 원형 발사체 스프라이트 — glow: 등급 인덱스(0~5)에 따라 발광 확장 */
export function projectileSprite(color: string, radiusPx: number, glow = 0): HTMLCanvasElement {
  const r = Math.max(2, Math.round(radiusPx));
  const key = `proj:${color}:${r}:${glow}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const halo = 2 + glow * 2;
  const size = (r + halo) * 2 + 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r + halo);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r + halo, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}

/** 창(lance) 발사체 — 진행 방향으로 길쭉한 마름모. 그릴 때 회전시켜 사용 */
export function lanceSprite(color: string, lengthPx: number, glow = 0): HTMLCanvasElement {
  const len = Math.max(8, Math.round(lengthPx));
  const w = Math.max(3, Math.round(len * 0.22));
  const key = `lance:${color}:${len}:${glow}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pad = 4 + glow * 2;
  const c = document.createElement('canvas');
  c.width = len + pad * 2;
  c.height = w * 2 + pad * 2;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 3 + glow * 2;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(len / 2, 0); // 촉
  ctx.lineTo(len * 0.1, -w);
  ctx.lineTo(-len / 2, 0);
  ctx.lineTo(len * 0.1, w);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(len * 0.25, 0, w * 0.4, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}

/** 회전 칼날 — 초승달 형태. 그릴 때 궤도 접선 방향으로 회전시켜 사용 */
export function bladeSprite(color: string, radiusPx: number, glow = 0): HTMLCanvasElement {
  const r = Math.max(4, Math.round(radiusPx));
  const key = `blade:${color}:${r}:${glow}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pad = 3 + glow * 2;
  const size = r * 2 + pad * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 3 + glow * 2;
  }
  // 초승달: 바깥 원호 - 안쪽 원호
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.arc(r * 0.45, 0, r * 0.7, Math.PI * 0.75, -Math.PI * 0.75, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  cache.set(key, c);
  return c;
}
