/**
 * 지속 효과(화상/맹독 DoT, 감속, 감전) 틱 처리.
 * DoT는 크리티컬 없이 직접 피해 — 처치 시 보상은 damage.ts의 handleKill 공용.
 */
import { BALANCE } from '../../config/balance';
import type { CombatCtx } from './damage';
import { handleKill } from './damage';
import type { SimState } from '../state';

export function tickStatuses(state: SimState, ctx: CombatCtx): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.statuses.length === 0) continue;
    let dot = 0;
    for (const s of enemy.statuses) {
      if (s.kind === 'burn' || s.kind === 'poison') dot += s.power;
      s.ticksLeft--;
    }
    if (dot > 0) {
      enemy.hp -= dot / BALANCE.TPS;
      if (enemy.hp <= 0) handleKill(state, ctx, enemy);
    }
    if (enemy.statuses.some((s) => s.ticksLeft <= 0)) {
      enemy.statuses = enemy.statuses.filter((s) => s.ticksLeft > 0);
    }
  }
}

/** 감속 중첩 → 이동 속도 배율 (movement.ts에서 사용) */
export function slowMultOf(statuses: { kind: string; power: number }[]): number {
  let slow = 0;
  for (const s of statuses) if (s.kind === 'slow') slow += s.power;
  return 1 - Math.min(BALANCE.SLOW_CAP, slow);
}
