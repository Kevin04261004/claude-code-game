/**
 * 스킬 패널 — 추첨(조합 생성), 장착 슬롯, 강화/판매, 스킬 트리.
 * 장착/해제/교체는 드래그 앤 드랍: 아이콘을 슬롯에 끌어 장착, 슬롯끼리 교체,
 * 슬롯에서 보유 목록으로 끌면 해제. Pointer Events 기반이라 마우스/터치 공용.
 */
import { BALANCE } from '../config/balance';
import { TREE_NODES } from '../content/skill-tree';
import { SKILL_GRADES } from '../content/skills/skill-grades';
import { skillRollCost, skillSellPrice, skillUpgradeCost } from '../sim/progression/growth';
import { decodeSkillId, rollProbabilities } from '../sim/skills/skill-catalog';
import { composeSkill, type SkillInstance } from '../sim/skills/skill-composer';
import type { Simulation } from '../sim/simulation';
import { button, el, fmt } from './dom';
import { skillIconURL } from './skill-icon';

/** 드래그 출처 — 보유 목록에서 시작했는지, 슬롯에서 시작했는지 */
interface DragSource {
  skillId: string;
  fromSlot: number | null;
}

const DRAG_THRESHOLD_PX = 5;

export class SkillsPanel {
  readonly root = el('div', 'panel-body');
  private ghost: HTMLImageElement | null = null;
  private hoverTarget: HTMLElement | null = null;

  constructor(private readonly sim: Simulation) {
    this.refresh();
    for (const t of ['skillRolled', 'skillUpgraded', 'skillSold', 'skillEquipped', 'treeNodeUnlocked', 'catchupSummary']) {
      sim.bus.on(t, () => this.refresh());
    }
  }

