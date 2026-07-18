/**
 * ★ 성장 공식 모음 — 수치는 전부 balance.ts에서 온다.
 * 지수는 항상 정수이므로 결정론적 ipow를 사용한다 (§3.3).
 */
import { BALANCE } from '../../config/balance';
import { ipow } from '../../core/math';
import type { EventBus } from '../../core/event-bus';
import type { WeaponDef } from '../../content/weapons';
import type { SimState } from '../state';

// ── 플레이어 ──

export function expToNext(level: number): number {
  return Math.floor(BALANCE.EXP_BASE * ipow(BALANCE.EXP_GROWTH, level - 1));
}

export function maxHpFor(level: number): number {
  return BALANCE.PLAYER_BASE_HP + (level - 1) * BALANCE.PLAYER_HP_PER_LEVEL;
}

/** 경험치 부여 + 레벨업 처리(이월 포함). 레벨업 시 증가분만큼 회복 */
export function grantExp(state: SimState, bus: EventBus, amount: number): number {
  const p = state.player;
  p.exp += amount;
  state.totals.exp += amount;
  let ups = 0;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    ups++;
    const newMax = maxHpFor(p.level);
    p.hp += newMax - p.maxHp;
    p.maxHp = newMax;
  }
  if (ups > 0) bus.emit('state', { type: 'levelUp', level: p.level, ups });
  return ups;
}

// ── 무기 ──

export function weaponDamage(def: WeaponDef, level: number): number {
  return def.baseDamage * ipow(BALANCE.WEAPON_DMG_GROWTH, level - 1);
}

export function weaponUpgradeCost(def: WeaponDef, level: number): number {
  return Math.floor(def.baseCost * ipow(BALANCE.WEAPON_COST_GROWTH, level - 1));
}

/** 강화 레벨 → 외형 티어 (tiers 배열 인덱스) */
export function weaponTier(def: WeaponDef, level: number): number {
  return Math.min(def.tiers.length - 1, Math.floor((level - 1) / BALANCE.WEAPON_TIER_LEVELS));
}

// ── 스킬 비용 ──

export function skillRollCost(rollCount: number): number {
  return Math.floor(BALANCE.SKILL_ROLL_COST_BASE * ipow(BALANCE.SKILL_ROLL_COST_GROWTH, rollCount));
}

export function skillUpgradeCost(gradeIndex: number, level: number): number {
  return Math.floor(
    BALANCE.SKILL_UPGRADE_COST_BASE * (gradeIndex + 1) * ipow(BALANCE.SKILL_UPGRADE_COST_GROWTH, level - 1),
  );
}

/**
 * 스킬 판매가 = 기본가 + 강화 투자금 환급.
 * 기본가는 등급마다 2배(등장 확률 1/2과 대칭), 변형 옵션당 +25%.
 * 환급은 Lv.1→현재 레벨까지 강화 비용 합의 50% — 실제 지불액(floor된 값)을 그대로 합산해
 * 저장/복원 후에도 결정론적으로 같은 값이 나온다.
 */
export function skillSellPrice(gradeIndex: number, level: number, modCount: number): number {
  const base =
    BALANCE.SKILL_SELL_BASE *
    ipow(BALANCE.SKILL_SELL_GRADE_MULT, gradeIndex) *
    (1 + BALANCE.SKILL_SELL_MOD_BONUS * modCount);
  let invested = 0;
  for (let lv = 1; lv < level; lv++) invested += skillUpgradeCost(gradeIndex, lv);
  return Math.floor(base + BALANCE.SKILL_SELL_UPGRADE_REFUND * invested);
}

// ── 스테이지 ──

export function killsToClear(stageIndex: number): number {
  return Math.floor(BALANCE.STAGE_KILLS_BASE * ipow(BALANCE.STAGE_KILLS_GROWTH, stageIndex));
}

export function enemyHpMult(stageIndex: number): number {
  return ipow(BALANCE.STAGE_HP_GROWTH, stageIndex);
}

export function rewardMult(stageIndex: number): number {
  return ipow(BALANCE.STAGE_REWARD_GROWTH, stageIndex);
}

export function spawnRate(stageIndex: number): number {
  return Math.min(BALANCE.STAGE_SPAWN_CAP, BALANCE.STAGE_SPAWN_BASE * ipow(BALANCE.STAGE_SPAWN_GROWTH, stageIndex));
}

/** 스테이지 클리어 판정 — 처치 수 충족 시 전진 (여러 단계 연속 가능) */
export function checkStageClear(state: SimState, bus: EventBus): void {
  while (state.stage.kills >= killsToClear(state.stage.index)) {
    state.stage.kills -= killsToClear(state.stage.index);
    state.stage.index++;
    if (state.stage.index > state.stage.highestIndex) state.stage.highestIndex = state.stage.index;
    bus.emit('state', { type: 'stageCleared', index: state.stage.index });
  }
}

// ── 점수 ──

export function playerScore(state: SimState): number {
  return (
    state.stage.highestIndex * BALANCE.SCORE_PER_STAGE +
    state.player.level * BALANCE.SCORE_PER_LEVEL +
    state.totals.kills * BALANCE.SCORE_PER_KILL
  );
}
