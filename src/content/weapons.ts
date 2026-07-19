/**
 * 무기 정의 — 순수 데이터. 강화 레벨은 세이브에 있고, 외형 티어는
 * 레벨에서 파생된다(BALANCE.WEAPON_TIER_LEVELS). tiers는 외형 키 목록으로
 * render/weapon-visuals.ts가 해석한다.
 *
 * behavior 4종 — 엔진(sim/combat/weapon-fire.ts)이 아는 행동 패턴:
 *  - bolt  : 가장 가까운 적에게 투사체 연사
 *  - shell : 느린 투사체, 착탄 시 주변 광역 폭발 (BALANCE.CANNON_*)
 *  - beam  : 사거리 내 가장 가까운 적과 연결되어 지속 피해 (BALANCE.BEAM_*)
 *  - sweep : 주기마다 광선이 플레이어 중심으로 1회전하며 범위 내 적 타격,
 *            레벨이 오르면 주기가 짧아진다 (BALANCE.SWEEP_*)
 */
export type WeaponBehavior = 'bolt' | 'shell' | 'beam' | 'sweep';

export interface WeaponDef {
  id: string;
  name: string;
  behavior: WeaponBehavior;
  /** 패널에 표시하는 특성 설명 */
  desc: string;
  baseDamage: number;
  baseCost: number;
  /** bolt/shell: 발사 주기. sweep: 회전 후 대기 주기의 기본값. beam: 미사용(0) */
  cooldownTicks: number;
  projectileSpeed: number; // units/sec (bolt/shell)
  projectileRadius: number;
  /** 투사체/빔 색 */
  tint: string;
  /** 강화 티어별 외형 키 (10레벨마다 다음 티어) */
  tiers: string[];
}

/** SF 공통 티어 진행 — Mk 시리즈 → 에너지 코어 계열 */
const SF_TIERS = ['mk1', 'mk2', 'mk3', 'mk4', 'rune', 'flame', 'frost', 'storm', 'void', 'celestial'];

export const WEAPONS: Record<string, WeaponDef> = {
  laser: {
    id: 'laser',
    name: '레이저 블래스터',
    behavior: 'bolt',
    desc: '속사형 — 가장 가까운 적에게 레이저 볼트를 빠르게 연사합니다.',
    baseDamage: 6,
    baseCost: 10,
    cooldownTicks: 5,
    projectileSpeed: 420,
    projectileRadius: 4,
    tint: '#7fd4ff',
    tiers: SF_TIERS,
  },
  cannon: {
    id: 'cannon',
    name: '플라즈마 포',
    behavior: 'shell',
    desc: '폭발형 — 느리지만 묵직한 포탄이 착탄 지점 주변까지 광역 피해를 입힙니다.',
    baseDamage: 18,
    baseCost: 14,
    cooldownTicks: 14,
    projectileSpeed: 200,
    projectileRadius: 9,
    tint: '#ffa25a',
    tiers: SF_TIERS,
  },
  beam: {
    id: 'beam',
    name: '광자 빔',
    behavior: 'beam',
    desc: '지속형 — 사거리 안 가장 가까운 적과 빔을 연결해 쉬지 않고 지속 피해를 줍니다.',
    baseDamage: 12,
    baseCost: 16,
    cooldownTicks: 0,
    projectileSpeed: 0,
    projectileRadius: 0,
    tint: '#8affd0',
    tiers: SF_TIERS,
  },
  sweep: {
    id: 'sweep',
    name: '회전 광선',
    behavior: 'sweep',
    desc: '주기형 — 일정 주기마다 광선이 한 바퀴 빠르게 회전하며 범위 내 모든 적을 벱니다. 강화할수록 주기가 짧아집니다.',
    baseDamage: 14,
    baseCost: 20,
    cooldownTicks: 40,
    projectileSpeed: 0,
    projectileRadius: 0,
    tint: '#d0a2ff',
    tiers: SF_TIERS,
  },
};

/** 구 세이브의 판타지 무기 → SF 무기 이전 (레벨/장착 상태 유지, 로드 시 적용) */
export const LEGACY_WEAPON_IDS: Record<string, string> = {
  blade: 'laser',
  wand: 'cannon',
};
