/**
 * HUD — 골드/레벨/경험치/스테이지 표시. 매 프레임 sim 상태를 읽어 갱신 (읽기 전용).
 */
import { STAGE_CYCLE } from '../content/stages';
import { expToNext, killsToClear } from '../sim/progression/growth';
import type { SimState } from '../sim/state';
import { el } from './dom';
import { fmt } from './dom';

export class Hud {
  private readonly goldEl = el('span', 'hud-value');
  private readonly levelEl = el('span', 'hud-value');
  private readonly stageEl = el('span', 'hud-value');
  private readonly expBar = el('div', 'bar-fill exp');
  private readonly stageBar = el('div', 'bar-fill stage');

  constructor(root: HTMLElement) {
    const goldRow = el('div', 'hud-row');
    goldRow.append(el('span', 'hud-label', '💰 골드'), this.goldEl);
    const levelRow = el('div', 'hud-row');
    levelRow.append(el('span', 'hud-label', '⭐ 레벨'), this.levelEl);
    const stageRow = el('div', 'hud-row');
    stageRow.append(el('span', 'hud-label', '🗺️ 스테이지'), this.stageEl);

    const expTrack = el('div', 'bar-track');
    expTrack.append(this.expBar);
    const stageTrack = el('div', 'bar-track');
    stageTrack.append(this.stageBar);

    root.append(goldRow, levelRow, expTrack, stageRow, stageTrack);
  }

  update(state: SimState): void {
    this.goldEl.textContent = fmt(state.player.gold);
    this.levelEl.textContent = `Lv.${state.player.level}`;
    const theme = STAGE_CYCLE[state.stage.index % STAGE_CYCLE.length]!;
    this.stageEl.textContent = `${state.stage.index + 1} — ${theme.name}`;
    this.expBar.style.width = `${Math.min(100, (state.player.exp / expToNext(state.player.level)) * 100)}%`;
    this.stageBar.style.width = `${Math.min(100, (state.stage.kills / killsToClear(state.stage.index)) * 100)}%`;
  }
}
