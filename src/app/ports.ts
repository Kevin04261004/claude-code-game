/**
 * 계층 간 인터페이스 모음 (ARCHITECTURE.md §2)
 * render/ui/save/leaderboard는 이 인터페이스를 통해서만 서로를 본다.
 */
import type { SaveDataV1 } from '../save/save-schema';
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

// ── 계정/클라우드 저장 (ARCHITECTURE.md §9) ──

export interface AuthUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
}

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'guest'; user: AuthUser }
  | { state: 'linked'; user: AuthUser }
  | { state: 'offline' }
  | { state: 'error'; code: string };

export type LinkResult =
  | { kind: 'linked' }
  | { kind: 'switched-account'; user: AuthUser } // 이미 다른 uid에 연결된 Google 계정 → 그 계정으로 전환됨
  | { kind: 'cancelled' }
  | { kind: 'popup-blocked' }
  | { kind: 'error'; code: string };

export interface IAuth {
  ensureSignedIn(): Promise<AuthUser>;
  /** 팝업 차단을 피하려면 클릭 핸들러에서 선행 await 없이 즉시 호출해야 한다 */
  linkWithGoogle(): Promise<LinkResult>;
  signOut(): Promise<void>;
  onStatus(cb: (s: AuthStatus) => void): () => void;
}

export interface ICloudSave {
  /** 다운로드 + migrate/validate 적용. 손상/없음 → null */
  fetch(uid: string): Promise<SaveDataV1 | null>;
  upload(uid: string, save: SaveDataV1): Promise<void>;
  /** 충돌에서 밀린 세이브를 users/{uid}/discarded/{epoch}에 보존 */
  preserveDiscarded(uid: string, save: SaveDataV1): Promise<void>;
}
