/** 테스트 공용 헬퍼 — 시뮬 상태/적 생성 */
import { nullBus } from '../src/core/event-bus';
import { Rng } from '../src/core/rng';
import { newGameState } from '../src/save/serializer';
import type { CombatCtx } from '../src/sim/combat/damage';
import type { Enemy, SimState } from '../src/sim/state';

export function makeState(seed = 12345): SimState {
  return newGameState(seed, 0);
}

/** 전투가 안정적으로 굴러가는 중반 빌드 상태 */
export function makeMidgameState(seed = 12345): SimState {
  const state = makeState(seed);
  state.weapons[0]!.level = 25;
  state.player.level = 20;
  state.player.gold = 1_000_000;
  state.stage.index = 2;
  state.stage.highestIndex = 2;
  state.skills.owned = [
    { id: 'orbit_blade:frost:rare', level: 3 },
    { id: 'nova:fire:uncommon:giant', level: 2 },
  ];
  state.skills.equipped = ['orbit_blade:frost:rare', 'nova:fire:uncommon:giant', null, null];
  state.skills.treeNodes = ['regen_1', 'dmg_1'];
  return state;
}

export function makeEnemy(id: number, x: number, y: number, hp = 100): Enemy {
  return {
    id,
    defId: 'slime',
    x,
    y,
    px: x,
    py: y,
    hp,
    maxHp: hp,
    speed: 36,
    touchDps: 8,
    gold: 10,
    exp: 5,
    radius: 10,
    statuses: [],
    attack: 'contact', // 전투 테스트 기본값 — 공격 방식 테스트는 개별 필드를 덮어쓴다
    fireCooldown: 0,
  };
}

export function makeCtx(seed = 1, goldMult = 1, damageMult = 1): CombatCtx {
  return { rng: new Rng(seed), bus: nullBus(), goldMult, damageMult };
}
