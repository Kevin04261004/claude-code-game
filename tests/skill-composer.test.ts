import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  decodeSkillId,
  encodeSkillId,
  normalizeSkillId,
  rollSkillCombo,
} from '../src/sim/skills/skill-catalog';
import { composeSkill } from '../src/sim/skills/skill-composer';

describe('스킬 ID 인코딩/디코딩', () => {
  it('랜덤 조합 1,000개 왕복: encode(decode(id)) === id', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const id = encodeSkillId(rollSkillCombo(rng, 100)); // 전 등급 개방 상태
      expect(encodeSkillId(decodeSkillId(id))).toBe(id);
    }
  });

  it('★ mods 순서가 뒤바뀐 입력 → 동일한 정규 ID (§4.3)', () => {
    expect(normalizeSkillId('magic_bolt:fire:rare:pierce+multishot')).toBe(
      normalizeSkillId('magic_bolt:fire:rare:multishot+pierce'),
    );
    expect(normalizeSkillId('magic_bolt:fire:rare:multishot+pierce')).toBe(
      'magic_bolt:fire:rare:multishot+pierce', // 사전순: multishot < pierce
    );
  });

  it('순서가 다른 입력도 합성 수치는 완전히 동일 (적용 순서 = 사전순 고정)', () => {
    const a = composeSkill('magic_bolt:fire:rare:pierce+multishot', 3);
    const b = composeSkill('magic_bolt:fire:rare:multishot+pierce', 3);
    expect(a).toEqual(b);
  });

  it('금지 조합 거부: 장판(aura)에 관통', () => {
    expect(() => decodeSkillId('aura:fire:common:pierce')).toThrow();
  });

  it('무효 ID 거부', () => {
    expect(() => decodeSkillId('nonsense')).toThrow();
    expect(() => decodeSkillId('magic_bolt:unknown_element:common')).toThrow();
    expect(() => decodeSkillId('magic_bolt:fire:common:pierce+pierce')).toThrow(); // 중복 mod
  });
});

describe('composeSkill 합성 순서 (base → element → grade → mods 사전순)', () => {
  it('알려진 조합의 수치가 공식과 정확히 일치', () => {
    // orbit_blade(6) × frost(0.9) × epic(3.38) × lifesteal(0.95) × multishot(0.7), 레벨 1
    const inst = composeSkill('orbit_blade:frost:epic:lifesteal+multishot', 1);
    expect(inst.damage).toBe(6 * 0.9 * 3.38 * 0.95 * 0.7);
    expect(inst.count).toBe(2 + 2); // base 2 + multishot countAdd 2
    expect(inst.lifestealPct).toBe(0.02);
    expect(inst.behavior).toBe('orbit');
  });

  it('스킬 레벨은 데미지 성장 배율로 반영', () => {
    const l1 = composeSkill('nova:void:common', 1);
    const l2 = composeSkill('nova:void:common', 2);
    expect(l2.damage).toBeGreaterThan(l1.damage);
  });

  it('같은 ID + 같은 레벨 → 항상 같은 인스턴스 (결정론)', () => {
    const a = composeSkill('piercing_lance:lightning:legendary:farshot+heavy', 7);
    const b = composeSkill('piercing_lance:lightning:legendary:farshot+heavy', 7);
    expect(a).toEqual(b);
  });
});
