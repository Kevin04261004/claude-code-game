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

export const ENEMIES: Record<string, EnemyDef> = {
  slime: {
    id: 'slime',
    name: '슬라임',
    hp: 20,
    speed: 36,
    touchDps: 8,
    gold: 2,
    exp: 3,
    radius: 10,
    shape: 'circle',
    color: '#6fce6f',
  },
  bat: {
    id: 'bat',
    name: '박쥐',
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
    name: '브루트',
    hp: 70,
    speed: 24,
    touchDps: 16,
    gold: 6,
    exp: 8,
    radius: 15,
    shape: 'square',
    color: '#d86a5a',
  },
  wisp: {
    id: 'wisp',
    name: '위습',
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
