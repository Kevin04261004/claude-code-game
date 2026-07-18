/**
 * 오프라인 정산 — 표본 측정 + 구간 외삽 (ARCHITECTURE.md §5.2)
 *
 * 처치율을 스탯 수식으로 추정하지 않고, 현재 상태 사본으로 실제 전투를
 * 헤드리스 실행해 측정한다 — 전투 코드 자체가 곧 모델이므로 근사 모델과
 * 실제 시뮬이 어긋나는 이중 유지보수가 원리적으로 없다.
 *
 * 측정값은 "그 스테이지의 정상 상태"에서만 유효하므로, 외삽 구간은
 * [스테이지 클리어 시점 / 청크 경계 / 남은 시간] 중 먼저 오는 지점까지만
 * 진행하고, 빌드가 유의미하게 바뀌면(스테이지 전진, 누적 레벨업 ≥ DELTA)
 * 그 시점에 재측정한다. 재측정 횟수는 상한으로 보호한다.
 */
import { BALANCE } from '../../config/balance';
import { nullBus } from '../../core/event-bus';
import { grantExp, killsToClear } from '../progression/growth';
import { offlineCapHours } from '../progression/skill-tree';
import { Simulation } from '../simulation';
import type { SimState } from '../state';

export interface SettlementReport {
  elapsedMs: number;
  effectiveSec: number; // 효율/상한 적용 후 정산된 초
  cappedByHours: number; // 적용된 상한(시간)
  gold: number;
  exp: number;
  kills: number;
  fromLevel: number;
  toLevel: number;
  fromStage: number;
  toStage: number;
  resamples: number; // 표본 측정 횟수 (검증/디버그용)
}

interface Rates {
  killsPerSec: number;
  goldPerSec: number;
  expPerSec: number;
  /** 측정 중 사망 발생 — 이 스테이지는 "벽": 전진 대신 정체로 모델링 (§5.2) */
  died: boolean;
}

/** 상태 사본으로 워밍업 + 표본 틱을 돌려 정상 상태 처치/보상율 측정 */
function measureRates(state: SimState): Rates {
  const clone = structuredClone(state);
  // 측정은 빈 전투장에서 시작해 워밍업으로 밀도를 채운 뒤 계측한다
  clone.enemies = [];
  clone.projectiles = [];
  clone.cooldowns = {};
  clone.spawnAcc = 0;
  const bus = nullBus();
  let deaths = 0;
  bus.on('playerDied', () => deaths++);
  const sim = new Simulation(clone, bus);
  for (let i = 0; i < BALANCE.OFFLINE_SAMPLE_WARMUP_TICKS; i++) sim.tick();
  const k0 = clone.totals.kills;
  const g0 = clone.totals.gold;
  const e0 = clone.totals.exp;
  for (let i = 0; i < BALANCE.OFFLINE_SAMPLE_TICKS; i++) sim.tick();
  const sec = BALANCE.OFFLINE_SAMPLE_TICKS / BALANCE.TPS;
  return {
    killsPerSec: (clone.totals.kills - k0) / sec,
    goldPerSec: (clone.totals.gold - g0) / sec,
    expPerSec: (clone.totals.exp - e0) / sec,
    died: deaths > 0,
  };
}

/**
 * 오프라인 경과를 state에 반영하고 리포트를 반환한다.
 * elapsedMs가 음수(시계 되돌림)면 0으로 클램프 (§3.2).
 */
export function settleOffline(state: SimState, elapsedMs: number): SettlementReport {
  const elapsed = Math.max(0, elapsedMs);
  const capHours = offlineCapHours(state);
  const capSec = capHours * 3600;
  const elapsedSec = elapsed / 1000;
  // 상한 내 구간은 기본 효율, 초과 구간은 감쇄 효율로 적립 (§5.3)
  const effectiveSec =
    Math.min(elapsedSec, capSec) * BALANCE.OFFLINE_EFFICIENCY +
    Math.max(0, elapsedSec - capSec) * BALANCE.OFFLINE_OVERCAP_EFFICIENCY;

  const report: SettlementReport = {
    elapsedMs: elapsed,
    effectiveSec,
    cappedByHours: capHours,
    gold: 0,
    exp: 0,
    kills: 0,
    fromLevel: state.player.level,
    toLevel: state.player.level,
    fromStage: state.stage.index,
    toStage: state.stage.index,
    resamples: 0,
  };
  if (effectiveSec <= 0) return report;

  const bus = nullBus();
  const chunkSec = BALANCE.OFFLINE_CHUNK_MINUTES * 60;
  let rates = measureRates(state);
  report.resamples = 1;
  let levelAtSample = state.player.level;
  let remaining = effectiveSec;
  let guard = 0;

  while (remaining > 0 && guard++ < 100_000) {
    const idx = state.stage.index;
    // 이번 구간: 스테이지 클리어 / 청크 경계 / 남은 시간 중 먼저 오는 지점까지.
    // 측정 중 사망한 "벽" 스테이지에서는 전진하지 않는다 (사망 페널티로 정체하는
    // 실제 전투와 일치). 레벨업으로 재측정되면 벽 돌파 여부가 다시 판정된다.
    const atWall = rates.died;
    const toClear = killsToClear(idx) - state.stage.kills;
    const timeToClear = !atWall && rates.killsPerSec > 0 ? toClear / rates.killsPerSec : Infinity;
    const step = Math.min(remaining, chunkSec, timeToClear);

    const goldGain = rates.goldPerSec * step;
    state.player.gold += goldGain;
    state.totals.gold += goldGain;
    report.gold += goldGain;

    grantExp(state, bus, rates.expPerSec * step);
    report.exp += rates.expPerSec * step;

    const kills = rates.killsPerSec * step;
    state.totals.kills += kills;
    state.stage.kills += kills;
    report.kills += kills;
    remaining -= step;

    let stageAdvanced = false;
    if (atWall) {
      // 벽에서는 처치가 쌓여도 클리어 직전에서 멈춘다 (사망 → -1 반복의 순효과)
      state.stage.kills = Math.min(state.stage.kills, killsToClear(idx) - 1);
    } else if (state.stage.kills >= killsToClear(idx) - 1e-9) {
      state.stage.kills = 0;
      state.stage.index++;
      if (state.stage.index > state.stage.highestIndex) state.stage.highestIndex = state.stage.index;
      stageAdvanced = true;
    }

    // 재측정: 빌드가 유의미하게 바뀐 시점에서만 (§5.2). 횟수 상한으로 비용 보호 —
    // 상한 초과 후에는 마지막 측정값을 유지한다 (후반 성장 과소평가 쪽으로 보수적)
    const levelDelta = state.player.level - levelAtSample;
    if (
      remaining > 0 &&
      (stageAdvanced || levelDelta >= BALANCE.RESAMPLE_LEVEL_DELTA) &&
      report.resamples < BALANCE.OFFLINE_MAX_RESAMPLES
    ) {
      rates = measureRates(state);
      report.resamples++;
      levelAtSample = state.player.level;
    }
  }

  // 정산 중 소수로 누적된 처치 수를 정수로 정리
  state.stage.kills = Math.floor(state.stage.kills);
  state.totals.kills = Math.floor(state.totals.kills);
  report.kills = Math.floor(report.kills);

  report.toLevel = state.player.level;
  report.toStage = state.stage.index;
  return report;
}
