/**
 * 스테이지 데이터 기반 적 스폰. 스폰율/스탯 배율은 growth.ts 공식으로 결정.
 */
import { BALANCE } from '../../config/balance';
import { dCos, dSin, TWO_PI } from '../../core/math';
import type { Rng } from '../../core/rng';
import { ENEMIES } from '../../content/enemies';
import { STAGE_CYCLE } from '../../content/stages';
import type { SimState } from '../state';
import { enemyHpMult, rewardMult, spawnRate } from '../progression/growth';

export function tickSpawner(state: SimState, rng: Rng): void {
  state.spawnAcc += spawnRate(state.stage.index) / BALANCE.TPS;
  while (state.spawnAcc >= 1) {
    state.spawnAcc -= 1;
    if (state.enemies.length >= BALANCE.ENEMY_CAP) continue; // 누적은 소모하되 캡 초과 스폰은 버림
    spawnOne(state, rng);
  }
}

function spawnOne(state: SimState, rng: Rng): void {
  const theme = STAGE_CYCLE[state.stage.index % STAGE_CYCLE.length]!;
  const idx = rng.weighted(theme.spawns.map((s) => s.weight));
  const def = ENEMIES[theme.spawns[idx]!.enemyId];
  if (!def) return;

  const angle = rng.next() * TWO_PI;
  const x = dCos(angle) * BALANCE.SPAWN_RADIUS;
  const y = dSin(angle) * BALANCE.SPAWN_RADIUS;
  const hpM = enemyHpMult(state.stage.index);
  const rwM = rewardMult(state.stage.index);

  state.enemies.push({
    id: state.nextId++,
    defId: def.id,
    x,
    y,
    px: x,
    py: y,
    hp: def.hp * hpM,
    maxHp: def.hp * hpM,
    speed: def.speed,
    touchDps: def.touchDps * hpM, // 접촉 피해도 스테이지에 따라 성장
    gold: def.gold * rwM,
    exp: def.exp * rwM,
    radius: def.radius,
    statuses: [],
    attack: def.attack,
    // 원거리형은 개체별로 초탄 시점을 어긋나게 — 일제사격 방지 (id 기반이라 결정론 유지)
    fireCooldown: def.attack === 'ranged' ? state.nextId % BALANCE.RANGED_FIRE_COOLDOWN_TICKS : 0,
  });
}
