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
  const modCountRoll = rng.next();
  const modCount = modCountRoll < 0.4 ? 0 : modCountRoll < 0.8 ? 1 : 2;
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
