/**
 * SkillInstance → 매 틱 실제 효과 적용 (§4.1).
 * 엔진이 아는 것은 behavior 4종(bolt/orbit/nova/aura)의 행동 패턴뿐이다.
 */
import { BALANCE } from '../../config/balance';
import { dCos, dSin, dist2, rotate, TWO_PI } from '../../core/math';
import type { StatusSpec } from '../../content/skills/skill-elements';
import type { SpatialGrid } from '../combat/collision';
import type { CombatCtx } from '../combat/damage';
import { applyHit } from '../combat/damage';
import { nearestEnemy } from '../combat/targeting';
import type { SimState } from '../state';
import type { SkillInstance } from './skill-composer';

export interface ProjectileSpec {
  damage: number;
  dirX: number; // 정규화된 방향
  dirY: number;
  speed: number; // units/sec
  radius: number;
  pierce: number;
  status: StatusSpec | null;
  lifestealPct: number;
  explodePct: number;
  /** 착탄 폭발(shell 무기) — 생략 시 없음 */
  aoePct?: number;
  aoeRadius?: number;
  canCrit: boolean;
  tint: string | null;
  styleKey: string | null;
  gradeIndex: number;
}

/** 회전 스킬 다중 장착 시 슬롯(장착 순서)별 위상차 — 렌더러와 반드시 동일 공식 */
export function orbitPhase(instanceIndex: number): number {
  return instanceIndex * BALANCE.ORBIT_PHASE_OFFSET_RAD;
}

/** 발사체 생성 — 무기 공격(simulation.ts)과 bolt 스킬이 공용 */
export function spawnProjectile(state: SimState, spec: ProjectileSpec): void {
  if (state.projectiles.length >= BALANCE.PROJECTILE_CAP) return;
  const vPerTick = spec.speed / BALANCE.TPS;
  state.projectiles.push({
    id: state.nextId++,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: spec.dirX * vPerTick,
    vy: spec.dirY * vPerTick,
    damage: spec.damage,
    radius: spec.radius,
    pierceLeft: spec.pierce,
    ttl: BALANCE.PROJECTILE_TTL_TICKS,
    elementId: null,
    status: spec.status,
    lifestealPct: spec.lifestealPct,
    explodePct: spec.explodePct,
    aoePct: spec.aoePct ?? 0,
    aoeRadius: spec.aoeRadius ?? 0,
    canCrit: spec.canCrit,
    tint: spec.tint,
    styleKey: spec.styleKey,
    gradeIndex: spec.gradeIndex,
    hitIds: [],
    dead: false,
  });
}

export function tickSkills(state: SimState, instances: SkillInstance[], grid: SpatialGrid, ctx: CombatCtx): void {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    switch (inst.behavior) {
      case 'bolt':
        tickBolt(state, inst);
        break;
      case 'orbit':
        tickOrbit(state, inst, grid, ctx, orbitPhase(i));
        break;
      case 'nova':
        tickNova(state, inst, grid, ctx);
        break;
      case 'aura':
        tickAura(state, inst, grid, ctx);
        break;
    }
  }
}

function tickBolt(state: SimState, inst: SkillInstance): void {
  const left = state.cooldowns[inst.id] ?? 0;
  if (left > 0) {
    state.cooldowns[inst.id] = left - 1;
    return;
  }
  const target = nearestEnemy(state);
  if (!target) return; // 대상이 생길 때까지 대기 (쿨다운 소모 없음)

  const d = Math.sqrt(target.x * target.x + target.y * target.y);
  const dirX = target.x / d;
  const dirY = target.y / d;
  for (let i = 0; i < inst.count; i++) {
    // 다중발사: 대상 방향 중심으로 부채꼴 산개
    const offset = (i - (inst.count - 1) / 2) * BALANCE.MULTISHOT_SPREAD_RAD;
    const dir = rotate(dirX, dirY, offset);
    spawnProjectile(state, {
      damage: inst.damage,
      dirX: dir.x,
      dirY: dir.y,
      speed: inst.projectileSpeed,
      radius: 7,
      pierce: inst.pierce,
      status: inst.status,
      lifestealPct: inst.lifestealPct,
      explodePct: inst.explodePct,
      canCrit: true,
      tint: inst.tint,
      styleKey: inst.baseId,
      gradeIndex: inst.gradeIndex,
    });
  }
  state.cooldowns[inst.id] = inst.cooldownTicks;
}

function tickOrbit(state: SimState, inst: SkillInstance, grid: SpatialGrid, ctx: CombatCtx, phase: number): void {
  if (state.tick % BALANCE.ORBIT_HIT_PERIOD_TICKS !== 0) return;
  const bladeR = BALANCE.ORBIT_BLADE_RADIUS;
  for (let i = 0; i < inst.count; i++) {
    const angle = state.orbitAngle + phase + (i * TWO_PI) / inst.count;
    const bx = dCos(angle) * inst.radius;
    const by = dSin(angle) * inst.radius;
    for (const e of grid.query(bx, by, bladeR)) {
      const rr = bladeR + e.radius;
      if (e.hp > 0 && dist2(bx, by, e.x, e.y) <= rr * rr) {
        applyHit(state, ctx, e, {
          damage: inst.damage,
          status: inst.status,
          lifestealPct: inst.lifestealPct,
          explodePct: inst.explodePct,
          canCrit: true,
        });
      }
    }
  }
}

function tickNova(state: SimState, inst: SkillInstance, grid: SpatialGrid, ctx: CombatCtx): void {
  const left = state.cooldowns[inst.id] ?? 0;
  if (left > 0) {
    state.cooldowns[inst.id] = left - 1;
    return;
  }
  const targets = grid.query(0, 0, inst.radius).filter((e) => {
    const rr = inst.radius + e.radius;
    return e.hp > 0 && e.x * e.x + e.y * e.y <= rr * rr;
  });
  if (targets.length === 0) return; // 빈 사격 방지 — 적이 들어올 때까지 대기
  for (const e of targets) {
    applyHit(state, ctx, e, {
      damage: inst.damage,
      status: inst.status,
      lifestealPct: inst.lifestealPct,
      explodePct: inst.explodePct,
      canCrit: true,
    });
  }
  ctx.bus.emit('cosmetic', { type: 'nova', radius: inst.radius, tint: inst.tint });
  state.cooldowns[inst.id] = inst.cooldownTicks;
}

function tickAura(state: SimState, inst: SkillInstance, grid: SpatialGrid, ctx: CombatCtx): void {
  if (state.tick % BALANCE.AURA_HIT_PERIOD_TICKS !== 0) return;
  for (const e of grid.query(0, 0, inst.radius)) {
    const rr = inst.radius + e.radius;
    if (e.hp > 0 && e.x * e.x + e.y * e.y <= rr * rr) {
      applyHit(state, ctx, e, {
        damage: inst.damage,
        status: inst.status,
        lifestealPct: inst.lifestealPct,
        explodePct: inst.explodePct,
        canCrit: false, // 지속 장판은 크리 없음 (틱당 다수 대상이라 분산 과다)
      });
    }
  }
}
