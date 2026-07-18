/**
 * 세이브 스키마 v1 (ARCHITECTURE.md §6)
 * 파생값(DPS, 외형 티어, 스킬 실수치, 오프라인 상한)은 저장하지 않는다.
 * 전투장 순간 상태(적/투사체)도 저장하지 않는다.
 */
export const SAVE_VERSION = 1;

export interface SaveDataV1 {
  version: 1;
  savedAt: number; // epoch ms — 오프라인 정산 기준점
  playtimeSec: number;
  rngSeed: number;

  player: {
    level: number;
    exp: number;
    gold: number;
    gems: number;
  };

  weapons: Array<{
    weaponId: string;
    level: number;
    equipped: boolean;
  }>;

  skills: {
    owned: Array<{ id: string; level: number }>;
    equipped: (string | null)[];
    treeNodes: string[];
    rollCount: number;
  };

  progression: {
    stageId: string; // "stage-1"부터
    stageKills: number;
    highestStageId: string;
  };

  leaderboard: {
    localRivals: Array<{ name: string; seed: number; startedAt: number }>;
    bestScore: number;
  };

  totals: {
    kills: number;
    gold: number;
    exp: number;
  };

  settings: {
    sfxVolume: number;
    reducedEffects: boolean;
  };
}

export function stageIdOf(index: number): string {
  return `stage-${index + 1}`;
}

export function stageIndexOf(stageId: string): number {
  const n = parseInt(stageId.replace('stage-', ''), 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
}

/** 구조 검증 — 파싱 성공 ≠ 유효 세이브. 실패 시 throw (복구 체인이 잡는다) */
export function validateSave(x: unknown): asserts x is SaveDataV1 {
  const s = x as SaveDataV1;
  if (!s || typeof s !== 'object') throw new Error('save: not an object');
  if (typeof s.version !== 'number') throw new Error('save: missing version');
  if (s.version !== SAVE_VERSION) throw new Error(`save: unexpected version ${s.version}`);
  if (typeof s.savedAt !== 'number') throw new Error('save: missing savedAt');
  if (typeof s.rngSeed !== 'number') throw new Error('save: missing rngSeed');
  if (!s.player || typeof s.player.level !== 'number' || typeof s.player.gold !== 'number')
    throw new Error('save: bad player');
  if (!Array.isArray(s.weapons)) throw new Error('save: bad weapons');
  if (!s.skills || !Array.isArray(s.skills.owned) || !Array.isArray(s.skills.equipped))
    throw new Error('save: bad skills');
  if (!s.progression || typeof s.progression.stageId !== 'string') throw new Error('save: bad progression');
  if (!s.leaderboard || !Array.isArray(s.leaderboard.localRivals)) throw new Error('save: bad leaderboard');
  if (!s.totals || typeof s.totals.kills !== 'number') throw new Error('save: bad totals');
  if (!s.settings) throw new Error('save: bad settings');
}
