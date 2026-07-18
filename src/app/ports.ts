/**
 * 계층 간 인터페이스 모음 (ARCHITECTURE.md §2)
 * render/ui/save/leaderboard는 이 인터페이스를 통해서만 서로를 본다.
 */
import type { SimState } from '../sim/state';

export interface IRenderer {
  /** alpha: 직전 틱→현재 틱 보간 계수 [0,1) */
  render(state: SimState, alpha: number): void;
}

export interface IClock {
  now(): number;
}

/** localStorage 추상화 — 테스트에서는 인메모리 구현으로 대체 */
export interface IKeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  isPlayer: boolean;
}

export interface ILeaderboard {
  entries(nowMs: number): LeaderboardEntry[];
}
