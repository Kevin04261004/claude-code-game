/**
 * 스킬 변형 옵션 — 수치·태그 변조만 한다 (새 행동 추가 없음). 순수 데이터.
 * allowedBehaviors로 말이 안 되는 조합을 차단한다 (§4.3).
 */
import type { BehaviorId } from './skill-bases';

export interface SkillModDef {
  id: string;
  name: string;
  statMods: {
    damageMult?: number;
    cooldownMult?: number;
    countAdd?: number;
    pierceAdd?: number;
    radiusMult?: number;
    speedMult?: number;
    lifestealPct?: number; // 가한 피해의 %만큼 회복
    explodePct?: number; // 처치 시 피해의 %로 주변 폭발
  };
  allowedBehaviors: BehaviorId[];
}

export const SKILL_MODS: Record<string, SkillModDef> = {
  pierce: {
    id: 'pierce',
    name: '관통',
    statMods: { pierceAdd: 2, damageMult: 0.85 },
    allowedBehaviors: ['bolt'],
  },
  multishot: {
    id: 'multishot',
    name: '다중발사',
    statMods: { countAdd: 2, damageMult: 0.7 },
    allowedBehaviors: ['bolt', 'orbit'],
  },
  giant: {
    id: 'giant',
    name: '거대화',
    statMods: { radiusMult: 1.5, damageMult: 0.9 },
    allowedBehaviors: ['orbit', 'nova', 'aura'],
  },
  swift: {
    id: 'swift',
    name: '신속',
    statMods: { cooldownMult: 0.7, damageMult: 0.9 },
    allowedBehaviors: ['bolt', 'nova'],
  },
  lifesteal: {
    id: 'lifesteal',
    name: '흡혈',
    statMods: { lifestealPct: 0.02, damageMult: 0.95 },
    allowedBehaviors: ['bolt', 'orbit', 'nova', 'aura'],
  },
  explode: {
    id: 'explode',
    name: '유폭',
    statMods: { explodePct: 0.5, damageMult: 0.9 },
    allowedBehaviors: ['bolt', 'nova'],
  },
  heavy: {
    id: 'heavy',
    name: '중량',
    statMods: { damageMult: 1.4, cooldownMult: 1.3 },
    allowedBehaviors: ['bolt', 'nova'],
  },
  farshot: {
    id: 'farshot',
    name: '장거리',
    statMods: { speedMult: 1.4, damageMult: 1.05 },
    allowedBehaviors: ['bolt'],
  },
};
