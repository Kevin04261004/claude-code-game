/** 인증 서비스 (src/auth/auth-service.ts) — fake FirebaseSdk 주입 */
import { describe, expect, it } from 'vitest';
import type { AuthStatus, AuthUser } from '../src/app/ports';
import { AuthService } from '../src/auth/auth-service';
import type { FirebaseSdk } from '../src/firebase/client';

const anon: AuthUser = { uid: 'anon-1', isAnonymous: true, email: null };
const google: AuthUser = { uid: 'anon-1', isAnonymous: false, email: 'a@b.com' };
const other: AuthUser = { uid: 'other-9', isAnonymous: false, email: 'a@b.com' };

function fakeSdk(over: Partial<FirebaseSdk> = {}): FirebaseSdk {
  return {
    ensureAnonUser: async () => anon,
    linkWithGooglePopup: async () => google,
    signInWithCredentialFromError: async () => other,
    signOutUser: async () => {},
    ...over,
  };
}

describe('AuthService', () => {
  it('ensureSignedIn: 익명 유저를 반환하고 guest 상태를 알린다', async () => {
    const svc = new AuthService(fakeSdk());
    const statuses: AuthStatus[] = [];
    svc.onStatus((s) => statuses.push(s));
    const user = await svc.ensureSignedIn();
    expect(user).toEqual(anon);
    expect(statuses.at(-1)).toEqual({ state: 'guest', user: anon });
  });

  it('ensureSignedIn: 네트워크 실패 → offline 상태 + throw', async () => {
    const svc = new AuthService(
      fakeSdk({
        ensureAnonUser: async () => {
          throw { code: 'auth/network-request-failed' };
        },
      }),
    );
    let last: AuthStatus | null = null;
    svc.onStatus((s) => (last = s));
    await expect(svc.ensureSignedIn()).rejects.toBeTruthy();
    expect(last).toEqual({ state: 'offline' });
  });

  it('linkWithGoogle 성공 → linked 결과 + linked 상태', async () => {
    const svc = new AuthService(fakeSdk());
    let last: AuthStatus | null = null;
    svc.onStatus((s) => (last = s));
    expect(await svc.linkWithGoogle()).toEqual({ kind: 'linked' });
    expect(last).toEqual({ state: 'linked', user: google });
  });

  it('팝업 닫음/중복 요청 → cancelled', async () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
      const svc = new AuthService(
        fakeSdk({
          linkWithGooglePopup: async () => {
            throw { code };
          },
        }),
      );
      expect(await svc.linkWithGoogle()).toEqual({ kind: 'cancelled' });
    }
  });

  it('팝업 차단 → popup-blocked', async () => {
    const svc = new AuthService(
      fakeSdk({
        linkWithGooglePopup: async () => {
          throw { code: 'auth/popup-blocked' };
        },
      }),
    );
    expect(await svc.linkWithGoogle()).toEqual({ kind: 'popup-blocked' });
  });

  it('credential-already-in-use → 기존 계정으로 전환(switched-account)', async () => {
    const svc = new AuthService(
      fakeSdk({
        linkWithGooglePopup: async () => {
          throw { code: 'auth/credential-already-in-use' };
        },
      }),
    );
    let last: AuthStatus | null = null;
    svc.onStatus((s) => (last = s));
    expect(await svc.linkWithGoogle()).toEqual({ kind: 'switched-account', user: other });
    expect(last).toEqual({ state: 'linked', user: other });
  });

  it('알 수 없는 에러 → error 결과 (throw하지 않음)', async () => {
    const svc = new AuthService(
      fakeSdk({
        linkWithGooglePopup: async () => {
          throw { code: 'auth/internal-error' };
        },
      }),
    );
    expect(await svc.linkWithGoogle()).toEqual({ kind: 'error', code: 'auth/internal-error' });
  });

  it('signOut 후 다시 익명 세션을 연다', async () => {
    let anonCalls = 0;
    const svc = new AuthService(
      fakeSdk({
        ensureAnonUser: async () => {
          anonCalls++;
          return anon;
        },
      }),
    );
    await svc.ensureSignedIn();
    await svc.signOut();
    expect(anonCalls).toBe(2);
  });
});
