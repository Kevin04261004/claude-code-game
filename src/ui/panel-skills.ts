/**
 * 스킬 패널 — 추첨(조합 생성), 장착 슬롯, 강화, 스킬 트리.
 */
import { BALANCE } from '../config/balance';
import { TREE_NODES } from '../content/skill-tree';
import { SKILL_GRADES } from '../content/skills/skill-grades';
import { skillRollCost, skillUpgradeCost } from '../sim/progression/growth';
import { rollProbabilities } from '../sim/skills/skill-catalog';
import { composeSkill } from '../sim/skills/skill-composer';
import type { Simulation } from '../sim/simulation';
import { button, el, fmt } from './dom';

export class SkillsPanel {
  readonly root = el('div', 'panel-body');

  constructor(private readonly sim: Simulation) {
    this.refresh();
    for (const t of ['skillRolled', 'skillUpgraded', 'skillEquipped', 'treeNodeUnlocked', 'catchupSummary']) {
      sim.bus.on(t, () => this.refresh());
    }
  }

  refresh(): void {
    const s = this.sim.state;
    this.root.replaceChildren();

    // ── 추첨 (확률 툴팁: 데스크톱은 호버, 터치는 ⓘ 토글) ──
    const rollCost = skillRollCost(s.skills.rollCount);
    const rollWrap = el('div', 'tooltip-wrap');
    const rollRow = el('div', 'roll-row');
    rollRow.append(
      button(`🎲 스킬 추첨 (${fmt(rollCost)}G)`, () => {
        this.sim.execute({ type: 'rollSkill' });
      }, 'btn wide'),
      button('ⓘ', () => rollWrap.classList.toggle('open'), 'btn info'),
    );
    rollWrap.append(rollRow, this.buildRollTooltip());
    this.root.append(rollWrap);

    // ── 장착 슬롯 ──
    const slotsTitle = el('div', 'section-title', `장착 슬롯 (${BALANCE.SKILL_SLOTS})`);
    this.root.append(slotsTitle);
    s.skills.equipped.forEach((id, slot) => {
      const row = el('div', 'card slot');
      if (id) {
        const owned = s.skills.owned.find((o) => o.id === id);
        const inst = owned ? composeSkill(owned.id, owned.level) : null;
        row.append(el('div', 'card-title', inst ? `${inst.name} Lv.${inst.level}` : id));
        row.append(button('해제', () => void this.sim.execute({ type: 'unequipSkill', slot }), 'btn secondary'));
      } else {
        row.append(el('div', 'card-sub', `슬롯 ${slot + 1} — 비어 있음`));
      }
      this.root.append(row);
    });

    // ── 보유 스킬 ──
    this.root.append(el('div', 'section-title', `보유 스킬 (${s.skills.owned.length})`));
    for (const owned of s.skills.owned) {
      const inst = composeSkill(owned.id, owned.level);
      const grade = SKILL_GRADES[inst.gradeId]!;
      const card = el('div', 'card');
      const title = el('div', 'card-title', `${inst.name} Lv.${inst.level}`);
      title.style.color = grade.color;
      card.append(title);
      card.append(el('div', 'card-sub', `데미지 ${fmt(inst.damage)} · ${inst.behavior}`));
      const row = el('div', 'card-actions');
      const upCost = skillUpgradeCost(inst.gradeIndex, owned.level);
      row.append(
        button(`강화 (${fmt(upCost)}G)`, () => void this.sim.execute({ type: 'upgradeSkill', skillId: owned.id })),
      );
      if (!s.skills.equipped.includes(owned.id)) {
        const empty = s.skills.equipped.indexOf(null);
        const target = empty >= 0 ? empty : 0;
        row.append(
          button('장착', () => void this.sim.execute({ type: 'equipSkill', skillId: owned.id, slot: target }), 'btn secondary'),
        );
      }
      card.append(row);
      this.root.append(card);
    }

    // ── 스킬 트리 ──
    this.root.append(el('div', 'section-title', '스킬 트리'));
    for (const node of Object.values(TREE_NODES)) {
      const ownedNode = s.skills.treeNodes.includes(node.id);
      const reqOk = !node.requires || s.skills.treeNodes.includes(node.requires);
      const card = el('div', ownedNode ? 'card equipped' : 'card');
      card.append(el('div', 'card-title', node.name));
      card.append(el('div', 'card-sub', node.desc));
      if (!ownedNode && reqOk) {
        card.append(
          button(`해금 (${fmt(node.cost)}G)`, () => void this.sim.execute({ type: 'unlockTreeNode', nodeId: node.id })),
        );
      } else if (!ownedNode) {
        const req = node.requires ? TREE_NODES[node.requires]?.name ?? node.requires : '';
        card.append(el('div', 'card-sub locked', `🔒 ${req} 필요`));
      }
      this.root.append(card);
    }
  }

  /** 실제 추첨 로직(skill-catalog)과 같은 수치에서 파생된 확률 표 */
  private buildRollTooltip(): HTMLElement {
    const probs = rollProbabilities(this.sim.state.stage.highestIndex);
    const tip = el('div', 'tooltip');
    tip.append(el('div', 'tooltip-title', '등급 확률'));
    for (const g of probs.grades) {
      const row = el('div', 'tooltip-row');
      const name = el('span', undefined, g.name);
      name.style.color = g.color;
      row.append(name, el('span', undefined, `${g.pct.toFixed(1)}%`));
      tip.append(row);
    }
    if (probs.nextGradeUnlockStage !== null) {
      tip.append(el('div', 'tooltip-hint', `🔒 다음 등급은 스테이지 ${probs.nextGradeUnlockStage} 도달 시 해금`));
    }
    tip.append(el('div', 'tooltip-title', '변형 옵션 개수'));
    const modRow = el('div', 'tooltip-row');
    modRow.append(
      el('span', undefined, '0개 / 1개 / 2개'),
      el('span', undefined, probs.modCounts.map((p) => `${p.toFixed(0)}%`).join(' / ')),
    );
    tip.append(modRow);
    tip.append(el('div', 'tooltip-hint', '기본형·속성은 균등 확률 · 중복 획득 시 레벨 +1'));
    return tip;
  }
}
