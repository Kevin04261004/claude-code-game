/**
 * 대상 선정 — 플레이어(원점)에서 가장 가까운 적.
 * 배열 순회(id 오름차순)이므로 동거리 타이는 항상 낮은 id → 결정론 유지.
 */
import type { Enemy, SimState } from '../state';

export function nearestEnemy(state: SimState): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = e.x * e.x + e.y * e.y;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
