import { describe, expect, it } from 'vitest';
import { nullBus } from '../src/core/event-bus';
import { Simulation } from '../src/sim/simulation';
import { makeMidgameState } from './helpers';

/**
 * 결정론 회귀 감시망 (§3.3): 같은 시드 + 같은 틱 수 → 완전히 동일한 상태.
 * 시나리오에 orbit(삼각함수 경로) + frost(상태이상) 스킬 장착을 반드시 포함한다.
 */
describe('결정론', () => {
  it('동일 시드로 1,000틱 × 2회 실행 → 상태 완전 일치', () => {
    const run = () => {
      const state = makeMidgameState(999);
      // makeMidgameState는 orbit_blade(삼각함수)와 nova를 장착한다
      expect(state.skills.equipped[0]).toContain('orbit_blade');
      const sim = new Simulation(state, nullBus());
      for (let i = 0; i < 1000; i++) sim.tick();
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });

  it('중간 직렬화 후 이어 돌려도 결과 동일 (rngState 왕복)', () => {
    // 한 번에 600틱
    const s1 = makeMidgameState(7);
    const sim1 = new Simulation(s1, nullBus());
    for (let i = 0; i < 600; i++) sim1.tick();

    // 300틱 → 상태 클론(직렬화 경유와 동일) → 새 Simulation으로 300틱
    const s2 = makeMidgameState(7);
    const sim2 = new Simulation(s2, nullBus());
    for (let i = 0; i < 300; i++) sim2.tick();
    const resumed = structuredClone(s2);
    const sim3 = new Simulation(resumed, nullBus());
    for (let i = 0; i < 300; i++) sim3.tick();

    expect(JSON.stringify(resumed)).toBe(JSON.stringify(s1));
  });

  it('다른 시드 → 다른 전개 (시드가 실제로 쓰이는지 확인)', () => {
    const run = (seed: number) => {
      const state = makeMidgameState(seed);
      const sim = new Simulation(state, nullBus());
      for (let i = 0; i < 500; i++) sim.tick();
      return JSON.stringify(state);
    };
    expect(run(1)).not.toBe(run(2));
  });
});
