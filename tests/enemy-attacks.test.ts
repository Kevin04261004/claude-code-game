/** 적 공격 방식 — 자폭(운석), 원거리 사격(정찰선), 접촉 지속 피해(위습) */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { nullBus } from '../src/core/event-bus';
import { tickMovement } from '../src/sim/combat/movement';
import { makeEnemy, makeState } from './helpers';

const CONTACT = BALANCE.PLAYER_RADIUS; // 반경 10 적이 몸을 붙일 수 있는 최소 중심 거리 + radius

describe('자폭형 (운석)', () => {
  it('접촉 시 touchDps × 배수의 1회 피해를 주고 소멸한다', () => {
    const state = makeState();
    const e = { ...makeEnemy(1, CONTACT + 10, 0), attack: 'kamikaze' as const };
    state.enemies.push(e);
    const hpBefore = state.player.hp;

    tickMovement(state, 0, nullBus());

    expect(state.player.hp).toBeCloseTo(hpBefore - e.touchDps * BALANCE.KAMIKAZE_DMG_MULT);
    expect(e.hp).toBe(0);
  });

  it('자폭은 처치 보상/킬 카운트를 주지 않는다', () => {
    const state = makeState();
    state.enemies.push({ ...makeEnemy(1, CONTACT + 10, 0), attack: 'kamikaze' as const });

    tickMovement(state, 0, nullBus());

    expect(state.player.gold).toBe(0);
    expect(state.totals.kills).toBe(0);
    expect(state.stage.kills).toBe(0);
  });

  it('접촉 전에는 피해 없이 전진만 한다', () => {
    const state = makeState();
    const e = { ...makeEnemy(1, 200, 0), attack: 'kamikaze' as const };
    state.enemies.push(e);
    const hpBefore = state.player.hp;

    tickMovement(state, 0, nullBus());

    expect(state.player.hp).toBe(hpBefore);
    expect(e.hp).toBeGreaterThan(0);
    expect(e.x).toBeLessThan(200);
  });
});

describe('원거리형 (외계 정찰선)', () => {
  it('사거리에서 멈추고 더 접근하지 않는다', () => {
    const state = makeState();
    const e = { ...makeEnemy(1, 300, 0), attack: 'ranged' as const, fireCooldown: 5 };
    state.enemies.push(e);

    for (let i = 0; i < 200; i++) tickMovement(state, 0, nullBus());

    expect(Math.sqrt(e.x * e.x + e.y * e.y)).toBeCloseTo(BALANCE.RANGED_ATTACK_RANGE, 5);
  });

  it('쿨다운이 끝나면 플레이어를 향해 탄환을 발사한다', () => {
    const state = makeState();
    state.enemies.push({
      ...makeEnemy(1, BALANCE.RANGED_ATTACK_RANGE, 0),
      attack: 'ranged' as const,
      fireCooldown: 0,
    });

    tickMovement(state, 0, nullBus());

    expect(state.enemyProjectiles).toHaveLength(1);
    const b = state.enemyProjectiles[0]!;
    expect(b.vx).toBeLessThan(0); // +x에서 원점(플레이어) 방향
    expect(b.vy).toBeCloseTo(0);
    expect(b.damage).toBeCloseTo(8 * BALANCE.RANGED_BULLET_DMG_MULT);
  });

  it('탄환이 플레이어에 닿으면 피해를 주고 소멸한다', () => {
    const state = makeState();
    state.enemies.push({
      ...makeEnemy(1, BALANCE.RANGED_ATTACK_RANGE, 0),
      attack: 'ranged' as const,
      fireCooldown: 0,
    });
    const hpBefore = state.player.hp;

    // 첫 발만 관찰: 사거리 80 → 명중까지 ~5틱, 두 번째 발사(쿨다운 25틱) 전에 멈춘다
    for (let i = 0; i < 10; i++) tickMovement(state, 0, nullBus());

    expect(state.player.hp).toBeCloseTo(hpBefore - 8 * BALANCE.RANGED_BULLET_DMG_MULT);
    expect(state.enemyProjectiles.every((b) => b.dead)).toBe(true);
  });

  it('연사 간격은 RANGED_FIRE_COOLDOWN_TICKS를 따른다', () => {
    const state = makeState();
    state.enemies.push({
      ...makeEnemy(1, BALANCE.RANGED_ATTACK_RANGE, 0),
      attack: 'ranged' as const,
      fireCooldown: 0,
    });

    // 첫 발 + 쿨다운 소진 + 둘째 발
    for (let i = 0; i < BALANCE.RANGED_FIRE_COOLDOWN_TICKS + 2; i++) tickMovement(state, 0, nullBus());

    expect(state.enemyProjectiles.filter((b) => !b.dead || b.dead).length).toBe(2);
  });
});

describe('접촉형 (외계 위습)', () => {
  it('접촉 중 초당 touchDps 피해를 지속해서 준다 (기존 동작 유지)', () => {
    const state = makeState();
    const e = makeEnemy(1, CONTACT + 10, 0); // attack: 'contact'
    state.enemies.push(e);
    const hpBefore = state.player.hp;

    for (let i = 0; i < BALANCE.TPS; i++) tickMovement(state, 0, nullBus());

    expect(state.player.hp).toBeCloseTo(hpBefore - e.touchDps);
    expect(e.hp).toBeGreaterThan(0); // 접촉해도 죽지 않는다
  });
});
