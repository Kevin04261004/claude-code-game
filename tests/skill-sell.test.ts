/** 스킬 판매 — 판매가 공식과 sellSkill 명령 검증 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { nullBus } from '../src/core/event-bus';
import { skillRollCost, skillSellPrice, skillUpgradeCost } from '../src/sim/progression/growth';
import { Simulation } from '../src/sim/simulation';
import { makeMidgameState } from './helpers';

describe('스킬 판매가 공식', () => {
  it('최저 등급 Lv.1 무변형 = SKILL_SELL_BASE', () => {
    expect(skillSellPrice(0, 1, 0)).toBe(BALANCE.SKILL_SELL_BASE);
  });

  it('등급이 오르면 기본가는 2배씩', () => {
    for (let g = 0; g < 4; g++) {
      expect(skillSellPrice(g + 1, 1, 0)).toBe(skillSellPrice(g, 1, 0) * BALANCE.SKILL_SELL_GRADE_MULT);
    }
  });

  it('변형 옵션은 기본가에 +25%씩 가산', () => {
    expect(skillSellPrice(0, 1, 1)).toBe(Math.floor(BALANCE.SKILL_SELL_BASE * 1.25));
    expect(skillSellPrice(0, 1, 2)).toBe(Math.floor(BALANCE.SKILL_SELL_BASE * 1.5));
  });

  it('강화 투자금의 50%가 환급된다', () => {
    const invested = skillUpgradeCost(2, 1) + skillUpgradeCost(2, 2); // Lv.1→3 비용
    expect(skillSellPrice(2, 3, 0)).toBe(
      Math.floor(skillSellPrice(2, 1, 0) + BALANCE.SKILL_SELL_UPGRADE_REFUND * invested),
    );
  });

  it('레벨이 오르면 판매가는 단조 증가', () => {
    for (let lv = 1; lv < 50; lv++) {
      expect(skillSellPrice(1, lv + 1, 0)).toBeGreaterThan(skillSellPrice(1, lv, 0));
    }
  });

  it('판매가는 첫 추첨 비용보다 싸다 — 추첨→판매 반복으로 이득 불가', () => {
    // 무변형 최고 등급 Lv.1이라도 판매가 < 추첨가여야 순환 이득이 없다.
    // (등급 4 = 2^4 × 30 = 480G > 60G이지만, 해당 등급 확률은 1/16이라 기대값은 손해)
    expect(skillSellPrice(0, 1, 2)).toBeLessThan(skillRollCost(0));
  });
});

describe('sellSkill 명령', () => {
  it('보유 목록 제거 + 장착 해제 + 골드 환급', () => {
    const state = makeMidgameState();
    const sim = new Simulation(state, nullBus());
    const target = 'orbit_blade:frost:rare';
    const owned = state.skills.owned.find((s) => s.id === target)!;
    const goldBefore = state.player.gold;
    // rare = gradeIndex 2, 무변형
    const expected = skillSellPrice(2, owned.level, 0);

    expect(sim.execute({ type: 'sellSkill', skillId: target })).toBe(true);
    expect(state.skills.owned.some((s) => s.id === target)).toBe(false);
    expect(state.skills.equipped.includes(target)).toBe(false);
    expect(state.player.gold).toBe(goldBefore + expected);
  });

  it('변형 옵션 개수가 판매가에 반영된다', () => {
    const state = makeMidgameState();
    const sim = new Simulation(state, nullBus());
    const target = 'nova:fire:uncommon:giant'; // gradeIndex 1, 변형 1개
    const owned = state.skills.owned.find((s) => s.id === target)!;
    const goldBefore = state.player.gold;
    const expected = skillSellPrice(1, owned.level, 1);

    expect(sim.execute({ type: 'sellSkill', skillId: target })).toBe(true);
    expect(state.player.gold).toBe(goldBefore + expected);
  });

  it('없는 스킬은 판매 불가', () => {
    const state = makeMidgameState();
    const sim = new Simulation(state, nullBus());
    const goldBefore = state.player.gold;
    expect(sim.execute({ type: 'sellSkill', skillId: 'nova:fire:common' })).toBe(false);
    expect(state.player.gold).toBe(goldBefore);
  });
});