  refresh(): void {
    const s = this.sim.state;
    this.root.replaceChildren();

    // ── 상단 고정 영역: 추첨 + 장착 슬롯 (스크롤해도 움직이지 않음) ──
    const sticky = el('div', 'skills-sticky');

    // 추첨 (확률 툴팁: 데스크톱은 호버, 터치는 ⓘ 토글)
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
    sticky.append(rollWrap);

    // 장착 슬롯 (드랍 대상)
    sticky.append(el('div', 'section-title', `장착 슬롯 (${BALANCE.SKILL_SLOTS})`));
    const slotGrid = el('div', 'slot-grid');
    s.skills.equipped.forEach((id, slot) => {
      slotGrid.append(this.buildSlotTile(id, slot));
    });
    sticky.append(slotGrid);
    sticky.append(
      el('div', 'dnd-hint', '아이콘을 끌어 장착 · 슬롯끼리 교체 · 슬롯에서 목록으로 끌면 해제'),
    );
    this.root.append(sticky);

    // ── 보유 스킬 (슬롯에서 끌어오면 해제되는 드랍 존) ──
    this.root.append(el('div', 'section-title', `보유 스킬 (${s.skills.owned.length})`));
    const ownedZone = el('div', 'owned-zone');
    ownedZone.dataset['drop'] = 'owned';
    for (const owned of s.skills.owned) {
      ownedZone.append(this.buildOwnedCard(owned.id, owned.level));
    }
    this.root.append(ownedZone);

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

  // ── 슬롯 타일 ──

  private buildSlotTile(id: string | null, slot: number): HTMLElement {
    const tile = el('div', id ? 'skill-slot' : 'skill-slot empty');
    tile.dataset['drop'] = 'slot';
    tile.dataset['slot'] = String(slot);
    if (id) {
      const owned = this.sim.state.skills.owned.find((o) => o.id === id);
      const inst = owned ? composeSkill(owned.id, owned.level) : null;
      if (inst) {
        const grade = SKILL_GRADES[inst.gradeId]!;
        tile.style.borderColor = grade.color;
        tile.title = `${inst.name} Lv.${inst.level}`;
        const icon = this.buildIcon(id, { skillId: id, fromSlot: slot });
        tile.append(icon, el('span', 'slot-level', `Lv.${inst.level}`));
      }
    } else {
      tile.append(el('span', 'slot-plus', '+'));
      tile.title = `슬롯 ${slot + 1} — 비어 있음`;
    }
    return tile;
  }

  // ── 보유 스킬 카드 ──

  private buildOwnedCard(id: string, level: number): HTMLElement {
    const s = this.sim.state;
    const inst = composeSkill(id, level);
    const grade = SKILL_GRADES[inst.gradeId]!;
    const equipped = s.skills.equipped.includes(id);
    const card = el('div', equipped ? 'card skill-card equipped' : 'card skill-card');

    const iconWrap = el('div', 'skill-icon-wrap');
    iconWrap.append(this.buildIcon(id, { skillId: id, fromSlot: null }));
    if (equipped) iconWrap.append(el('span', 'equipped-badge', '장착중'));
    card.append(iconWrap);

    const body = el('div', 'skill-card-body');
    const title = el('div', 'card-title', `${inst.name} Lv.${inst.level}`);
    title.style.color = grade.color;
    body.append(title);
    body.append(el('div', 'card-sub', `데미지 ${fmt(inst.damage)} · ${inst.behavior}`));
    const row = el('div', 'card-actions');
    const upCost = skillUpgradeCost(inst.gradeIndex, level);
    row.append(
      button(`강화 (${fmt(upCost)}G)`, () => void this.sim.execute({ type: 'upgradeSkill', skillId: id })),
    );
    const sellPrice = skillSellPrice(inst.gradeIndex, level, decodeSkillId(id).modIds.length);
    row.append(
      button(`판매 (+${fmt(sellPrice)}G)`, () => this.showSellConfirm(id, inst, sellPrice), 'btn danger'),
    );
    body.append(row);
    card.append(body);
    return card;
  }

  // ── 판매 확인 모달 (인게임 UI — 브라우저 confirm 미사용) ──

  private showSellConfirm(id: string, inst: SkillInstance, price: number): void {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;
    const grade = SKILL_GRADES[inst.gradeId]!;

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal');

    const head = el('div', 'sell-head');
    const icon = el('img', 'skill-icon') as HTMLImageElement;
    icon.src = skillIconURL(id);
    icon.draggable = false;
    const headText = el('div');
    const title = el('div', 'modal-title', inst.name);
    title.style.color = grade.color;
    headText.append(title, el('div', 'modal-sub', `Lv.${inst.level} · 데미지 ${fmt(inst.damage)}`));
    head.append(icon, headText);
    modal.append(head);

    const list = el('div', 'modal-list');
    const priceRow = el('div', 'modal-row');
    priceRow.append(el('span', undefined, '💰 판매가'), el('span', 'hud-value', `+${fmt(price)}G`));
    list.append(priceRow);
    modal.append(list);

    const equipped = this.sim.state.skills.equipped.includes(id);
    modal.append(
      el('div', 'modal-hint', equipped ? '장착 중인 스킬입니다 — 판매하면 슬롯에서 해제됩니다. 되돌릴 수 없습니다.' : '판매하면 되돌릴 수 없습니다.'),
    );

    const actions = el('div', 'modal-actions');
    actions.append(
      button('취소', () => overlay.remove(), 'btn secondary'),
      button(`판매 (+${fmt(price)}G)`, () => {
        overlay.remove();
        void this.sim.execute({ type: 'sellSkill', skillId: id });
      }, 'btn danger'),
    );
    modal.append(actions);

    // 배경 클릭 = 취소
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.append(modal);
    modalRoot.append(overlay);
  }

  // ── 아이콘 (드래그 핸들) ──

  private buildIcon(skillId: string, source: DragSource): HTMLImageElement {
    const img = el('img', 'skill-icon drag-handle') as HTMLImageElement;
    img.src = skillIconURL(skillId);
    img.draggable = false; // 브라우저 기본 이미지 드래그 무효화 (Pointer Events로 직접 처리)
    img.addEventListener('pointerdown', (e) => this.startDrag(e, img, source));
    return img;
  }

  // ── 드래그 앤 드랍 (Pointer Events — 마우스/터치 공용) ──

  private startDrag(e: PointerEvent, handle: HTMLImageElement, source: DragSource): void {
    if (!e.isPrimary) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    handle.setPointerCapture(e.pointerId);

    const equippedNow = source.fromSlot !== null || this.sim.state.skills.equipped.includes(source.skillId);

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        this.beginGhost(handle, equippedNow);
      }
      this.moveGhost(ev.clientX, ev.clientY);
    };
    const finish = (ev: PointerEvent, commit: boolean) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      if (dragging) {
        const target = commit ? this.dropTargetAt(ev.clientX, ev.clientY) : null;
        this.endGhost();
        if (target) this.resolveDrop(source, target);
      }
    };
    const onUp = (ev: PointerEvent) => finish(ev, true);
    const onCancel = (ev: PointerEvent) => finish(ev, false);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  }

  private beginGhost(handle: HTMLImageElement, sourceEquipped: boolean): void {
    const ghost = handle.cloneNode() as HTMLImageElement;
    ghost.className = 'drag-ghost';
    document.body.append(ghost);
    this.ghost = ghost;
    this.root.classList.add('dragging');
    // 해제 드랍 존은 장착 중인 스킬을 끌 때만 의미가 있다
    if (sourceEquipped) this.root.classList.add('can-unequip');
  }

  private moveGhost(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
    const target = this.dropTargetAt(x, y);
    if (target !== this.hoverTarget) {
      this.hoverTarget?.classList.remove('drop-hover');
      target?.classList.add('drop-hover');
      this.hoverTarget = target;
    }
  }

  private endGhost(): void {
    this.ghost?.remove();
    this.ghost = null;
    this.hoverTarget?.classList.remove('drop-hover');
    this.hoverTarget = null;
    this.root.classList.remove('dragging', 'can-unequip');
  }

  /** 포인터 아래의 드랍 대상 — 고스트는 pointer-events:none이라 걸리지 않는다 */
  private dropTargetAt(x: number, y: number): HTMLElement | null {
    const hit = document.elementFromPoint(x, y);
    return (hit?.closest('[data-drop]') as HTMLElement | null) ?? null;
  }

  private resolveDrop(source: DragSource, target: HTMLElement): void {
    if (target.dataset['drop'] === 'slot') {
      this.dropOnSlot(source.skillId, Number(target.dataset['slot']));
    } else if (target.dataset['drop'] === 'owned') {
      this.dropOnOwned(source.skillId);
    }
  }

  /** 슬롯에 드랍: 장착. 이미 다른 슬롯에 있던 스킬이면 자리를 맞바꾼다 */
  private dropOnSlot(skillId: string, slot: number): void {
    if (!Number.isInteger(slot)) return;
    const eq = this.sim.state.skills.equipped;
    const cur = eq.indexOf(skillId);
    if (cur === slot) return;
    const displaced = eq[slot] ?? null;
    void this.sim.execute({ type: 'equipSkill', skillId, slot });
    if (cur >= 0 && displaced && displaced !== skillId) {
      void this.sim.execute({ type: 'equipSkill', skillId: displaced, slot: cur });
    }
  }

  /** 보유 목록에 드랍: 장착 중이면 해제 */
  private dropOnOwned(skillId: string): void {
    const cur = this.sim.state.skills.equipped.indexOf(skillId);
    if (cur >= 0) void this.sim.execute({ type: 'unequipSkill', slot: cur });
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
