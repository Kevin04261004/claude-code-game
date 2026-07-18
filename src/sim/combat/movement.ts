/**
 * 이동: 적은 중앙(플레이어)으로 수렴, 투사체는 직진.
 * 이동 전 좌표를 px/py에 보관 → 렌더러가 틱 사이를 보간(§3.1).
 * 접촉 피해와 재생도 여기서 처리한다(프레임 순서상 이동과 결합이 자연스러움).
 */
import { BALANCE } from '../../config/balance';
import type { SimState } from '../state';
import { slowMultOf } from './status-effects';

export function tickMovement(state: SimState, regenPerSec: number): void {
  const contactR = BALANCE.PLAYER_RADIUS;

  for (const e of state.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.hp <= 0) continue;
    const d = Math.sqrt(e.x * e.x + e.y * e.y);
    const stopAt = contactR + e.radius;
    if (d <= stopAt) {
      // 접촉 중: 이동하지 않고 접촉 피해
      state.player.hp -= e.touchDps / BALANCE.TPS;
      continue;
    }
    const step = (e.speed / BALANCE.TPS) * slowMultOf(e.statuses);
    const move = Math.min(step, d - stopAt);
    e.x -= (e.x / d) * move;
    e.y -= (e.y / d) * move;
  }

  for (const p of state.projectiles) {
    p.px = p.x;
    p.py = p.y;
    if (p.dead) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.ttl--;
    const limit = BALANCE.SPAWN_RADIUS + 60;
    if (p.ttl <= 0 || p.x * p.x + p.y * p.y > limit * limit) p.dead = true;
  }

  // 재생 (트리 보너스 포함 값이 인자로 들어온다)
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + regenPerSec / BALANCE.TPS);
}
