/**
 * 스킬 패널 — 추첨(조합 생성), 장착 슬롯, 강화, 스킬 트리.
 */
import { BALANCE } from '../config/balance';
import { TREE_NODES } from '../content/skill-tree';
import { SKILL_GRADES } from '../content/skills/skill-grades';
import { skillRollCost, skillUpgradeCost } from '../sim/progression/growth';
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

    // ── 추첨 ──
    const rollCost = skillRollCost(s.skills.rollCount);
    this.root.append(
      button(`🎲 스킬 추첨 (${fmt(rollCost)}G)`, () => {
        this.sim.execute({ type: 'rollSkill' });
      }, 'btn wide'),
    );

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
}
