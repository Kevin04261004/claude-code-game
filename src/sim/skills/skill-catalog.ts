/**
 * 스킬 조합 규칙: ID 인코딩/디코딩/정규화, 유효성 검증, 랜덤 추첨 (§4.3)
 *
 * ID 형식: "base:element:grade" 또는 "base:element:grade:mod1+mod2"
 * ★ 정규화: mods는 항상 사전순 정렬. encode()가 정렬을 강제하고
 *   decode()는 비정규 입력을 정규 ID로 교정한다. 합성 시 mods 적용 순서도
 *   이 정렬 순서를 따른다 → 수치 결과까지 결정론 유지.
 */
import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';
import { SKILL_BASES } from '../../content/skills/skill-bases';
import { SKILL_ELEMENTS } from '../../content/skills/skill-elements';
import { GRADE_ORDER, SKILL_GRADES } from '../../content/skills/skill-grades';
import { SKILL_MODS } from '../../content/skills/skill-mods';

export interface SkillCombo {
  baseId: string;
  elementId: string;
  gradeId: string;
  modIds: string[]; // 항상 사전순 정렬 상태
}

export const MAX_MODS = 2;

export function encodeSkillId(combo: SkillCombo): string {
  const mods = [...combo.modIds].sort();
  const head = `${combo.baseId}:${combo.elementId}:${combo.gradeId}`;
  return mods.length > 0 ? `${head}:${mods.join('+')}` : head;
}

/** 비정규 ID(뒤섞인 mods 순서)도 파싱해 정규 조합으로 반환. 무효하면 throw */
export function decodeSkillId(id: string): SkillCombo {
  const parts = id.split(':');
  if (parts.length < 3 || parts.length > 4) throw new Error(`invalid skill id: ${id}`);
  const [baseId, elementId, gradeId] = parts as [string, string, string];
  const modIds = parts.length === 4 && parts[3] ? parts[3].split('+').sort() : [];
  const combo: SkillCombo = { baseId, elementId, gradeId, modIds };
  validateCombo(combo);
  return combo;
}

/** 비정규 ID를 정규 ID로 교정 */
export function normalizeSkillId(id: string): string {
  return encodeSkillId(decodeSkillId(id));
}

export function validateCombo(combo: SkillCombo): void {
  const base = SKILL_BASES[combo.baseId];
  if (!base) throw new Error(`unknown skill base: ${combo.baseId}`);
  if (!SKILL_ELEMENTS[combo.elementId]) throw new Error(`unknown element: ${combo.elementId}`);
  if (!SKILL_GRADES[combo.gradeId]) throw new Error(`unknown grade: ${combo.gradeId}`);
  if (combo.modIds.length > MAX_MODS) throw new Error(`too many mods: ${combo.modIds.length}`);
  const seen = new Set<string>();
  for (const modId of combo.modIds) {
    const mod = SKILL_MODS[modId];
    if (!mod) throw new Error(`unknown mod: ${modId}`);
    if (seen.has(modId)) throw new Error(`duplicate mod: ${modId}`);
    seen.add(modId);
    if (!mod.allowedBehaviors.includes(base.behavior)) {
      throw new Error(`mod ${modId} not allowed on behavior ${base.behavior}`);
    }
  }
}

/** 최고 스테이지 도달도에 따라 열리는 최대 등급 인덱스 (§4.3 게이팅) */
export function maxGradeIndexFor(highestStageIndex: number): number {
  const byStage = Math.floor(highestStageIndex / BALANCE.GRADE_UNLOCK_STAGE_STEP);
  return Math.min(GRADE_ORDER.length - 1, byStage);
}

export interface RollProbabilities {
  /** 열린 등급별 확률(%) — rollSkillCombo의 가중치(1/2^i)와 동일 공식 */
  grades: { id: string; name: string; color: string; pct: number }[];
  /** 변형 옵션 0/1/2개 확률(%) */
  modCounts: number[];
  /** 다음 등급이 열리는 스테이지 번호(1-based 표시용). 전부 열렸으면 null */
  nextGradeUnlockStage: number | null;
}

/** 뽑기 확률 표 — UI 툴팁용. 실제 추첨(rollSkillCombo)과 같은 수치에서 파생 */
export function rollProbabilities(highestStageIndex: number): RollProbabilities {
  const maxGrade = maxGradeIndexFor(highestStageIndex);
  const weights = GRADE_ORDER.slice(0, maxGrade + 1).map((_, i) => 1 / (1 << i));
  const total = weights.reduce((a, b) => a + b, 0);
  const grades = GRADE_ORDER.slice(0, maxGrade + 1).map((g, i) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    pct: ((weights[i] ?? 0) / total) * 100,
  }));
  const modTotal = BALANCE.SKILL_MOD_COUNT_WEIGHTS.reduce((a, b) => a + b, 0);
  const modCounts = BALANCE.SKILL_MOD_COUNT_WEIGHTS.map((w) => (w / modTotal) * 100);
  const nextGradeUnlockStage =
    maxGrade < GRADE_ORDER.length - 1 ? (maxGrade + 1) * BALANCE.GRADE_UNLOCK_STAGE_STEP + 1 : null;
  return { grades, modCounts, nextGradeUnlockStage };
}

/** 랜덤 스킬 추첨 — 등급은 높은 쪽이 희귀하도록 가중 */
export function rollSkillCombo(rng: Rng, highestStageIndex: number): SkillCombo {
  const baseIds = Object.keys(SKILL_BASES);
  const elementIds = Object.keys(SKILL_ELEMENTS);
  const baseId = rng.pick(baseIds);
  const elementId = rng.pick(elementIds);

  const maxGrade = maxGradeIndexFor(highestStageIndex);
  const gradeWeights = GRADE_ORDER.slice(0, maxGrade + 1).map((_, i) => 1 / (1 << i));
  const grade = GRADE_ORDER[rng.weighted(gradeWeights)];
  if (!grade) throw new Error('grade roll failed');

  const base = SKILL_BASES[baseId];
  if (!base) throw new Error('base roll failed');
  const allowedMods = Object.keys(SKILL_MODS).filter((m) =>
    SKILL_MODS[m]!.allowedBehaviors.includes(base.behavior),
  );
  const modCount = rng.weighted(BALANCE.SKILL_MOD_COUNT_WEIGHTS);
  const modIds: string[] = [];
  const pool = [...allowedMods];
  for (let i = 0; i < modCount && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    modIds.push(pool[idx]!);
    pool.splice(idx, 1);
  }

  const combo: SkillCombo = { baseId, elementId, gradeId: grade.id, modIds: modIds.sort() };
  validateCombo(combo);
  return combo;
}
