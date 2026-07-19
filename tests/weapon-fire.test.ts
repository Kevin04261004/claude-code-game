/** 무기 행동 4종 (src/sim/combat/weapon-fire.ts) + 구 세이브 무기 이전 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { WEAPONS } from '../src/content/weapons';
import { EventBus } from '../src/core/event-bus';
import { Rng } from '../src/core/rng';
import { fromSave, toSave } from '../src/save/serializer';
import { SpatialGrid, resolveProjectiles } from '../src/sim/combat/collision';
import type { CombatCtx } from '../src/sim/combat/damage';
import { tickWeapon } from '../src/sim/combat/weapon-fire';
import { beamTickDamage, sweepIntervalTicks } from '../src/sim/progression/growth';
import type { SimState } from '../src/sim/state';
import { makeEnemy, makeState } from './helpers';

function equip(state: SimState, weaponId: string): void {
  for (const w of state.weapons) w.equipped = w.weaponId === weaponId;
}

/** 'hit' 코스메틱 이벤트 횟수를 세는 ctx — 타격 횟수 검증용 */
function countingCtx(seed = 1): { ctx: CombatCtx; hits: () => number } {
  const bus = new EventBus();
  let n = 0;
  bus.on('hit', () => n++);
  return { ctx: { rng: new Rng(seed), bus, goldMult: 1, damageMult: 1 }, hits: () => n };
}

function builtGrid(state: SimState): SpatialGrid {
  const grid = new SpatialGrid();
  grid.build(state.enemies);
  return grid;
}

