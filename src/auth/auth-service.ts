/**
 * 인증 서비스 (ARCHITECTURE.md §9.2) — "게스트 우선, 로그인은 업그레이드".
 * FirebaseSdk 파사드를 주입받는다 (firebase에서 import type만 — 테스트는 fake 주입).
 *
 * Google 연결 흐름:
 *  - linkWithGooglePopup은 클릭 핸들러에서 선행 await 없이 즉시 호출돼야
 *    팝업 차단에 걸리지 않는다 (호출자 계약 — auth-ui가 지킨다).
 *  - credential-already-in-use: 이 Google 계정이 이미 다른 uid에 연결됨
 *    (예: 다른 기기에서 먼저 로그인) → 그 계정으로 전환하고 switched-account
 *    반환. 호출자는 클라우드 비교를 다시 돌려 로컬 세이브를 지킨다.
 */
import type { AuthStatus, AuthUser, IAuth, LinkResult } from '../app/ports';
import type { FirebaseSdk } from '../firebase/client';

function codeOf(err: unknown): string {
  const c = (err as { code?: unknown })?.code;
  return typeof c === 'string' ? c : 'unknown';
}

export class AuthService implements IAuth {
  private status: AuthStatus = { state: 'loading' };
  private listeners = new Set<(s: AuthStatus) => void>();

  constructor(private readonly sdk: FirebaseSdk) {}

  async ensureSignedIn(): Promise<AuthUser> {
    try {
      const user = await this.sdk.ensureAnonUser();
      this.setStatus(this.statusOf(user));
      return user;
    } catch (e) {
      const code = codeOf(e);
      this.setStatus(code === 'auth/network-request-failed' ? { state: 'offline' } : { state: 'error', code });
      throw e;
    }
  }

  linkWithGoogle(): Promise<LinkResult> {
    // 주의: 여기서 await/async 전처리 금지 — 팝업은 유저 제스처 직후에만 허용된다
    return this.sdk.linkWithGooglePopup().then(
      (user) => {
        this.setStatus(this.statusOf(user));
        return { kind: 'linked' } as const;
      },
      async (err: unknown) => {
        const code = codeOf(err);
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          return { kind: 'cancelled' } as const;
        }
        if (code === 'auth/popup-blocked') {
          return { kind: 'popup-blocked' } as const;
        }
        if (code === 'auth/credential-already-in-use') {
          try {
            const user = await this.sdk.signInWithCredentialFromError(err);
            this.setStatus(this.statusOf(user));
            return { kind: 'switched-account', user } as const;
          } catch (e2) {
            return { kind: 'error', code: codeOf(e2) } as const;
          }
        }
        return { kind: 'error', code } as const;
      },
    );
  }

  async signOut(): Promise<void> {
    await this.sdk.signOutUser();
    // 로그아웃 후에도 게임은 게스트로 계속 — 새 익명 세션을 연다 (로컬 세이브 유지)
    await this.ensureSignedIn();
  }

  onStatus(cb: (s: AuthStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  private statusOf(user: AuthUser): AuthStatus {
    return user.isAnonymous ? { state: 'guest', user } : { state: 'linked', user };
  }

  private setStatus(s: AuthStatus): void {
    this.status = s;
    for (const cb of this.listeners) cb(s);
  }
}
