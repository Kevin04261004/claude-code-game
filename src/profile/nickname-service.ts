/**
 * 닉네임 서비스 (ARCHITECTURE.md §9.8) — INickname 구현.
 * AuthService와 같은 형태: 상태를 들고 있고 onState로 구독을 알린다.
 *
 * 유일성의 실제 원자성(read-check-write)은 NicknameStore.claim이 책임진다
 * (Firestore 트랜잭션 — firebase/client.ts). 이 서비스는 검증·상태만 담당해
 * 네트워크 없이 fake store로 테스트된다.
 */
import type { INickname, NicknameState, SetNicknameResult } from '../app/ports';
import type { NicknameStore } from '../firebase/client';
import { validateNickname } from './nickname-rules';

function codeOf(err: unknown): string {
  const c = (err as { code?: unknown })?.code;
  return typeof c === 'string' ? c : 'unknown';
}

export class NicknameService implements INickname {
  private state: NicknameState = { status: 'loading', nickname: null };
  private listeners = new Set<(s: NicknameState) => void>();

  constructor(
    private readonly store: NicknameStore,
    /** 현재 uid — 계정 전환(Google 연결)이 반영된 최신값을 준다 */
    private readonly uid: () => string,
  ) {}

  async load(): Promise<void> {
    this.setState({ status: 'loading', nickname: this.state.nickname });
    try {
      const profile = await this.store.load(this.uid());
      this.setState({ status: 'ready', nickname: profile?.nickname ?? null });
    } catch (e) {
      console.warn('[nickname] 닉네임 조회 실패', e);
      this.setState({ status: 'error', nickname: this.state.nickname });
    }
  }

  async setNickname(raw: string): Promise<SetNicknameResult> {
    const v = validateNickname(raw);
    if (!v.ok) return { kind: 'invalid', reason: v.reason };
    try {
      const outcome = await this.store.claim(this.uid(), v.value, v.key);
      if (outcome === 'taken') return { kind: 'taken' };
      this.setState({ status: 'ready', nickname: v.value });
      return { kind: 'ok', nickname: v.value };
    } catch (e) {
      return { kind: 'error', code: codeOf(e) };
    }
  }

  current(): string | null {
    return this.state.nickname;
  }

  onState(cb: (s: NicknameState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private setState(s: NicknameState): void {
    this.state = s;
    for (const cb of this.listeners) cb(s);
  }
}