describe('weapon-fire', () => {
  it('bolt(레이저): 가장 가까운 적 방향으로 무기 색 투사체를 발사한다', () => {
    const s = makeState();
    equip(s, 'laser');
    s.enemies.push(makeEnemy(1, 100, 0));
    const { ctx } = countingCtx();
    tickWeapon(s, builtGrid(s), ctx);
    expect(s.projectiles).toHaveLength(1);
    expect(s.projectiles[0]!.tint).toBe(WEAPONS['laser']!.tint);
    expect(s.projectiles[0]!.aoeRadius).toBe(0);
    expect(s.cooldowns['weapon']).toBe(WEAPONS['laser']!.cooldownTicks);
  });

  it('shell(플라즈마 포): 착탄 시 직격 대상 외 주변 적에게 aoePct 비율 피해', () => {
    const s = makeState();
    const direct = makeEnemy(1, 0, 0, 10_000);
    const near = makeEnemy(2, 30, 0, 10_000); // 반경 60 안
    const far = makeEnemy(3, 300, 0, 10_000); // 반경 밖
    s.enemies.push(direct, near, far);
    const dmg = 100;
    s.projectiles.push({
      id: 1, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
      damage: dmg, radius: 9, pierceLeft: 0, ttl: 10,
      elementId: null, status: null, lifestealPct: 0, explodePct: 0,
      aoePct: BALANCE.CANNON_AOE_PCT, aoeRadius: BALANCE.CANNON_AOE_RADIUS,
      canCrit: false, tint: null, styleKey: 'weapon', gradeIndex: 0, hitIds: [], dead: false,
    });
    const { ctx } = countingCtx();
    resolveProjectiles(s, builtGrid(s), ctx);
    expect(direct.hp).toBe(10_000 - dmg);
    expect(near.hp).toBe(10_000 - dmg * BALANCE.CANNON_AOE_PCT);
    expect(far.hp).toBe(10_000);
    expect(s.projectiles[0]!.dead).toBe(true); // 관통 없음
  });

  it('beam(광자 빔): 사거리 내 가장 가까운 적에게 주기마다 지속 피해 (크리 없음 — 정확한 수치)', () => {
    const s = makeState();
    equip(s, 'beam');
    const e = makeEnemy(1, 100, 0, 10_000);
    s.enemies.push(e);
    const { ctx } = countingCtx();
    s.tick = BALANCE.BEAM_HIT_PERIOD_TICKS; // 적용 틱
    tickWeapon(s, builtGrid(s), ctx);
    const def = WEAPONS['beam']!;
    expect(e.hp).toBeCloseTo(10_000 - beamTickDamage(def, 1), 6);
    expect(s.projectiles).toHaveLength(0); // 투사체 없음 — 즉시 적용
  });

  it('beam: 사거리 밖이면 피해 없음', () => {
    const s = makeState();
    equip(s, 'beam');
    const e = makeEnemy(1, BALANCE.BEAM_RANGE + e_radius() + 50, 0, 10_000);
    s.enemies.push(e);
    const { ctx } = countingCtx();
    s.tick = BALANCE.BEAM_HIT_PERIOD_TICKS;
    tickWeapon(s, builtGrid(s), ctx);
    expect(e.hp).toBe(10_000);
  });

  it('sweep(회전 광선): 1회전 동안 반경 내 적을 정확히 1번씩 타격한다', () => {
    const s = makeState();
    equip(s, 'sweep');
    // 서로 다른 사분면의 적 3 + 반경 밖 1
    s.enemies.push(makeEnemy(1, 100, 10, 1e9), makeEnemy(2, -80, 60, 1e9), makeEnemy(3, 20, -120, 1e9), makeEnemy(4, 500, 0, 1e9));
    const { ctx, hits } = countingCtx();
    for (let t = 0; t < BALANCE.SWEEP_DURATION_TICKS; t++) {
      tickWeapon(s, builtGrid(s), ctx);
    }
    expect(hits()).toBe(3); // 반경 내 3마리 × 1회씩
    // 회전이 끝나면 대기 주기로 들어간다
    expect(s.cooldowns['weaponSweep']).toBe(0);
    expect(s.cooldowns['weapon']).toBe(sweepIntervalTicks(WEAPONS['sweep']!, 1));
  });

  it('sweep: 반경 안에 적이 없으면 회전을 시작하지 않는다 (빈 회전 방지)', () => {
    const s = makeState();
    equip(s, 'sweep');
    s.enemies.push(makeEnemy(1, 500, 0));
    const { ctx, hits } = countingCtx();
    tickWeapon(s, builtGrid(s), ctx);
    expect(hits()).toBe(0);
    expect(s.cooldowns['weaponSweep'] ?? 0).toBe(0);
  });

  it('sweep: 레벨이 오르면 주기가 짧아지고 하한에서 멈춘다', () => {
    const def = WEAPONS['sweep']!;
    expect(sweepIntervalTicks(def, 1)).toBe(def.cooldownTicks);
    expect(sweepIntervalTicks(def, 1 + 2 * BALANCE.SWEEP_INTERVAL_REDUCE_LEVELS)).toBeLessThan(def.cooldownTicks);
    expect(sweepIntervalTicks(def, 9999)).toBe(BALANCE.SWEEP_MIN_INTERVAL_TICKS);
  });
});

describe('구 세이브 무기 이전', () => {
  it('blade/wand 세이브 → laser/cannon으로 레벨·장착 유지, 새 무기는 1레벨로 채워진다', () => {
    const save = toSave(makeState(), 0);
    save.weapons = [
      { weaponId: 'blade', level: 12, equipped: true },
      { weaponId: 'wand', level: 5, equipped: false },
    ];
    const state = fromSave(save);
    const byId = new Map(state.weapons.map((w) => [w.weaponId, w]));
    expect(byId.get('laser')).toMatchObject({ level: 12, equipped: true });
    expect(byId.get('cannon')).toMatchObject({ level: 5, equipped: false });
    expect(byId.get('beam')).toMatchObject({ level: 1, equipped: false });
    expect(byId.get('sweep')).toMatchObject({ level: 1, equipped: false });
    expect(byId.has('blade')).toBe(false);
  });

  it('장착 무기가 하나도 없으면 첫 무기를 장착한다', () => {
    const save = toSave(makeState(), 0);
    save.weapons = [{ weaponId: 'unknown-mod-weapon', level: 3, equipped: true }];
    const state = fromSave(save);
    expect(state.weapons.filter((w) => w.equipped)).toHaveLength(1);
  });
});

function e_radius(): number {
  return 10; // makeEnemy 기본 반경
}
