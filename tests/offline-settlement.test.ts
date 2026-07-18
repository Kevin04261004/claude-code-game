import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { nullBus } from '../src/core/event-bus';
import { settleOffline } from '../src/sim/offline/offline-settlement';
import { Simulation } from '../src/sim/simulation';
import { makeMidgameState } from './helpers';

describe('오프라인 정산 (표본 측정 + 청크 외삽)', () => {
  it('★ 30분 정산 vs 동일 유효시간 실제 틱 재생 — 골드/경험치 오차 ±10% (§5.2)', () => {
    const elapsedMs = 30 * 60_000;

    // 정산 경로
    const settled = makeMidgameState(555);
    const report = settleOffline(settled, elapsedMs);

    // 실제 재생 경로: 정산의 유효 초(효율 반영)만큼 실제 틱을 돌린다
    const replayed = makeMidgameState(555);
    const sim = new Simulation(replayed, nullBus());
    const ticks = Math.round(report.effectiveSec * BALANCE.TPS);
    const gold0 = replayed.totals.gold;
    const exp0 = replayed.totals.exp;
    for (let i = 0; i < ticks; i++) sim.tick();
    const replayGold = replayed.totals.gold - gold0;
    const replayExp = replayed.totals.exp - exp0;

    expect(report.gold).toBeGreaterThan(replayGold * 0.9);
    expect(report.gold).toBeLessThan(replayGold * 1.1);
    expect(report.exp).toBeGreaterThan(replayExp * 0.9);
    expect(report.exp).toBeLessThan(replayExp * 1.1);
  });

  it('시계 되돌림(음수 경과)은 0으로 클램프', () => {
    const state = makeMidgameState();
    const gold0 = state.player.gold;
    const report = settleOffline(state, -5000);
    expect(report.gold).toBe(0);
    expect(report.effectiveSec).toBe(0);
    expect(state.player.gold).toBe(gold0);
  });

  it('상한: 기본 16시간, 초과분은 감쇄 효율로만 적립 (§5.3)', () => {
    const state = makeMidgameState();
    const hours = 100;
    const report = settleOffline(state, hours * 3600_000);
    const capSec = BALANCE.OFFLINE_CAP_BASE_HOURS * 3600;
    const expected =
      capSec * BALANCE.OFFLINE_EFFICIENCY +
      (hours * 3600 - capSec) * BALANCE.OFFLINE_OVERCAP_EFFICIENCY;
    expect(report.cappedByHours).toBe(BALANCE.OFFLINE_CAP_BASE_HOURS);
    expect(report.effectiveSec).toBeCloseTo(expected, 5);
  });

  it("'시간 압축' 트리 노드가 상한을 확장한다", () => {
    const state = makeMidgameState();
    state.skills.treeNodes.push('time_1', 'time_2');
    const report = settleOffline(state, 1000);
    expect(report.cappedByHours).toBe(BALANCE.OFFLINE_CAP_BASE_HOURS + 16);
  });

  it('빌드 변화(스테이지 전진/레벨업)가 재측정을 트리거', () => {
    const state = makeMidgameState(321);
    // 4시간 → 유효 2시간 = 12청크. 중반 빌드면 스테이지/레벨이 반드시 오른다
    const report = settleOffline(state, 4 * 3600_000);
    expect(report.toStage).toBeGreaterThan(report.fromStage);
    expect(report.resamples).toBeGreaterThan(1);
  });

  it('정산은 상태에 실제로 반영된다 (골드/레벨/스테이지)', () => {
    const state = makeMidgameState(111);
    const gold0 = state.player.gold;
    const report = settleOffline(state, 2 * 3600_000);
    expect(state.player.gold).toBeCloseTo(gold0 + report.gold, 5);
    expect(state.player.level).toBe(report.toLevel);
    expect(state.stage.index).toBe(report.toStage);
  });
});
