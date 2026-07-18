/**
 * 로컬 시뮬레이션 리더보드 — 가상 경쟁자의 점수를 경과 시간 기반으로 생성.
 * 표시 전용이므로 sim 결정론 제약(자체 수학 함수)을 받지 않는다.
 */
import type { ILeaderboard, LeaderboardEntry } from '../app/ports';
import { BALANCE } from '../config/balance';
import { Rng } from '../core/rng';
import type { SimState } from '../sim/state';
import { currentScore } from './leaderboard';

export class LocalLeaderboard implements ILeaderboard {
  constructor(
    private readonly state: SimState,
    private readonly playerName: string = '나',
  ) {}

  entries(nowMs: number): LeaderboardEntry[] {
    const out: LeaderboardEntry[] = this.state.leaderboard.rivals.map((r) => {
      const rng = new Rng(r.seed);
      const skill = 0.6 + rng.next() * 0.8; // 경쟁자별 고정 성향
      const hours = Math.max(0, (nowMs - r.startedAt) / 3_600_000);
      // 완만한 초과선형 성장 — 초반엔 추월 가능, 방치가 길수록 경쟁 유지
      const score = Math.floor(BALANCE.RIVAL_SCORE_PER_HOUR * skill * Math.pow(hours, 1.15));
      return { name: r.name, score, isPlayer: false };
    });
    out.push({
      name: this.playerName,
      score: Math.max(currentScore(this.state), this.state.leaderboard.bestScore),
      isPlayer: true,
    });
    return out.sort((a, b) => b.score - a.score);
  }
}
