/**
 * 스킬 트리 노드 정의 — 순수 데이터.
 * 오프라인 상한 확장("시간 압축" 계열)이 여기서 성장 요소로 제공된다 (§5.3).
 */
export interface TreeNodeDef {
  id: string;
  name: string;
  desc: string;
  cost: number; // 골드
  requires: string | null;
  effect: {
    damageMult?: number; // 곱연산 (1.1 = +10%)
    goldMult?: number;
    regenAdd?: number; // hp/sec 가산
    offlineCapHoursAdd?: number;
  };
}

export const TREE_NODES: Record<string, TreeNodeDef> = {
  dmg_1: {
    id: 'dmg_1',
    name: '공격 강화 I',
    desc: '모든 피해 +10%',
    cost: 200,
    requires: null,
    effect: { damageMult: 1.1 },
  },
  dmg_2: {
    id: 'dmg_2',
    name: '공격 강화 II',
    desc: '모든 피해 +15%',
    cost: 1_500,
    requires: 'dmg_1',
    effect: { damageMult: 1.15 },
  },
  dmg_3: {
    id: 'dmg_3',
    name: '공격 강화 III',
    desc: '모든 피해 +20%',
    cost: 10_000,
    requires: 'dmg_2',
    effect: { damageMult: 1.2 },
  },
  gold_1: {
    id: 'gold_1',
    name: '골드 감각',
    desc: '골드 획득 +20%',
    cost: 500,
    requires: null,
    effect: { goldMult: 1.2 },
  },
  regen_1: {
    id: 'regen_1',
    name: '재생',
    desc: '초당 체력 재생 +3',
    cost: 400,
    requires: null,
    effect: { regenAdd: 3 },
  },
  time_1: {
    id: 'time_1',
    name: '시간 압축 I',
    desc: '오프라인 보상 상한 +8시간',
    cost: 2_000,
    requires: null,
    effect: { offlineCapHoursAdd: 8 },
  },
  time_2: {
    id: 'time_2',
    name: '시간 압축 II',
    desc: '오프라인 보상 상한 +8시간',
    cost: 12_000,
    requires: 'time_1',
    effect: { offlineCapHoursAdd: 8 },
  },
  time_3: {
    id: 'time_3',
    name: '시간 압축 III',
    desc: '오프라인 보상 상한 +8시간',
    cost: 60_000,
    requires: 'time_2',
    effect: { offlineCapHoursAdd: 8 },
  },
  time_4: {
    id: 'time_4',
    name: '시간 압축 IV',
    desc: '오프라인 보상 상한 +8시간',
    cost: 250_000,
    requires: 'time_3',
    effect: { offlineCapHoursAdd: 8 },
  },
};
