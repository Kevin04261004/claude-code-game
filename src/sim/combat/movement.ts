/**
 * 이동: 적은 중앙(플레이어)으로 수렴, 투사체는 직진.
 * 이동 전 좌표를 px/py에 보관 → 렌더러가 틱 사이를 보간(§3.1).
 * 적 공격(접촉/자폭/원거리 사격)과 재생도 여기서 처리한다
 * (프레임 순서상 이동과 결합이 자연스러움).
 */
import { BALANCE } from '../../config/balance';
import type { EventBus } from '../../core/event-bus';
import type { Enemy, SimState } from '../state';
import { slowMultOf } from './status-effects';

export function tickMovement(state: SimState, regenPerSec: number, bus: EventBus): void {
  const contactR = BALANCE.PLAYER_RADIUS;

  for (const e of state.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.hp <= 0) continue;
    const d = Math.sqrt(e.x * e.x + e.y * e.y);
    const touchAt = contactR + e.radius;
    // 원거리형은 사거리에서 멈춘다 (자폭/접촉형은 몸이 닿을 때까지 전진)
    const stopAt = e.attack === 'ranged' ? Math.max(touchAt, BALANCE.RANGED_ATTACK_RANGE) : touchAt;

    if (d <= stopAt) {
      switch (e.attack) {
        case 'contact':
          state.player.hp -= e.touchDps / BALANCE.TPS;
          break;
        case 'kamikaze':
          // 1회 폭발 피해 후 소멸 — 처치가 아니므로 보상/킬 카운트 없음
          state.player.hp -= e.touchDps * BALANCE.KAMIKAZE_DMG_MULT;
          e.hp = 0;
          bus.emit('cosmetic', { type: 'explosion', x: e.x, y: e.y, radius: e.radius * 2.5 });
          break;
        case 'ranged':
          fireAtPlayer(state, e, d);
          break;
      }
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

  // 적 탄환: 직진 → 플레이어 명중 판정 (플레이어는 원점 고정)
  for (const b of state.enemyProjectiles) {
    b.px = b.x;
    b.py = b.y;
    if (b.dead) continue;
    b.x += b.vx;
    b.y += b.vy;
    b.ttl--;
    const hitR = BALANCE.PLAYER_RADIUS + b.radius;
    if (b.x * b.x + b.y * b.y <= hitR * hitR) {
      state.player.hp -= b.damage;
      b.dead = true;
    } else if (b.ttl <= 0) {
      b.dead = true;
    }
  }

  // 재생 (트리 보너스 포함 값이 인자로 들어온다)
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + regenPerSec / BALANCE.TPS);
}

/** 사거리 안에서 쿨다운마다 플레이어를 향해 탄환 발사 */
function fireAtPlayer(state: SimState, e: Enemy, dist: number): void {
  if (e.fireCooldown > 0) {
    e.fireCooldown--;
    return;
  }
  e.fireCooldown = BALANCE.RANGED_FIRE_COOLDOWN_TICKS;
  const speed = BALANCE.RANGED_BULLET_SPEED / BALANCE.TPS;
  state.enemyProjectiles.push({
    id: state.nextId++,
    x: e.x,
    y: e.y,
    px: e.x,
    py: e.y,
    vx: (-e.x / dist) * speed,
    vy: (-e.y / dist) * speed,
    damage: e.touchDps * BALANCE.RANGED_BULLET_DMG_MULT,
    radius: BALANCE.RANGED_BULLET_RADIUS,
    ttl: BALANCE.ENEMY_BULLET_TTL_TICKS,
    dead: false,
  });
}
