/**
 * 세이브 충돌 선택 모달 (ARCHITECTURE.md §9.3).
 * 진행 축이 엇갈릴 때만 뜬다 — 양쪽 요약을 보여주고 유저가 고른다.
 * 선택 없이 닫을 수 없다 (배경 클릭 무시) — 어느 쪽이든 결정이 필요하다.
 */
import { button, el, fmtDuration } from '../ui/dom';
import type { SaveSummary } from './sync';

export function showConflictModal(local: SaveSummary, cloud: SaveSummary): Promise<'local' | 'cloud'> {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    if (!root) {
      resolve('local'); // 모달을 못 띄우면 로컬 유지가 안전한 기본값
      return;
    }

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal');
    modal.append(el('div', 'modal-title', '⚠️ 세이브 충돌'));
    modal.append(el('div', 'modal-sub', '이 기기와 클라우드의 진행이 서로 달라요. 사용할 세이브를 선택하세요.'));

    const grid = el('div', 'conflict-grid');
    grid.append(buildColumn('📱 이 기기', local), buildColumn('☁️ 클라우드', cloud));
    modal.append(grid);

    modal.append(el('div', 'modal-hint', '선택하지 않은 세이브는 복구용으로 보관됩니다.'));

    const done = (choice: 'local' | 'cloud') => {
      overlay.remove();
      resolve(choice);
    };
    const actions = el('div', 'modal-actions');
    actions.append(
      button('이 기기 사용', () => done('local')),
      button('클라우드 사용', () => done('cloud'), 'btn secondary'),
    );
    modal.append(actions);

    overlay.append(modal);
    root.append(overlay);
  });
}

function buildColumn(title: string, s: SaveSummary): HTMLElement {
  const col = el('div', 'conflict-col');
  col.append(el('div', 'conflict-title', title));
  const rows: [string, string][] = [
    ['레벨', `Lv.${s.level}`],
    ['스테이지', `${s.stageIndex + 1}`],
    ['플레이', fmtDuration(s.playtimeSec * 1000)],
    ['저장', formatSavedAt(s.savedAt)],
  ];
  for (const [label, value] of rows) {
    const row = el('div', 'conflict-row');
    row.append(el('span', 'hud-label', label), el('span', 'hud-value', value));
    col.append(row);
  }
  return col;
}

function formatSavedAt(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
