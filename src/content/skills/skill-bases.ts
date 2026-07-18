/**
 * 스킬 기본형 — "행동"을 정의하는 유일한 축 (ARCHITECTURE.md §4).
 * 엔진(skill-resolver)이 이해하는 것은 behavior 종류뿐이다.
 */
export type BehaviorId = 'bolt' | 'orbit' | 'nova' | 'aura';

export interface SkillBaseDef {
  id: string;
  name: string;
  behavior: BehaviorId;
  baseDamage: number;
  /** 0이면 상시 유지형(orbit/aura) */
  baseCooldownTicks: number;
  /** bolt: 발사체 수 / orbit: 칼날 수 / 그 외 1 */
  baseCount: number;
  /** orbit: 궤도 반경 / nova·aura: 효과 반경 / bolt: 미사용 */
  baseRadius: number;
  /** bolt 전용: units/sec */
  projectileSpeed: number;
  /** bolt 전용: 기본 관통 수 */
  basePierce: number;
  tags: string[];
}

export const SKILL_BASES: Record<string, SkillBaseDef> = {
  magic_bolt: {
    id: 'magic_bolt',
    name: '마력탄',
    behavior: 'bolt',
    baseDamage: 10,
    baseCooldownTicks: 12,
    baseCount: 1,
    baseRadius: 0,
    projectileSpeed: 280,
    basePierce: 0,
    tags: ['ranged'],
  },
  piercing_lance: {
    id: 'piercing_lance',
    name: '관통창',
    behavior: 'bolt',
    baseDamage: 16,
    baseCooldownTicks: 20,
    baseCount: 1,
    baseRadius: 0,
    projectileSpeed: 340,
    basePierce: 2,
    tags: ['ranged', 'pierce'],
  },
  orbit_blade: {
    id: 'orbit_blade',
    name: '회전 칼날',
    behavior: 'orbit',
    baseDamage: 6,
    baseCooldownTicks: 0,
    baseCount: 2,
    baseRadius: 70,
    projectileSpeed: 0,
    basePierce: 0,
    tags: ['melee', 'sustained'],
  },
  nova: {
    id: 'nova',
    name: '충격파',
    behavior: 'nova',
    baseDamage: 14,
    baseCooldownTicks: 30,
    baseCount: 1,
    baseRadius: 110,
    projectileSpeed: 0,
    basePierce: 0,
    tags: ['aoe', 'burst'],
  },
  aura: {
    id: 'aura',
    name: '오라',
    behavior: 'aura',
    baseDamage: 4,
    baseCooldownTicks: 0,
    baseCount: 1,
    baseRadius: 90,
    projectileSpeed: 0,
    basePierce: 0,
    tags: ['aoe', 'sustained'],
  },
};
