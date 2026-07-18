/**
 * 스테이지 정의 — 순수 데이터. 테마가 순환하며, 난이도 배율은 스테이지
 * 인덱스에 따라 growth.ts의 공식(balance 상수)으로 결정된다.
 */
export interface StageSpawn {
  enemyId: string;
  weight: number;
}

export interface StageTheme {
  name: string;
  spawns: StageSpawn[];
}

/** 스테이지 index % length 로 순환 */
export const STAGE_CYCLE: StageTheme[] = [
  {
    name: '초원',
    spawns: [
      { enemyId: 'slime', weight: 3 },
      { enemyId: 'bat', weight: 1 },
    ],
  },
  {
    name: '동굴',
    spawns: [
      { enemyId: 'bat', weight: 2 },
      { enemyId: 'brute', weight: 1 },
    ],
  },
  {
    name: '폐허',
    spawns: [
      { enemyId: 'brute', weight: 2 },
      { enemyId: 'wisp', weight: 1 },
    ],
  },
  {
    name: '균열',
    spawns: [
      { enemyId: 'wisp', weight: 2 },
      { enemyId: 'slime', weight: 1 },
      { enemyId: 'brute', weight: 1 },
    ],
  },
];
