/** 클라우드 세이브 충돌 판정 (src/cloud/sync.ts) */
import { describe, expect, it } from 'vitest';
import { toSave } from '../src/save/serializer';
import type { SaveDataV1 } from '../src/save/save-schema';
import { axesOf, compareSaves, summarize } from '../src/cloud/sync';
import { makeState } from './helpers';

/** 진행 축을 지정한 세이브 생성 */
function save(axes: { playtime?: number; level?: number; stage?: number }, savedAt = 1000): SaveDataV1 {
  const s = toSave(makeState(1), savedAt);
  if (axes.playtime !== undefined) s.playtimeSec = axes.playtime;
  if (axes.level !== undefined) s.player.level = axes.level;
  if (axes.stage !== undefined) s.progression.highestStageId = `stage-${axes.stage + 1}`;
  return s;
}

describe('compareSaves', () => {
  it('클라우드가 없으면 로컬 사용 + 업로드 필요', () => {
    expect(compareSaves(save({}), null)).toEqual({ kind: 'use-local', uploadNeeded: true });
  });

  it('모든 축이 동일하면 로컬 사용 + 업로드 불필요', () => {
    const a = save({ playtime: 100, level: 5, stage: 2 });
    const b = save({ playtime: 100, level: 5, stage: 2 }, 9999); // savedAt 차이는 무시
    expect(compareSaves(a, b)).toEqual({ kind: 'use-local', uploadNeeded: false });
  });

  it('로컬이 모든 축에서 앞서면 로컬 채택 + 업로드', () => {
    const local = save({ playtime: 200, level: 6, stage: 3 });
    const cloud = save({ playtime: 100, level: 5, stage: 2 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'use-local', uploadNeeded: true });
  });

  it('로컬이 일부 축만 앞서고 나머지가 같아도 로컬 채택', () => {
    const local = save({ playtime: 200, level: 5, stage: 2 });
    const cloud = save({ playtime: 100, level: 5, stage: 2 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'use-local', uploadNeeded: true });
  });

  it('클라우드가 모든 축에서 앞서면 클라우드 채택', () => {
    const local = save({ playtime: 100, level: 5, stage: 2 });
    const cloud = save({ playtime: 900, level: 9, stage: 5 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'use-cloud' });
  });

  it('클라우드가 일부 축만 앞서고 나머지가 같으면 클라우드 채택', () => {
    const local = save({ playtime: 100, level: 5, stage: 2 });
    const cloud = save({ playtime: 100, level: 5, stage: 4 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'use-cloud' });
  });

  it('축이 엇갈리면(로컬 레벨↑, 클라우드 스테이지↑) 유저에게 묻는다', () => {
    const local = save({ playtime: 100, level: 9, stage: 2 });
    const cloud = save({ playtime: 100, level: 5, stage: 5 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'ask' });
  });

  it('플레이타임과 레벨이 반대로 엇갈려도 묻는다', () => {
    const local = save({ playtime: 900, level: 5, stage: 2 });
    const cloud = save({ playtime: 100, level: 9, stage: 2 });
    expect(compareSaves(local, cloud)).toEqual({ kind: 'ask' });
  });
});

describe('axesOf / summarize', () => {
  it('highestStageId를 인덱스로 변환한다', () => {
    const s = save({ playtime: 50, level: 3, stage: 7 }, 777);
    expect(axesOf(s)).toEqual({ playtimeSec: 50, level: 3, stageIndex: 7 });
    expect(summarize(s)).toEqual({ playtimeSec: 50, level: 3, stageIndex: 7, savedAt: 777 });
  });
});
