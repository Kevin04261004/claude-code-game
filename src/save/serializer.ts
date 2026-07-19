/**
 * SimState ↔ SaveDataV1 변환. 새 게임 상태 생성도 여기서.
 * 전투장 순간 상태는 버리고, 로드 시 전투는 새로 시작한다 (§6).
 */
import { BALANCE } from '../config/balance';
import { Rng } from '../core/rng';
import { LEGACY_WEAPON_IDS, WEAPONS } from '../content/weapons';
import { maxHpFor } from '../sim/progression/growth';
import type { SimState, WeaponSlot } from '../sim/state';
import { SAVE_VERSION, stageIdOf, stageIndexOf, type SaveDataV1 } from './save-schema';

const RIVAL_NAMES = [
  '김대리', '박과장', '이사원', '최부장', '정인턴',
  '한주임', '오차장', '서팀장', '문프로', '배매니저',
];

export function toSave(state: SimState, now: number): SaveDataV1 {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    playtimeSec: Math.floor(state.totals.playtimeTicks / BALANCE.TPS),
    rngSeed: state.rngState,
    player: {
      level: state.player.level,
      exp: state.player.exp,
      gold: state.player.gold,
      gems: state.player.gems,
    },
    weapons: state.weapons.map((w) => ({ ...w })),
    skills: {
      owned: state.skills.owned.map((s) => ({ ...s })),
      equipped: [...state.skills.equipped],
      treeNodes: [...state.skills.treeNodes],
      rollCount: state.skills.rollCount,
    },
    progression: {
      stageId: stageIdOf(state.stage.index),
      stageKills: state.stage.kills,
      highestStageId: stageIdOf(state.stage.highestIndex),
    },
    leaderboard: {
      localRivals: state.leaderboard.rivals.map((r) => ({ ...r })),
      bestScore: state.leaderboard.bestScore,
    },
    totals: {
      kills: state.totals.kills,
      gold: state.totals.gold,
      exp: state.totals.exp,
    },
    settings: { ...state.settings },
  };
}

export function fromSave(save: SaveDataV1): SimState {
  const level = save.player.level;
  return {
    tick: 0,
    rngState: save.rngSeed,
    player: {
      level,
      exp: save.player.exp,
      gold: save.player.gold,
      gems: save.player.gems,
      hp: maxHpFor(level), // 파생값 재계산 — 로드 시 풀피로 재시작
      maxHp: maxHpFor(level),
    },
    weapons: normalizeWeapons(save.weapons),
    skills: {
      owned: save.skills.owned.map((s) => ({ ...s })),
      equipped: normalizeSlots(save.skills.equipped),
      treeNodes: [...save.skills.treeNodes],
      rollCount: save.skills.rollCount,
    },
    stage: {
      index: stageIndexOf(save.progression.stageId),
      kills: save.progression.stageKills,
      highestIndex: stageIndexOf(save.progression.highestStageId),
    },
    totals: {
      kills: save.totals.kills,
      gold: save.totals.gold,
      exp: save.totals.exp,
      playtimeTicks: save.playtimeSec * BALANCE.TPS,
    },
    leaderboard: {
      rivals: save.leaderboard.localRivals.map((r) => ({ ...r })),
      bestScore: save.leaderboard.bestScore,
    },
    settings: { ...save.settings },
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    cooldowns: {},
    orbitAngle: 0,
    spawnAcc: 0,
    nextId: 1,
  };
}

/**
 * 세이브의 무기 목록 → 현재 무기 로스터로 정규화 (로드 시 항상 적용).
 * 구 판타지 무기는 SF 무기로 이전(레벨/장착 유지), 알 수 없는 id는 버리고,
 * 새로 추가된 무기는 1레벨로 채운다 — 스키마 버전 없이 무기 추가가 가능해진다.
 */
function normalizeWeapons(saved: Array<{ weaponId: string; level: number; equipped: boolean }>): WeaponSlot[] {
  const byId = new Map<string, WeaponSlot>();
  for (const w of saved) {
    const id = LEGACY_WEAPON_IDS[w.weaponId] ?? w.weaponId;
    if (!WEAPONS[id]) continue;
    const prev = byId.get(id);
    if (!prev || w.level > prev.level) {
      byId.set(id, { weaponId: id, level: w.level, equipped: (prev?.equipped ?? false) || w.equipped });
    }
  }
  const out: WeaponSlot[] = [];
  for (const id of Object.keys(WEAPONS)) {
    out.push(byId.get(id) ?? { weaponId: id, level: 1, equipped: false });
  }
  if (!out.some((w) => w.equipped) && out[0]) out[0].equipped = true;
  return out;
}

function normalizeSlots(slots: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < BALANCE.SKILL_SLOTS; i++) out.push(slots[i] ?? null);
  return out;
}

export function newGameState(seed: number, now: number): SimState {
  const rng = new Rng(seed);
  const rivals = [];
  for (let i = 0; i < BALANCE.RIVAL_COUNT; i++) {
    rivals.push({
      name: RIVAL_NAMES[i % RIVAL_NAMES.length]!,
      seed: rng.int(1, 2 ** 31),
      startedAt: now,
    });
  }
  return {
    tick: 0,
    rngState: rng.state,
    player: {
      level: 1,
      exp: 0,
      gold: 0,
      gems: 0,
      hp: maxHpFor(1),
      maxHp: maxHpFor(1),
    },
    weapons: Object.keys(WEAPONS).map((id, i) => ({ weaponId: id, level: 1, equipped: i === 0 })),
    skills: {
      owned: [],
      equipped: normalizeSlots([]),
      treeNodes: [],
      rollCount: 0,
    },
    stage: { index: 0, kills: 0, highestIndex: 0 },
    totals: { kills: 0, gold: 0, exp: 0, playtimeTicks: 0 },
    leaderboard: { rivals, bestScore: 0 },
    settings: { sfxVolume: 0.5, reducedEffects: false },
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    cooldowns: {},
    orbitAngle: 0,
    spawnAcc: 0,
    nextId: 1,
  };
}
