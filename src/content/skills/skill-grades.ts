/**
 * 스킬 등급 — 전 수치 배율 곡선. 순수 데이터.
 * index 순서가 곧 희귀도 순서이며, 등장은 최고 스테이지로 게이팅된다
 * (BALANCE.GRADE_UNLOCK_STAGE_STEP).
 */
export interface SkillGradeDef {
  id: string;
  name: string;
  index: number;
  mult: number; // 데미지 등 주요 수치 배율
  color: string;
}

export const SKILL_GRADES: Record<string, SkillGradeDef> = {
  common: { id: 'common', name: '일반', index: 0, mult: 1.0, color: '#b8b8b8' },
  uncommon: { id: 'uncommon', name: '고급', index: 1, mult: 1.5, color: '#6fce6f' },
  rare: { id: 'rare', name: '희귀', index: 2, mult: 2.25, color: '#5aa6e8' },
  epic: { id: 'epic', name: '영웅', index: 3, mult: 3.38, color: '#b06ae0' },
  legendary: { id: 'legendary', name: '전설', index: 4, mult: 5.06, color: '#f2a640' },
  mythic: { id: 'mythic', name: '신화', index: 5, mult: 7.59, color: '#f25a5a' },
};

/** index 오름차순 배열 (등장 게이팅/가중 추첨용) */
export const GRADE_ORDER: SkillGradeDef[] = Object.values(SKILL_GRADES).sort((a, b) => a.index - b.index);
