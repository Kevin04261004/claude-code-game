/**
 * 강화 티어 → 무기 외형 매핑 (§1 요구: 강화하면 들고 있는 무기 외형이 실제로 변경).
 * 외형 키(content/weapons.ts의 tiers)별 색/이펙트 + behavior별 총기 형태를
 * 플레이어 옆에 그린다. 전투 이펙트(빔/회전 광선)도 여기서 담당한다.
 */
import type { WeaponBehavior } from '../content/weapons';

export interface TierVisual {
  body: string; // 몸체 색
  glow: string | null; // 발광색 (고티어)
  sizeMult: number;
}

const TIER_VISUALS: Record<string, TierVisual> = {
  // SF Mk 시리즈 (저티어)
  mk1: { body: '#8a8f9a', glow: null, sizeMult: 0.85 },
  mk2: { body: '#a8b0bc', glow: null, sizeMult: 0.95 },
  mk3: { body: '#c8d2e0', glow: null, sizeMult: 1.0 },
  mk4: { body: '#9fd8f2', glow: '#d8f4ff', sizeMult: 1.05 },
  // 에너지 코어 계열 (고티어)
  rune: { body: '#7fb8e8', glow: '#b8e0ff', sizeMult: 1.1 },
  flame: { body: '#ff9a5a', glow: '#ffc890', sizeMult: 1.15 },
  frost: { body: '#8ad4ff', glow: '#c8ecff', sizeMult: 1.15 },
  storm: { body: '#ffe066', glow: '#fff2b0', sizeMult: 1.2 },
  void: { body: '#b48cf2', glow: '#d8c0ff', sizeMult: 1.25 },
  celestial: { body: '#fff3b0', glow: '#ffffff', sizeMult: 1.3 },
};

const FALLBACK: TierVisual = { body: '#c0c0c0', glow: null, sizeMult: 1 };

export function tierVisual(tierKey: string): TierVisual {
  return TIER_VISUALS[tierKey] ?? FALLBACK;
}

/**
 * 플레이어 위치에 무기를 그린다. angle: 조준 방향(가장 가까운 적 쪽).
 * behavior별로 형태가 다르다. 표시 전용이므로 네이티브 Math 사용 가능.
 */
export function drawWeapon(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  angle: number,
  tierKey: string,
  scale: number,
  behavior: WeaponBehavior,
): void {
  const v = tierVisual(tierKey);
  const s = v.sizeMult * scale;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.translate(11 * scale, 0); // 선체 측면 하드포인트 오프셋
  if (v.glow) {
    ctx.shadowColor = v.glow;
    ctx.shadowBlur = 9 * scale;
  }
  ctx.fillStyle = v.body;

  switch (behavior) {
    case 'bolt': {
      // 레이저 블래스터 — 슬림한 몸체 + 가는 총열 + 발광 머즐
      ctx.fillRect(0, -3 * s, 13 * s, 6 * s);
      ctx.fillRect(13 * s, -1.4 * s, 12 * s, 2.8 * s);
      ctx.beginPath();
      ctx.arc(25 * s, 0, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shell': {
      // 플라즈마 포 — 두꺼운 포신 + 머즐 링
      ctx.fillRect(0, -4.5 * s, 18 * s, 9 * s);
      ctx.strokeStyle = v.glow ?? v.body;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.arc(19 * s, 0, 4.2 * s, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    }
    case 'beam': {
      // 광자 빔 — 포크형 방출구 + 사이의 에너지 코어
      ctx.fillRect(0, -3 * s, 11 * s, 6 * s);
      ctx.fillRect(11 * s, -4.6 * s, 9 * s, 2.4 * s);
      ctx.fillRect(11 * s, 2.2 * s, 9 * s, 2.4 * s);
      ctx.fillStyle = v.glow ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(16 * s, 0, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sweep': {
      // 회전 광선 — 원형 이미터 + 방사형 핀 4개
      ctx.beginPath();
      ctx.arc(8 * s, 0, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.save();
        ctx.translate(8 * s, 0);
        ctx.rotate(a);
        ctx.fillRect(4.5 * s, -1.2 * s, 4.5 * s, 2.4 * s);
        ctx.restore();
      }
      ctx.fillStyle = v.glow ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(8 * s, 0, 1.8 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** 광자 빔 — 선체에서 대상까지 다층 발광 라인 + 착탄 글로우 (표시 전용) */
export function drawBeamFx(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tint: string,
  scale: number,
  now: number,
): void {
  const flick = 0.8 + 0.2 * Math.sin(now * 0.03) + 0.08 * Math.sin(now * 0.011);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 바깥 글로우 → 중간 → 흰 코어 순으로 겹친다
  const layers: Array<[number, string, number]> = [
    [7 * scale, tint, 0.18 * flick],
    [3.2 * scale, tint, 0.5 * flick],
    [1.4 * scale, '#ffffff', 0.9 * flick],
  ];
  for (const [w, color, alpha] of layers) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // 착탄점 — 일렁이는 임팩트 글로우
  const r = (5 + 2 * Math.sin(now * 0.05)) * scale;
  const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, r * 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, tint);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.8 * flick;
  ctx.beginPath();
  ctx.arc(x1, y1, r * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** 회전 광선 — 현재 각도의 메인 빔 + 지나온 궤적의 페이드 아크 (표시 전용) */
export function drawSweepFx(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  angle: number,
  tint: string,
  scale: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 지나온 궤적 — 뒤로 갈수록 옅어지는 부채꼴 조각들
  const TRAIL = Math.PI * 0.6;
  const SEGS = 6;
  for (let i = 0; i < SEGS; i++) {
    const a1 = angle - (TRAIL * i) / SEGS;
    const a0 = angle - (TRAIL * (i + 1)) / SEGS;
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.16 * (1 - i / SEGS);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radiusPx, a0, a1);
    ctx.closePath();
    ctx.fill();
  }

  // 메인 빔 — 글로우 + 흰 코어
  const bx = cx + Math.cos(angle) * radiusPx;
  const by = cy + Math.sin(angle) * radiusPx;
  for (const [w, color, alpha] of [
    [8 * scale, tint, 0.35],
    [3 * scale, tint, 0.7],
    [1.4 * scale, '#ffffff', 0.95],
  ] as Array<[number, string, number]>) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // 빔 끝 — 밝은 팁
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(bx, by, 3 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
