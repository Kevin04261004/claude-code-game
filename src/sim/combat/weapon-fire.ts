/**
 * 무기 행동 4종의 매 틱 처리 (content/weapons.ts behavior).
 * 결정론 제약: atan2 금지 — 회전 광선의 부채꼴 판정은 dCos/dSin 경계 벡터와
 * 외적 부호로만 한다 (§3.3).
 *
 * 쿨다운 키: 'weapon' = 발사/대기 카운트다운, 'weaponSweep' = 회전 진행 잔여 틱.
 */
import { BALANCE } from '../../config/balance';
import { dCos, dSin, dist2, TWO_PI } from '../../core/math';
import type { WeaponDef } from '../../content/weapons';
import { beamTickDamage, sweepDamage, sweepIntervalTicks, weaponDamage, weaponTier } from '../progression/growth';
import { equippedWeapon } from '../progression/weapon-upgrade';
import { spawnProjectile } from '../skills/skill-resolver';
import type { SpatialGrid } from './collision';
import type { CombatCtx } from './damage';
import { applyHit } from './damage';
import { nearestEnemy } from './targeting';
import type { SimState } from '../state';

export function tickWeapon(s: SimState, grid: SpatialGrid, ctx: CombatCtx): void {
  const eq = equippedWeapon(s);
  if (!eq) return;
  switch (eq.def.behavior) {
    case 'bolt':
      tickShot(s, eq.def, eq.slot.level, 0, 0);
      break;
    case 'shell':
      tickShot(s, eq.def, eq.slot.level, BALANCE.CANNON_AOE_PCT, BALANCE.CANNON_AOE_RADIUS);
      break;
    case 'beam':
      tickBeam(s, ctx, eq.def, eq.slot.level);
      break;
    case 'sweep':
      tickSweep(s, grid, ctx, eq.def, eq.slot.level);
      break;
  }
}

/** bolt/shell 공용 — 가장 가까운 적 방향으로 투사체 발사 */
function tickShot(s: SimState, def: WeaponDef, level: number, aoePct: number, aoeRadius: number): void {
  const left = s.cooldowns['weapon'] ?? 0;
  if (left > 0) {
    s.cooldowns['weapon'] = left - 1;
    return;
  }
  const target = nearestEnemy(s);
  if (!target) return; // 대상이 생길 때까지 대기 (쿨다운 소모 없음)
  const d = Math.sqrt(target.x * target.x + target.y * target.y);
  spawnProjectile(s, {
    damage: weaponDamage(def, level),
    dirX: target.x / d,
    dirY: target.y / d,
    speed: def.projectileSpeed,
    radius: def.projectileRadius,
    pierce: 0,
    status: null,
    lifestealPct: 0,
    explodePct: 0,
    aoePct,
    aoeRadius,
    canCrit: true,
    tint: def.tint,
    styleKey: 'weapon',
    gradeIndex: weaponTier(def, level), // 티어가 오르면 투사체 발광도 강해진다
  });
  s.cooldowns['weapon'] = def.cooldownTicks;
}

/** beam — 사거리 내 가장 가까운 적에게 BEAM_HIT_PERIOD_TICKS마다 지속 피해 (쿨다운 없음) */
function tickBeam(s: SimState, ctx: CombatCtx, def: WeaponDef, level: number): void {
  if (s.tick % BALANCE.BEAM_HIT_PERIOD_TICKS !== 0) return;
  const target = nearestEnemy(s);
  if (!target) return;
  const rr = BALANCE.BEAM_RANGE + target.radius;
  if (target.x * target.x + target.y * target.y > rr * rr) return; // 사거리 밖
  applyHit(s, ctx, target, {
    damage: beamTickDamage(def, level),
    status: null,
    lifestealPct: 0,
    explodePct: 0,
    canCrit: false, // 지속형은 크리 없음 (aura와 동일 원칙)
  });
}

/**
 * sweep — 대기(weapon) 소진 → SWEEP_DURATION_TICKS 동안 광선이 1회전.
 * 매 활성 틱은 회전각의 1/DUR 부채꼴을 담당해, 적은 회전당 정확히 1회 맞는다.
 */
function tickSweep(s: SimState, grid: SpatialGrid, ctx: CombatCtx, def: WeaponDef, level: number): void {
  const active = s.cooldowns['weaponSweep'] ?? 0;
  if (active > 0) {
    sweepSector(s, grid, ctx, def, level, BALANCE.SWEEP_DURATION_TICKS - active);
    s.cooldowns['weaponSweep'] = active - 1;
    return;
  }
  const left = s.cooldowns['weapon'] ?? 0;
  if (left > 0) {
    s.cooldowns['weapon'] = left - 1;
    return;
  }
  // 빈 회전 방지 — 반경 안에 적이 들어올 때까지 대기 (쿨다운 소모 없음)
  const R = BALANCE.SWEEP_RADIUS;
  const any = grid.query(0, 0, R).some((e) => {
    const rr = R + e.radius;
    return e.hp > 0 && e.x * e.x + e.y * e.y <= rr * rr;
  });
  if (!any) return;
  sweepSector(s, grid, ctx, def, level, 0);
  s.cooldowns['weaponSweep'] = BALANCE.SWEEP_DURATION_TICKS - 1;
  s.cooldowns['weapon'] = sweepIntervalTicks(def, level);
}

/** doneTicks번째 부채꼴(각도 [done·Δ, (done+1)·Δ), Δ=2π/DUR) 안의 적을 타격 */
function sweepSector(s: SimState, grid: SpatialGrid, ctx: CombatCtx, def: WeaponDef, level: number, doneTicks: number): void {
  const step = TWO_PI / BALANCE.SWEEP_DURATION_TICKS;
  const a0 = doneTicks * step;
  const u0x = dCos(a0);
  const u0y = dSin(a0);
  const u1x = dCos(a0 + step);
  const u1y = dSin(a0 + step);
  const R = BALANCE.SWEEP_RADIUS;
  const dmg = sweepDamage(def, level);

  for (const e of grid.query(0, 0, R)) {
    if (e.hp <= 0) continue;
    const rr = R + e.radius;
    if (dist2(0, 0, e.x, e.y) > rr * rr) continue;
    // 부채꼴 판정 (Δ=60°<180°이므로 외적 부호 두 개로 충분): u0 반시계쪽 ∧ u1 시계쪽
    const inSector = u0x * e.y - u0y * e.x >= 0 && u1x * e.y - u1y * e.x < 0;
    if (!inSector) continue;
    applyHit(s, ctx, e, {
      damage: dmg,
      status: null,
      lifestealPct: 0,
      explodePct: 0,
      canCrit: true,
    });
  }
}
