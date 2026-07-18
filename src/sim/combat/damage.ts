/**
 * ★ 데미지 계산·적용 공식 (크리티컬, 감전 취약, 상태이상 부착, 흡혈, 유폭, 처치 보상)
 */
import { BALANCE } from '../../config/balance';
import { dist2 } from '../../core/math';
import type { EventBus } from '../../core/event-bus';
import type { Rng } from '../../core/rng';
import type { StatusSpec } from '../../content/skills/skill-elements';
import type { Enemy, SimState } from '../state';
import { grantExp } from '../progression/growth';

export interface HitPayload {
  damage: number;
  status: StatusSpec | null;
  lifestealPct: number;
  explodePct: number;
  canCrit: boolean;
}

/** 틱마다 한 번 계산해 전투 시스템 전체에 전달되는 컨텍스트 */
export interface CombatCtx {
  rng: Rng;
  bus: EventBus;
  goldMult: number;
  damageMult: number; // 트리 보너스 — 발사 시점이 아닌 적용 시점에 곱한다
}

/** 크리티컬/취약을 반영한 최종 피해량 계산 (순수 함수 — 테스트 대상) */
export function computeHitAmount(
  rng: Rng,
  baseDamage: number,
  canCrit: boolean,
  vulnerability: number,
): { amount: number; crit: boolean } {
  let amount = baseDamage;
  let crit = false;
  if (canCrit && rng.chance(BALANCE.CRIT_CHANCE)) {
    amount *= BALANCE.CRIT_MULT;
    crit = true;
  }
  amount *= 1 + vulnerability;
  return { amount, crit };
}

/** 감전(shock) 중첩으로 인한 받는 피해 증가율 */
export function vulnerabilityOf(enemy: Enemy): number {
  let v = 0;
  for (const s of enemy.statuses) if (s.kind === 'shock') v += s.power;
  return v;
}

export function applyHit(state: SimState, ctx: CombatCtx, enemy: Enemy, p: HitPayload): void {
  if (enemy.hp <= 0) return; // 이번 틱에 이미 죽은 적

  const { amount, crit } = computeHitAmount(ctx.rng, p.damage * ctx.damageMult, p.canCrit, vulnerabilityOf(enemy));
  enemy.hp -= amount;
  ctx.bus.emit('cosmetic', { type: 'hit', x: enemy.x, y: enemy.y, amount: Math.round(amount), crit });

  if (p.status) {
    const existing = enemy.statuses.find((s) => s.kind === p.status!.kind);
    if (existing) {
      existing.ticksLeft = p.status.durationTicks;
      existing.power = Math.max(existing.power, p.status.power);
    } else {
      enemy.statuses.push({ kind: p.status.kind, power: p.status.power, ticksLeft: p.status.durationTicks });
    }
  }

  if (p.lifestealPct > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount * p.lifestealPct);
  }

  if (enemy.hp <= 0) {
    handleKill(state, ctx, enemy);
    if (p.explodePct > 0) {
      // 유폭: 처치 지점 주변 광역 — 재귀 유폭 방지를 위해 explodePct 0으로 전파
      const r = BALANCE.EXPLODE_RADIUS;
      for (const other of state.enemies) {
        if (other.hp <= 0 || other.id === enemy.id) continue;
        if (dist2(enemy.x, enemy.y, other.x, other.y) <= r * r) {
          applyHit(state, ctx, other, {
            damage: p.damage * p.explodePct,
            status: null,
            lifestealPct: 0,
            explodePct: 0,
            canCrit: false,
          });
        }
      }
      ctx.bus.emit('cosmetic', { type: 'explosion', x: enemy.x, y: enemy.y, radius: r });
    }
  }
}

/** 처치 보상 — DoT 등 applyHit을 거치지 않는 경로에서도 공용 사용 */
export function handleKill(state: SimState, ctx: CombatCtx, enemy: Enemy): void {
  state.player.gold += enemy.gold * ctx.goldMult;
  state.totals.gold += enemy.gold * ctx.goldMult;
  state.totals.kills++;
  state.stage.kills++;
  grantExp(state, ctx.bus, enemy.exp);
  ctx.bus.emit('cosmetic', { type: 'kill', x: enemy.x, y: enemy.y, defId: enemy.defId });
}
