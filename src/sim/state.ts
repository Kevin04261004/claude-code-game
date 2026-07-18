/**
 * SimState — 직렬화 가능한 순수 데이터 (ARCHITECTURE.md §2).
 * DOM/Canvas 참조 금지. structuredClone 가능해야 한다(오프라인 표본 측정).
 * px/py(직전 틱 위치)는 렌더 보간용이며 세이브에는 저장되지 않는다.
 */
import type { StatusKind, StatusSpec } from '../content/skills/skill-elements';

export interface StatusInstance {
  kind: StatusKind;
  power: number;
  ticksLeft: number;
}

export interface Enemy {
  id: number;
  defId: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  speed: number;
  touchDps: number;
  gold: number;
  exp: number;
  radius: number;
  statuses: StatusInstance[];
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number; // units/tick
  vy: number;
  damage: number;
  radius: number;
  pierceLeft: number;
  ttl: number;
  elementId: string | null;
  status: StatusSpec | null;
  lifestealPct: number;
  explodePct: number;
  canCrit: boolean;
  tint: string | null;
  hitIds: number[]; // 이미 맞힌 적 (관통용)
  dead: boolean;
}

export interface WeaponSlot {
  weaponId: string;
  level: number;
  equipped: boolean;
}

export interface OwnedSkill {
  id: string; // 조합 인코딩 ID (§4)
  level: number;
}

export interface Rival {
  name: string;
  seed: number;
  startedAt: number; // epoch ms
}

export interface SimState {
  tick: number;
  rngState: number;

  player: {
    level: number;
    exp: number;
    gold: number;
    gems: number;
    hp: number;
    maxHp: number;
  };

  weapons: WeaponSlot[];

  skills: {
    owned: OwnedSkill[];
    equipped: (string | null)[]; // SKILL_SLOTS 크기
    treeNodes: string[];
    rollCount: number;
  };

  stage: {
    index: number; // 0부터
    kills: number;
    highestIndex: number;
  };

  totals: {
    kills: number;
    gold: number;
    exp: number;
    playtimeTicks: number;
  };

  leaderboard: {
    rivals: Rival[];
    bestScore: number;
  };

  settings: {
    sfxVolume: number;
    reducedEffects: boolean;
  };

  // ── 전투장 순간 상태 (세이브에 저장하지 않음, §6) ──
  enemies: Enemy[];
  projectiles: Projectile[];
  cooldowns: Record<string, number>; // 'weapon' 및 스킬 ID별 남은 틱
  orbitAngle: number;
  spawnAcc: number;
  nextId: number;
}
