/**
 * 무기 정의 — 순수 데이터. 강화 레벨은 세이브에 있고, 외형 티어는
 * 레벨에서 파생된다(BALANCE.WEAPON_TIER_LEVELS). tiers는 외형 키 목록으로
 * render/weapon-visuals.ts가 해석한다.
 */
export interface WeaponDef {
  id: string;
  name: string;
  baseDamage: number;
  baseCost: number;
  cooldownTicks: number;
  projectileSpeed: number; // units/sec
  projectileRadius: number;
  /** 강화 티어별 외형 키 (10레벨마다 다음 티어) */
  tiers: string[];
}

export const WEAPONS: Record<string, WeaponDef> = {
  blade: {
    id: 'blade',
    name: '검',
    baseDamage: 7,
    baseCost: 10,
    cooldownTicks: 7,
    projectileSpeed: 300,
    projectileRadius: 6,
    tiers: ['rusty', 'iron', 'steel', 'knight', 'rune', 'flame', 'frost', 'storm', 'void', 'celestial'],
  },
  wand: {
    id: 'wand',
    name: '지팡이',
    baseDamage: 12,
    baseCost: 14,
    cooldownTicks: 11,
    projectileSpeed: 240,
    projectileRadius: 8,
    tiers: ['twig', 'oak', 'crystal', 'sage', 'rune', 'flame', 'frost', 'storm', 'void', 'celestial'],
  },
};
