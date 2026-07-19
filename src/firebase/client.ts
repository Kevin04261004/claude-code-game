/**
 * Firebase 초기화 단 한 곳 (ARCHITECTURE.md §9.6).
 * ★ 이 파일만 'firebase/*'를 import한다 — 다른 모듈은 여기서 import type만 허용.
 *   (vitest는 Node에서 SDK 없이 돌아야 하고, SDK 교체 비용을 한 파일로 가둔다)
 *
 * 아래 config는 공개돼도 안전한 클라이언트 식별자다 — 접근 제어는 전적으로
 * Firestore 보안 규칙(uid 일치)이 담당한다. analytics는 번들 절약을 위해 제외.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import type { AuthUser, ICloudSave } from '../app/ports';
import { migrate } from '../save/migrations';
import type { SaveDataV1 } from '../save/save-schema';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAt0gb5FnL7DvlLGHwLOvwrGDeCLIskdfM',
  authDomain: 'claude-code-game.firebaseapp.com',
  projectId: 'claude-code-game',
  storageBucket: 'claude-code-game.firebasestorage.app',
  messagingSenderId: '339835779058',
  appId: '1:339835779058:web:065673de753f45fcb4dd6b',
};

/** auth-service가 소비하는 좁은 파사드 — 테스트에서는 fake로 대체 */
export interface FirebaseSdk {
  /** 기존 세션 복원 또는 익명 로그인. 항상 로그인된 유저를 반환 */
  ensureAnonUser(): Promise<AuthUser>;
  /** 현재 유저에 Google 자격 증명 연결. 실패 시 { code: 'auth/...' } 형태로 throw */
  linkWithGooglePopup(): Promise<AuthUser>;
  /** credential-already-in-use 에러에서 자격 증명을 꺼내 그 계정으로 전환 */
  signInWithCredentialFromError(err: unknown): Promise<AuthUser>;
  signOutUser(): Promise<void>;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function getApp(): FirebaseApp {
  app ??= initializeApp(FIREBASE_CONFIG);
  return app;
}

function getAuthInstance(): Auth {
  auth ??= getAuth(getApp());
  return auth;
}

function getDb(): Firestore {
  db ??= getFirestore(getApp());
  return db;
}

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email };
}

/** 초기 인증 상태 복원(비동기)을 한 번 기다린다 */
function firstAuthState(a: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(a, (u) => {
      stop();
      resolve(u);
    });
  });
}

export function getFirebaseSdk(): FirebaseSdk {
  return {
    async ensureAnonUser() {
      const a = getAuthInstance();
      const existing = a.currentUser ?? (await firstAuthState(a));
      const user = existing ?? (await signInAnonymously(a)).user;
      return toAuthUser(user);
    },

    async linkWithGooglePopup() {
      const a = getAuthInstance();
      const current = a.currentUser;
      if (!current) throw { code: 'auth/no-current-user' };
      const result = await linkWithPopup(current, new GoogleAuthProvider());
      return toAuthUser(result.user);
    },

    async signInWithCredentialFromError(err: unknown) {
      const cred = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      if (!cred) throw { code: 'auth/no-credential-in-error' };
      const result = await signInWithCredential(getAuthInstance(), cred);
      return toAuthUser(result.user);
    },

    async signOutUser() {
      await signOut(getAuthInstance());
    },
  };
}

/** Firestore 미러 구현 — users/{uid} = { version, updatedAt, save } */
export class FirestoreCloudSave implements ICloudSave {
  async fetch(uid: string): Promise<SaveDataV1 | null> {
    const snap = await getDoc(doc(getDb(), 'users', uid));
    if (!snap.exists()) return null;
    try {
      return migrate((snap.data() as { save?: unknown }).save);
    } catch (e) {
      // 손상/미래 버전 클라우드 문서가 부팅을 막으면 안 된다 — 없는 것으로 취급
      console.warn('[cloud] 클라우드 세이브 검증 실패 — 무시합니다', e);
      return null;
    }
  }

  async upload(uid: string, save: SaveDataV1): Promise<void> {
    await setDoc(doc(getDb(), 'users', uid), this.envelope(save));
  }

  async preserveDiscarded(uid: string, save: SaveDataV1): Promise<void> {
    await setDoc(doc(getDb(), 'users', uid, 'discarded', String(Date.now())), this.envelope(save));
  }

  /** JSON 왕복: undefined/클래스 인스턴스가 Firestore에서 throw하는 것을 방지 */
  private envelope(save: SaveDataV1): Record<string, unknown> {
    return {
      version: save.version,
      updatedAt: serverTimestamp(),
      save: JSON.parse(JSON.stringify(save)) as unknown,
    };
  }
}
