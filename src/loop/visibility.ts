/**
 * 백그라운드/복귀 전환 처리 (ARCHITECTURE.md §3.2)
 * 숨김: 즉시 저장 후 완전 정지 (setInterval 폴백 없음 — CPU 예산 0).
 * 복귀: 경과 < 임계 → 실제 틱 재생(누적기 주입) / 이상 → 오프라인 정산.
 */
import type { IClock } from '../app/ports';
import { BALANCE } from '../config/balance';
import { settleOffline, type SettlementReport } from '../sim/offline/offline-settlement';
import type { Simulation } from '../sim/simulation';
import type { GameLoop } from './game-loop';

export interface VisibilityDeps {
  clock: IClock;
  sim: Simulation;
  loop: GameLoop;
  saveNow: () => void;
  onSettled: (report: SettlementReport) => void;
}

export function registerVisibility(deps: VisibilityDeps): void {
  let hiddenAt: number | null = null;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = deps.clock.now();
      deps.saveNow();
      deps.loop.stop();
    } else {
      const elapsed = hiddenAt === null ? 0 : Math.max(0, deps.clock.now() - hiddenAt);
      hiddenAt = null;
      if (elapsed >= BALANCE.OFFLINE_MIN_MS) {
        const report = settleOffline(deps.sim.state, elapsed);
        deps.saveNow();
        deps.onSettled(report);
      } else {
        deps.loop.addCatchupMs(elapsed);
      }
      deps.loop.start();
    }
  });

  // 탭 닫힘 직전 마지막 저장
  window.addEventListener('pagehide', () => deps.saveNow());
}
