/**
 * 리더보드 패널 — ILeaderboard 인터페이스만 소비 (local/remote 무관).
 */
import type { IClock, ILeaderboard } from '../app/ports';
import { el, fmt } from './dom';

export class LeaderboardPanel {
  readonly root = el('div', 'panel-body');

  constructor(
    private readonly board: ILeaderboard,
    private readonly clock: IClock,
  ) {
    this.refresh();
  }

  refresh(): void {
    this.root.replaceChildren();
    this.root.append(el('div', 'section-title', '주간 리더보드 (로컬 시뮬레이션)'));
    const entries = this.board.entries(this.clock.now());
    entries.forEach((entry, i) => {
      const row = el('div', entry.isPlayer ? 'card equipped lb-row' : 'card lb-row');
      row.append(
        el('span', 'lb-rank', `${i + 1}`),
        el('span', 'lb-name', entry.name),
        el('span', 'lb-score', fmt(entry.score)),
      );
      this.root.append(row);
    });
  }
}
