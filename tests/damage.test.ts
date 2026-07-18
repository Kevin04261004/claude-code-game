import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { Rng } from '../src/core/rng';
import { applyHit, computeHitAmount, vulnerabilityOf } from '../src/sim/combat/damage';
import { makeCtx, makeEnemy, makeState } from './helpers';

describe('computeHitAmount', () => {
  it('크리 불가 시 기본 피해 그대로', () => {
    const { amount, crit } = computeHitAmount(new Rng(1), 100, false, 0);
    expect(amount).toBe(100);
    expect(crit).toBe(false);
  });

  it('취약(감전)은 곱연산으로 반영', () => {
    const { amount } = computeHitAmount(new Rng(1), 100, false, 0.25);
    expect(amount).toBeCloseTo(125);
  });

  it('크리 확률은 BALANCE.CRIT_CHANCE에 수렴', () => {
    const rng = new Rng(777);
    let crits = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      if (computeHitAmount(rng, 10, true, 0).crit) crits++;
    }
    expect(crits / n).toBeGreaterThan(BALANCE.CRIT_CHANCE - 0.02);
    expect(crits / n).toBeLessThan(BALANCE.CRIT_CHANCE + 0.02);
  });

  it('크리 시 피해는 CRIT_MULT배', () => {
    // seed를 바꿔가며 첫 crit 케이스를 찾는다 (결정론적이므로 항상 같은 결과)
    for (let seed = 0; seed < 100; seed++) {
      const r = computeHitAmount(new Rng(seed), 100, true, 0);
      if (r.crit) {
        expect(r.amount).toBe(100 * BALANCE.CRIT_MULT);
        return;
      }
    }
    throw new Error('100개 시드에서 크리 미발생 — CRIT_CHANCE 이상');
  });
});

describe('applyHit', () => {
  it('피해 적용 + 상태이상 부착', () => {
    const state = makeState();
    const enemy = makeEnemy(1, 50, 0, 1000);
    state.enemies.push(enemy);
    applyHit(state, makeCtx(), enemy, {
      damage: 100,
      status: { kind: 'shock', power: 0.25, durationTicks: 20 },
      lifestealPct: 0,
      explodePct: 0,
      canCrit: false,
    });
    expect(enemy.hp).toBeLessThan(1000);
    expect(vulnerabilityOf(enemy)).toBe(0.25);
  });

  it('처치 시 골드/경험치/처치 수 보상 (goldMult 반영)', () => {
    const state = makeState();
    const enemy = makeEnemy(1, 50, 0, 10);
    state.enemies.push(enemy);
    const gold0 = state.player.gold;
    applyHit(state, makeCtx(1, 2), enemy, {
      damage: 100,
      status: null,
      lifestealPct: 0,
      explodePct: 0,
      canCrit: false,
    });
    expect(enemy.hp).toBeLessThanOrEqual(0);
    expect(state.player.gold).toBe(gold0 + enemy.gold * 2);
    expect(state.totals.kills).toBe(1);
    expect(state.stage.kills).toBe(1);
  });

  it('흡혈은 가한 피해 비율만큼 회복', () => {
    const state = makeState();
    state.player.hp = 50;
    const enemy = makeEnemy(1, 50, 0, 1000);
    state.enemies.push(enemy);
    applyHit(state, makeCtx(), enemy, {
      damage: 100,
      status: null,
      lifestealPct: 0.1,
      explodePct: 0,
      canCrit: false,
    });
    expect(state.player.hp).toBe(60);
  });

  it('유폭은 주변 적에게 전파되고 연쇄 유폭은 없다', () => {
    const state = makeState();
    const victim = makeEnemy(1, 0, 0, 10);
    const near = makeEnemy(2, 30, 0, 10); // EXPLODE_RADIUS(60) 이내 → 50% 피해 5로 죽음
    const far = makeEnemy(3, 300, 0, 10);
    state.enemies.push(victim, near, far);
    applyHit(state, makeCtx(), victim, {
      damage: 100,
      status: null,
      lifestealPct: 0,
      explodePct: 0.5,
      canCrit: false,
    });
    expect(victim.hp).toBeLessThanOrEqual(0);
    expect(near.hp).toBeLessThanOrEqual(0);
    expect(far.hp).toBe(10);
    expect(state.totals.kills).toBe(2);
  });
});
