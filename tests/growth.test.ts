import { describe, expect, it } from 'vitest';
import { nullBus } from '../src/core/event-bus';
import { WEAPONS } from '../src/content/weapons';
import {
  expToNext,
  grantExp,
  killsToClear,
  maxHpFor,
  skillRollCost,
  skillUpgradeCost,
  weaponDamage,
  weaponTier,
  weaponUpgradeCost,
} from '../src/sim/progression/growth';
import { makeState } from './helpers';

describe('성장 곡선', () => {
  it('경험치 요구량은 단조 증가', () => {
    for (let lv = 1; lv < 100; lv++) {
      expect(expToNext(lv + 1)).toBeGreaterThan(expToNext(lv));
    }
  });

  it('무기 강화 비용/데미지는 단조 증가', () => {
    const def = WEAPONS['laser']!;
    for (let lv = 1; lv < 100; lv++) {
      expect(weaponUpgradeCost(def, lv + 1)).toBeGreaterThan(weaponUpgradeCost(def, lv));
      expect(weaponDamage(def, lv + 1)).toBeGreaterThan(weaponDamage(def, lv));
    }
  });

  it('스킬 추첨/강화 비용은 단조 증가', () => {
    for (let n = 0; n < 50; n++) {
      expect(skillRollCost(n + 1)).toBeGreaterThan(skillRollCost(n));
    }
    for (let lv = 1; lv < 50; lv++) {
      expect(skillUpgradeCost(2, lv + 1)).toBeGreaterThan(skillUpgradeCost(2, lv));
    }
  });

  it('스테이지 클리어 요구 처치 수는 단조 증가', () => {
    for (let i = 0; i < 100; i++) {
      expect(killsToClear(i + 1)).toBeGreaterThanOrEqual(killsToClear(i));
    }
  });
});

describe('grantExp', () => {
  it('여러 레벨을 한 번에 오르며 잉여 경험치가 이월된다', () => {
    const state = makeState();
    const need1 = expToNext(1);
    const need2 = expToNext(2);
    const extra = 7;
    grantExp(state, nullBus(), need1 + need2 + extra);
    expect(state.player.level).toBe(3);
    expect(state.player.exp).toBe(extra);
  });

  it('레벨업 시 최대 체력이 공식대로 갱신되고 증가분만큼 회복', () => {
    const state = makeState();
    state.player.hp = 10;
    grantExp(state, nullBus(), expToNext(1));
    expect(state.player.maxHp).toBe(maxHpFor(2));
    expect(state.player.hp).toBe(10 + (maxHpFor(2) - maxHpFor(1)));
  });
});

describe('weaponTier', () => {
  it('10레벨마다 티어 상승, 최종 티어에서 고정', () => {
    const def = WEAPONS['laser']!;
    expect(weaponTier(def, 1)).toBe(0);
    expect(weaponTier(def, 10)).toBe(0);
    expect(weaponTier(def, 11)).toBe(1);
    expect(weaponTier(def, 9999)).toBe(def.tiers.length - 1);
  });
});
