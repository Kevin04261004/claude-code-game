/**
 * 리더보드 점수 산출 — ILeaderboard 구현체(local/remote)와 무관한 공통 로직.
 * 점수 공식은 결정론적이라 추후 서버가 재현·검증할 수 있다.
 */
import type { SimState } from '../sim/state';
import { playerScore } from '../sim/progression/growth';

export function currentScore(state: SimState): number {
  return playerScore(state);
}

/** bestScore 갱신 (저장 직전 호출) */
export function updateBestScore(state: SimState): void {
  const score = playerScore(state);
  if (score > state.leaderboard.bestScore) state.leaderboard.bestScore = score;
}
