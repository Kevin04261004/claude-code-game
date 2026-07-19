/**
 * 로컬↔클라우드 세이브 비교·충돌 판정 (ARCHITECTURE.md §9.3) — 순수 로직.
 * firebase에 의존하지 않으므로 Node(Vitest)에서 그대로 테스트된다.
 *
 * 진행 축 3개(플레이타임/레벨/최고 스테이지)로 판정한다. savedAt은 기기
 * 시계라 신뢰할 수 없어 판정에서 제외하고 요약 표시에만 쓴다. 병합은 하지
 * 않는다 — 스킬 인벤토리 병합은 복제 악용 통로다.
 */
import { stageIndexOf, type SaveDataV1 } from '../save/save-schema';

export interface ProgressAxes {
  playtimeSec: number;
  level: number;
  stageIndex: number;
}

export type SyncVerdict =
  | { kind: 'use-local'; uploadNeeded: boolean }
  | { kind: 'use-cloud' }
  | { kind: 'ask' };

/** 충돌 모달에 표시할 요약 */
export interface SaveSummary {
  level: number;
  stageIndex: number;
  playtimeSec: number;
  savedAt: number;
}

export function axesOf(s: SaveDataV1): ProgressAxes {
  return {
    playtimeSec: s.playtimeSec,
    level: s.player.level,
    stageIndex: stageIndexOf(s.progression.highestStageId),
  };
}

export function summarize(s: SaveDataV1): SaveSummary {
  const a = axesOf(s);
  return { ...a, savedAt: s.savedAt };
}

export function compareSaves(local: SaveDataV1, cloud: SaveDataV1 | null): SyncVerdict {
  if (cloud === null) return { kind: 'use-local', uploadNeeded: true };

  const l = axesOf(local);
  const c = axesOf(cloud);
  const axes: (keyof ProgressAxes)[] = ['playtimeSec', 'level', 'stageIndex'];

  const localAheadSome = axes.some((k) => l[k] > c[k]);
  const cloudAheadSome = axes.some((k) => c[k] > l[k]);

  if (!localAheadSome && !cloudAheadSome) return { kind: 'use-local', uploadNeeded: false };
  if (localAheadSome && !cloudAheadSome) return { kind: 'use-local', uploadNeeded: true };
  if (cloudAheadSome && !localAheadSome) return { kind: 'use-cloud' };
  return { kind: 'ask' }; // 축이 엇갈림 — 유저가 선택
}
