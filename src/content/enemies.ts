/**
 * 적 정의 — 순수 데이터 (로직 금지). 수치는 스테이지 배율과 곱해지는 기본값.
 * radius는 BALANCE.MAX_ENEMY_RADIUS(20)를 넘지 않을 것 (충돌 그리드 질의 패딩 전제).
 */
export type EnemyShape = 'circle' | 'triangle' | 'square' | 'diamond';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number; // units/sec
  touchDps: number; // 접촉 시 초당 피해
  gold: number;
  exp: number;
  radius: number;
  shape: EnemyShape;
  color: string;
}

// 우주 테마: shape은 스프라이트 컨셉 키를 겸한다 —
// circle=운석, square=거대 운석, triangle=외계 정찰선, diamond=외계 위습.
// id는 저장 데이터에 남아 있으므로 테마가 바뀌어도 변경하지 않는다.
export const ENEMIES: Record<string, EnemyDef> = {
  slime: {
    id: 'slime',
    name: '운석',
    hp: 20,
    speed: 36,
    touchDps: 8,
    gold: 2,
    exp: 3,
    radius: 10,
    shape: 'circle',
    color: '#a3907a',
  },
  bat: {
    id: 'bat',
    name: '외계 정찰선',
    hp: 12,
    speed: 62,
    touchDps: 6,
    gold: 2,
    exp: 3,
    radius: 8,
    shape: 'triangle',
    color: '#a678d8',
  },
  brute: {
    id: 'brute',
    name: '거대 운석',
    hp: 70,
    speed: 24,
    touchDps: 16,
    gold: 6,
    exp: 8,
    radius: 15,
    shape: 'square',
    color: '#8a7160',
  },
  wisp: {
    id: 'wisp',
    name: '외계 위습',
    hp: 30,
    speed: 48,
    touchDps: 10,
    gold: 4,
    exp: 5,
    radius: 9,
    shape: 'diamond',
    color: '#5ad8d0',
  },
};
