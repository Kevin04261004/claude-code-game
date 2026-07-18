/**
 * 오프라인 보상 정산 모달 (§5.2 6단계) — 복귀 시 SettlementReport 표시.
 */
import type { SettlementReport } from '../sim/offline/offline-settlement';
import { button, el, fmt, fmtDuration } from './dom';

export function showOfflineModal(report: SettlementReport): void {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal');
  modal.append(el('div', 'modal-title', '⏰ 오프라인 보상'));
  modal.append(el('div', 'modal-sub', `${fmtDuration(report.elapsedMs)} 동안 자리를 비웠습니다`));

  const list = el('div', 'modal-list');
  const rows: [string, string][] = [
    ['💰 골드', `+${fmt(report.gold)}`],
    ['⚔️ 처치', `+${fmt(report.kills)}`],
    ['⭐ 레벨', `${report.fromLevel} → ${report.toLevel}`],
    ['🗺️ 스테이지', `${report.fromStage + 1} → ${report.toStage + 1}`],
  ];
  for (const [label, value] of rows) {
    const row = el('div', 'modal-row');
    row.append(el('span', undefined, label), el('span', 'hud-value', value));
    list.append(row);
  }
  modal.append(list);
  modal.append(el('div', 'modal-hint', `상한 ${report.cappedByHours}시간 — 스킬 트리 '시간 압축'으로 확장 가능`));
  modal.append(button('받기', () => overlay.remove(), 'btn wide'));

  overlay.append(modal);
  root.append(overlay);
}
