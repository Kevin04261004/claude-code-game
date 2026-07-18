/**
 * 조합 데이터 → SkillInstance(수치가 모두 계산된 평탄한 스탯 객체) 생성 (§4.1)
 * 합성 순서 고정: base 수치 → element 배율/상태이상 → grade 배율 → mods(사전순).
 * 순서가 흔들리면 같은 ID가 다른 수치를 내어 결정론이 깨진다.
 */
import { BALANCE } from '../../config/balance';
import { ipow } from '../../core/math';
import { SKILL_BASES, type BehaviorId } from '../../content/skills/skill-bases';
import { SKILL_ELEMENTS, type StatusSpec } from '../../content/skills/skill-elements';
import { SKILL_GRADES } from '../../content/skills/skill-grades';
import { SKILL_MODS } from '../../content/skills/skill-mods';
import { decodeSkillId, encodeSkillId } from './skill-catalog';

export interface SkillInstance {
  id: string; // 정규 ID
  name: string;
  level: number;
  behavior: BehaviorId;
  elementId: string;
  gradeId: string;
  gradeIndex: number;
  damage: number;
  cooldownTicks: number;
  count: number;
  radius: number;
  projectileSpeed: number; // units/sec
  pierce: number;
  lifestealPct: number;
  explodePct: number;
  status: StatusSpec | null;
  tint: string;
}

export function composeSkill(id: string, level: number): SkillInstance {
  const combo = decodeSkillId(id);
  const base = SKILL_BASES[combo.baseId]!;
  const element = SKILL_ELEMENTS[combo.elementId]!;
  const grade = SKILL_GRADES[combo.gradeId]!;

  // 1) base
  let damage = base.baseDamage;
  let cooldownTicks = base.baseCooldownTicks;
  let count = base.baseCount;
  let radius = base.baseRadius;
  let speed = base.projectileSpeed;
  let pierce = base.basePierce;
  let lifestealPct = 0;
  let explodePct = 0;

  // 2) element
  damage *= element.damageMult;
  const status: StatusSpec | null = element.statusEffect ? { ...element.statusEffect } : null;

  // 3) grade
  damage *= grade.mult;

  // 4) mods (combo.modIds는 정규화되어 항상 사전순)
  for (const modId of combo.modIds) {
    const m = SKILL_MODS[modId]!.statMods;
    if (m.damageMult !== undefined) damage *= m.damageMult;
    if (m.cooldownMult !== undefined) cooldownTicks = Math.max(1, Math.round(cooldownTicks * m.cooldownMult));
    if (m.countAdd !== undefined) count += m.countAdd;
    if (m.pierceAdd !== undefined) pierce += m.pierceAdd;
    if (m.radiusMult !== undefined) radius *= m.radiusMult;
    if (m.speedMult !== undefined) speed *= m.speedMult;
    if (m.lifestealPct !== undefined) lifestealPct += m.lifestealPct;
    if (m.explodePct !== undefined) explodePct += m.explodePct;
  }

  // 5) 스킬 레벨 성장
  damage *= ipow(BALANCE.SKILL_LEVEL_DMG_GROWTH, level - 1);

  const modNames = combo.modIds.map((m) => SKILL_MODS[m]!.name);
  const name =
    `${grade.name} ${element.name} ${base.name}` + (modNames.length > 0 ? ` [${modNames.join('·')}]` : '');

  return {
    id: encodeSkillId(combo),
    name,
    level,
    behavior: base.behavior,
    elementId: element.id,
    gradeId: grade.id,
    gradeIndex: grade.index,
    damage,
    cooldownTicks,
    count,
    radius,
    projectileSpeed: speed,
    pierce,
    lifestealPct,
    explodePct,
    status,
    tint: element.visualTint,
  };
}
