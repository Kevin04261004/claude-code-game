/** 글로벌 랭킹 (src/leaderboard/global-provider.ts) — fake LeaderboardStore 주입 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import type { GlobalScoreRow, LeaderboardStore } from '../src/firebase/client';
import { GlobalLeaderboard } from '../src/leaderboard/global-provider';

function fakeStore(rows: GlobalScoreRow[] = []): LeaderboardStore & { published: Array<{ uid: string; score: number }> } {
  const published: Array<{ uid: string; score: number }> = [];
  return {
    published,
    async topScores(max) {
      return [...rows].sort((a, b) => b.score - a.score).slice(0, max);
    },
    async publishScore(uid, score) {
      published.push({ uid, score });
    },
  };
}

describe('GlobalLeaderboard.top', () => {
  it('score 내림차순 매핑 + 본인 표시', async () => {
    const store = fakeStore([
      { uid: 'a', nickname: '용사', score: 300 },
      { uid: 'me', nickname: '나', score: 200 },
      { uid: 'b', nickname: '적', score: 100 },
    ]);
    const lb = new GlobalLeaderboard(store, () => 'me', () => '나');
    const top = await lb.top(10);
    expect(top.map((e) => e.name)).toEqual(['용사', '나', '적']);
    expect(top.find((e) => e.name === '나')?.isPlayer).toBe(true);
    expect(top.find((e) => e.name === '용사')?.isPlayer).toBe(false);
  });
});

describe('GlobalLeaderboard.publish', () => {
  it('닉네임 미설정이면 게시하지 않는다', async () => {
    const store = fakeStore();
    const lb = new GlobalLeaderboard(store, () => 'me', () => null, () => 1000);
    await lb.publish(500);
    expect(store.published).toHaveLength(0);
  });

  it('닉네임 있으면 본인 uid로 게시한다', async () => {
    const store = fakeStore();
    const lb = new GlobalLeaderboard(store, () => 'me', () => '나', () => 1000);
    await lb.publish(500);
    expect(store.published).toEqual([{ uid: 'me', score: 500 }]);
  });

  it('점수가 오르지 않으면 다시 게시하지 않는다', async () => {
    const store = fakeStore();
    let now = 0;
    const lb = new GlobalLeaderboard(store, () => 'me', () => '나', () => now);
    await lb.publish(500);
    now += BALANCE.LEADERBOARD_PUBLISH_MIN_MS * 2;
    await lb.publish(500); // 동일 점수
    await lb.publish(400); // 더 낮은 점수
    expect(store.published).toHaveLength(1);
  });

  it('최소 간격 이내면 더 높은 점수라도 미룬다', async () => {
    const store = fakeStore();
    let now = 0;
    const lb = new GlobalLeaderboard(store, () => 'me', () => '나', () => now);
    await lb.publish(500);
    now += BALANCE.LEADERBOARD_PUBLISH_MIN_MS - 1;
    await lb.publish(600); // 아직 간격 미달
    expect(store.published).toHaveLength(1);
    now += 2;
    await lb.publish(600); // 간격 경과 → 게시
    expect(store.published).toEqual([
      { uid: 'me', score: 500 },
      { uid: 'me', score: 600 },
    ]);
  });

  it('게시 실패 시 lastScore를 확정하지 않아 다음에 재시도한다', async () => {
    let fail = true;
    const store: LeaderboardStore = {
      async topScores() {
        return [];
      },
      async publishScore() {
        if (fail) throw new Error('network');
      },
    };
    let now = 0;
    const lb = new GlobalLeaderboard(store, () => 'me', () => '나', () => now);
    await expect(lb.publish(500)).rejects.toThrow('network');
    fail = false;
    now += BALANCE.LEADERBOARD_PUBLISH_MIN_MS;
    await expect(lb.publish(500)).resolves.toBeUndefined(); // 같은 점수라도 재시도
  });
});
