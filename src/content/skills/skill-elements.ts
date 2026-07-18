/**
 * 스킬 속성 — 피해 배율 + 부가 상태이상 + 시각 틴트. 순수 데이터.
 */
export type StatusKind = 'slow' | 'burn' | 'poison' | 'shock';

export interface StatusSpec {
  kind: StatusKind;
  /** slow: 감속 비율 / burn·poison: 초당 피해 / shock: 받는 피해 증가 비율 */
  power: number;
  durationTicks: number;
}

export interface SkillElementDef {
  id: string;
  name: string;
  damageMult: number;
  statusEffect: StatusSpec | null;
  visualTint: string;
}

export const SKILL_ELEMENTS: Record<string, SkillElementDef> = {
  fire: {
    id: 'fire',
    name: '화염',
    damageMult: 1.0,
    statusEffect: { kind: 'burn', power: 4, durationTicks: 30 },
    visualTint: '#ff8a4a',
  },
  frost: {
    id: 'frost',
    name: '냉기',
    damageMult: 0.9,
    statusEffect: { kind: 'slow', power: 0.3, durationTicks: 20 },
    visualTint: '#7fd4ff',
  },
  lightning: {
    id: 'lightning',
    name: '번개',
    damageMult: 1.1,
    statusEffect: { kind: 'shock', power: 0.25, durationTicks: 25 },
    visualTint: '#ffe066',
  },
  poison: {
    id: 'poison',
    name: '맹독',
    damageMult: 0.85,
    statusEffect: { kind: 'poison', power: 3, durationTicks: 50 },
    visualTint: '#9bde5a',
  },
  holy: {
    id: 'holy',
    name: '신성',
    damageMult: 1.05,
    statusEffect: null,
    visualTint: '#fff3b0',
  },
  void: {
    id: 'void',
    name: '공허',
    damageMult: 1.2,
    statusEffect: null,
    visualTint: '#b48cf2',
  },
};
