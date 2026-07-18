/**
 * (추후) 서버 리더보드 자리 — ILeaderboard만 맞추면 local-provider와 교체 가능.
 * 결정론 시뮬 덕분에 서버는 (seed, 명령 로그)로 점수를 재현·검증할 수 있다.
 */
import type { ILeaderboard, LeaderboardEntry } from '../app/ports';

export class RemoteLeaderboard implements ILeaderboard {
  entries(_nowMs: number): LeaderboardEntry[] {
    throw new Error('RemoteLeaderboard: 아직 구현되지 않음 (서버 연동 시 교체)');
  }
}
