/**
 * 스킬 트리 노드 해금/보너스 집계.
 * 오프라인 상한(§5.3)은 여기서 treeNodes로부터 파생 계산된다 — 세이브 스키마 불변.
 */
import { BALANCE } from '../../config/balance';
import type { EventBus } from '../../core/event-bus';
import { TREE_NODES } from '../../content/skill-tree';
import type { SimState } from '../state';

export interface TreeBonuses {
  damageMult: number;
  goldMult: number;
  regenAdd: number;
  offlineCapHours: number;
}

export function treeBonuses(state: SimState): TreeBonuses {
  let damageMult = 1;
  let goldMult = 1;
  let regenAdd = 0;
  let capAdd = 0;
  for (const nodeId of state.skills.treeNodes) {
    const node = TREE_NODES[nodeId];
    if (!node) continue; // 삭제된 노드가 세이브에 남아있어도 무해하게 무시
    if (node.effect.damageMult) damageMult *= node.effect.damageMult;
    if (node.effect.goldMult) goldMult *= node.effect.goldMult;
    if (node.effect.regenAdd) regenAdd += node.effect.regenAdd;
    if (node.effect.offlineCapHoursAdd) capAdd += node.effect.offlineCapHoursAdd;
  }
  const offlineCapHours = Math.min(BALANCE.OFFLINE_CAP_MAX_HOURS, BALANCE.OFFLINE_CAP_BASE_HOURS + capAdd);
  return { damageMult, goldMult, regenAdd, offlineCapHours };
}

export function offlineCapHours(state: SimState): number {
  return treeBonuses(state).offlineCapHours;
}

/** 노드 해금 명령 처리. 성공 여부 반환 */
export function unlockTreeNode(state: SimState, bus: EventBus, nodeId: string): boolean {
  const node = TREE_NODES[nodeId];
  if (!node) return false;
  if (state.skills.treeNodes.includes(nodeId)) return false;
  if (node.requires && !state.skills.treeNodes.includes(node.requires)) return false;
  if (state.player.gold < node.cost) return false;
  state.player.gold -= node.cost;
  state.skills.treeNodes.push(nodeId);
  bus.emit('state', { type: 'treeNodeUnlocked', nodeId });
  return true;
}
