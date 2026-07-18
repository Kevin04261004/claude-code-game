/**
 * 강화 티어 → 무기 외형 매핑 (§1 요구: 강화하면 들고 있는 무기 외형이 실제로 변경).
 * 외형 키(content/weapons.ts의 tiers)별 색/이펙트를 정의하고 플레이어 옆에 그린다.
 */
export interface TierVisual {
  blade: string; // 몸체 색
  glow: string | null; // 발광색 (고티어)
  sizeMult: number;
}

const TIER_VISUALS: Record<string, TierVisual> = {
  // 검 계열
  rusty: { blade: '#8a6d55', glow: null, sizeMult: 0.8 },
  iron: { blade: '#a8a8b0', glow: null, sizeMult: 0.9 },
  steel: { blade: '#c8ccd8', glow: null, sizeMult: 1.0 },
  knight: { blade: '#e0e4f0', glow: null, sizeMult: 1.05 },
  // 지팡이 계열
  twig: { blade: '#9a7b52', glow: null, sizeMult: 0.8 },
  oak: { blade: '#b08b5e', glow: null, sizeMult: 0.9 },
  crystal: { blade: '#a8d8e8', glow: '#d8f4ff', sizeMult: 1.0 },
  sage: { blade: '#c0e8c0', glow: '#e8ffe8', sizeMult: 1.05 },
  // 공용 고티어
  rune: { blade: '#7fb8e8', glow: '#b8e0ff', sizeMult: 1.1 },
  flame: { blade: '#ff9a5a', glow: '#ffc890', sizeMult: 1.15 },
  frost: { blade: '#8ad4ff', glow: '#c8ecff', sizeMult: 1.15 },
  storm: { blade: '#ffe066', glow: '#fff2b0', sizeMult: 1.2 },
  void: { blade: '#b48cf2', glow: '#d8c0ff', sizeMult: 1.25 },
  celestial: { blade: '#fff3b0', glow: '#ffffff', sizeMult: 1.3 },
};

const FALLBACK: TierVisual = { blade: '#c0c0c0', glow: null, sizeMult: 1 };

export function tierVisual(tierKey: string): TierVisual {
  return TIER_VISUALS[tierKey] ?? FALLBACK;
}

/**
 * 플레이어 위치에 무기를 그린다. angle: 조준 방향(가장 가까운 적 쪽).
 * 표시 전용이므로 네이티브 Math 사용 가능.
 */
export function drawWeapon(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  angle: number,
  tierKey: string,
  scale: number,
): void {
  const v = tierVisual(tierKey);
  const len = 26 * v.sizeMult * scale;
  const w = 5 * v.sizeMult * scale;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.translate(12 * scale, 0); // 캐릭터 손 위치 오프셋

  if (v.glow) {
    ctx.shadowColor = v.glow;
    ctx.shadowBlur = 10 * scale;
  }
  // 칼날/스태프 몸체
  ctx.fillStyle = v.blade;
  ctx.fillRect(0, -w / 2, len, w);
  // 손잡이
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(-6 * scale, -w * 0.7, 6 * scale, w * 1.4);
  ctx.restore();
}
