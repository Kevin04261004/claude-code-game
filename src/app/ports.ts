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

/**
 * 실제 글로벌 랭킹 (Firestore 공개 프로필 기반, §9.8). 비동기·네트워크 의존이라
 * 동기 ILeaderboard와 분리한다. 실패/오프라인 시 UI가 ILeaderboard로 폴백한다.
 */
export interface IGlobalLeaderboard {
  /** 상위 limit명 (score 내림차순). isPlayer는 본인 uid로 표시 */
  top(limit: number): Promise<LeaderboardEntry[]>;
  /** 본인 점수를 공개 프로필에 게시. 닉네임 미설정이면 no-op (랭킹 미참여) */
  publish(score: number): Promise<void>;
  /** 본인 표시 이름 (닉네임 미설정이면 null) */
  selfName(): string | null;
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

// ── 닉네임 (ARCHITECTURE.md §9.8) — 계정 공개 식별자, 추후 랭킹용 ──

export type NicknameInvalidReason = 'empty' | 'too-short' | 'too-long' | 'invalid-char';

export type NicknameState =
  /** 아직 클라우드에서 조회 전 */
  | { status: 'loading'; nickname: string | null }
  /** 조회 완료 — nickname이 null이면 미설정 */
  | { status: 'ready'; nickname: string | null }
  /** 조회 실패 — 마지막으로 알던 값 유지 */
  | { status: 'error'; nickname: string | null };

export type SetNicknameResult =
  | { kind: 'ok'; nickname: string }
  | { kind: 'invalid'; reason: NicknameInvalidReason } // 형식 오류 (길이/문자)
  | { kind: 'taken' } // 다른 유저가 이미 사용 중
  | { kind: 'error'; code: string }; // 네트워크 등

export interface INickname {
  /** 현재 계정의 닉네임을 클라우드에서 불러온다 (계정 전환 시 재호출) */
  load(): Promise<void>;
  /** 검증 → 유일성 claim → 상태 갱신. 자유롭게 변경 가능 (이전 닉네임은 해제) */
  setNickname(raw: string): Promise<SetNicknameResult>;
  /** 마지막으로 알려진 닉네임 (미설정/미조회면 null) */
  current(): string | null;
  onState(cb: (s: NicknameState) => void): () => void;
}
