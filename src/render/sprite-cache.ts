/**
 * 절차적 스프라이트를 오프스크린 캔버스에 캐싱 — 프레임 루프에서는
 * drawImage만 수행해 Canvas 2D로도 수백 개체를 60fps로 그린다 (§1).
 */
import type { EnemyShape } from '../content/enemies';

const cache = new Map<string, HTMLCanvasElement>();

// ── 우주 테마 스프라이트 ──

/** 문자열 시드 → 결정론적 0~1 난수 생성기 (스프라이트 형태가 캐시 재생성 후에도 동일하게) */
function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, mult: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * mult));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * mult));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * mult));
  return `rgb(${r},${g},${b})`;
}

/**
 * 우주 테마 적 스프라이트 — shape을 우주 컨셉으로 재해석:
 * circle=운석, square=거대 운석, triangle=외계 정찰선(비행접시), diamond=외계 위습.
 */
export function spaceEnemySprite(shape: EnemyShape, color: string, radiusPx: number): HTMLCanvasElement {
  const r = Math.max(3, Math.round(radiusPx));
  const key = `space:${shape}:${color}:${r}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = r * 2 + 8;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  const rand = seededRand(key);

  switch (shape) {
    case 'circle':
    case 'square': {
      // 운석: 울퉁불퉁한 바위 폴리곤 + 크레이터. square는 더 각지고 금이 가 있다
      const points = shape === 'circle' ? 11 : 7;
      const jitterMin = shape === 'circle' ? 0.8 : 0.68;
      ctx.beginPath();
      const verts: [number, number][] = [];
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const vr = r * (jitterMin + rand() * (1 - jitterMin + 0.06));
        verts.push([Math.cos(a) * vr, Math.sin(a) * vr]);
      }
      verts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // 음영: 우하단 어둡게
      const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.6, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 크레이터
      const craters = shape === 'circle' ? 3 : 2;
      for (let i = 0; i < craters; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * r * 0.45;
        const cr = r * (0.14 + rand() * 0.14);
        const cx = Math.cos(a) * d;
        const cy = Math.sin(a) * d;
        ctx.fillStyle = shade(color, 0.62);
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, Math.PI * 0.9, Math.PI * 1.9);
        ctx.stroke();
      }
      if (shape === 'square') {
        // 균열
        ctx.strokeStyle = shade(color, 0.45);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          let x = (rand() - 0.5) * r;
          let y = (rand() - 0.5) * r;
          ctx.moveTo(x, y);
          for (let k = 0; k < 3; k++) {
            x += (rand() - 0.5) * r * 0.8;
            y += (rand() - 0.5) * r * 0.8;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      break;
    }
    case 'triangle': {
      // 외계 정찰선: 비행접시 — 납작한 원반 + 반투명 돔 + 하부 등화
      ctx.fillStyle = shade(color, 0.55);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.28, r * 0.55, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      const rim = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.4);
      rim.addColorStop(0, 'rgba(255,255,255,0.35)');
      rim.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // 돔
      const dome = ctx.createRadialGradient(0, -r * 0.35, 1, 0, -r * 0.3, r * 0.5);
      dome.addColorStop(0, 'rgba(220,245,255,0.95)');
      dome.addColorStop(1, 'rgba(140,200,235,0.4)');
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(0, -r * 0.18, r * 0.42, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // 하부 등화
      for (const t of [-0.6, 0, 0.6]) {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(t * r * 0.8, r * 0.32, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'diamond': {
      // 외계 위습: 발광하는 유기체 + 외눈
      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.15);
      glow.addColorStop(0, color);
      glow.addColorStop(0.75, shade(color, 0.7));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.2, 0, r);
      ctx.quadraticCurveTo(-r * 0.95, -r * 0.2, 0, -r);
      ctx.fill();
      // 촉수 스텁
      ctx.strokeStyle = shade(color, 0.8);
      ctx.lineWidth = 1.6;
      for (const t of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(t * r * 0.5, r * 0.55);
        ctx.quadraticCurveTo(t * r * 0.8, r * 0.95, t * r * 0.55, r * 1.15);
        ctx.stroke();
      }
      // 외눈
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2030';
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  cache.set(key, c);
  return c;
}

/** 플레이어 우주선 — +x 방향을 향한다. 그릴 때 조준각으로 회전 */
export function shipSprite(radiusPx: number): HTMLCanvasElement {
  const r = Math.max(6, Math.round(radiusPx));
  const key = `ship:${r}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = Math.ceil(r * 3.4);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);

  // 날개 (몸체 뒤)
  ctx.fillStyle = '#3f5f96';
  ctx.strokeStyle = '#1c2536';
  ctx.lineWidth = 1.5;
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.35, side * r * 0.3);
    ctx.lineTo(-r * 1.15, side * r * 1.3);
    ctx.lineTo(-r * 0.95, side * r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 날개 끝 항법등
    ctx.fillStyle = side > 0 ? '#6fce6f' : '#e05a5a';
    ctx.beginPath();
    ctx.arc(-r * 1.05, side * r * 1.18, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f5f96';
  }

  // 동체 — 매끈한 유선형
  const hull = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
  hull.addColorStop(0, '#dde5f2');
  hull.addColorStop(0.5, '#b8c4da');
  hull.addColorStop(1, '#8894ac');
  ctx.fillStyle = hull;
  ctx.strokeStyle = '#1c2536';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r * 1.55, 0); // 기수
  ctx.quadraticCurveTo(r * 0.6, -r * 0.62, -r * 1.0, -r * 0.5);
  ctx.lineTo(-r * 0.8, 0);
  ctx.lineTo(-r * 1.0, r * 0.5);
  ctx.quadraticCurveTo(r * 0.6, r * 0.62, r * 1.55, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 콕핏
  const dome = ctx.createRadialGradient(r * 0.45, -r * 0.1, 1, r * 0.35, 0, r * 0.5);
  dome.addColorStop(0, '#d8f4ff');
  dome.addColorStop(1, '#3a8ec8');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(r * 0.35, 0, r * 0.42, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c2536';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 엔진 노즐
  ctx.fillStyle = '#4a5468';
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.roundRect(-r * 1.12, side * r * 0.28 - r * 0.14, r * 0.34, r * 0.28, r * 0.08);
    ctx.fill();
  }

  cache.set(key, c);
  return c;
}
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
