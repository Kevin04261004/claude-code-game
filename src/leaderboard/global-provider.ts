/**
 * 실제 글로벌 랭킹 (§9.8) — IGlobalLeaderboard 구현.
 * Firestore 공개 프로필(profiles)의 score를 읽고(top) 쓴다(publish).
 *
 * 닉네임이 있는 계정만 랭킹에 오른다: publish는 닉네임이 없으면 no-op이고,
 * 규칙도 닉네임 없는 프로필의 score 쓰기를 거부한다(이중 방어).
 * 게시는 점수가 올랐을 때만, 최소 간격을 두고 한다 — Firestore 쓰기 할당량 보호.
 */
import type { IGlobalLeaderboard, LeaderboardEntry } from '../app/ports';
import { BALANCE } from '../config/balance';
import type { LeaderboardStore } from '../firebase/client';

export class GlobalLeaderboard implements IGlobalLeaderboard {
  private lastScore = -1;
  private lastPublishAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly store: LeaderboardStore,
    /** 현재 uid — 계정 전환 시 자동 갱신되는 게터 */
    private readonly uid: () => string,
    /** 현재 닉네임 (미설정이면 null) */
    private readonly nickname: () => string | null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async top(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.store.topScores(limit);
    const me = this.uid();
    return rows.map((r) => ({ name: r.nickname, score: r.score, isPlayer: r.uid === me }));
  }

  async publish(score: number): Promise<void> {
    if (!this.nickname()) return; // 닉네임 미설정 → 랭킹 미참여
    if (score <= this.lastScore) return; // 점수가 오르지 않았으면 생략(단조 증가 가정)
    const t = this.now();
    if (t - this.lastPublishAt < BALANCE.LEADERBOARD_PUBLISH_MIN_MS) return; // 최소 간격
    this.lastPublishAt = t; // 실패해도 간격은 소비 — 연속 실패 시 도배 방지
    await this.store.publishScore(this.uid(), score);
    this.lastScore = score; // 성공 시에만 확정 — 실패하면 다음 기회에 재시도
  }

  selfName(): string | null {
    return this.nickname();
  }
}
