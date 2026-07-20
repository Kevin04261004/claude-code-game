/** 닉네임 서비스 (src/profile/nickname-service.ts) — fake NicknameStore 주입 */
import { describe, expect, it } from 'vitest';
import type { NicknameState } from '../src/app/ports';
import type { NicknameProfile, NicknameStore } from '../src/firebase/client';
import { NicknameService } from '../src/profile/nickname-service';

/** key → uid 점유 맵을 든 인메모리 store — Firestore 트랜잭션 규칙을 흉내낸다 */
function fakeStore(over: Partial<NicknameStore> = {}): NicknameStore & { profiles: Map<string, NicknameProfile>; claims: Map<string, string> } {
  const profiles = new Map<string, NicknameProfile>();
  const claims = new Map<string, string>(); // key → uid
  const store: NicknameStore & { profiles: typeof profiles; claims: typeof claims } = {
    profiles,
    claims,
    async load(uid) {
      return profiles.get(uid) ?? null;
    },
    async claim(uid, nickname, key) {
      const owner = claims.get(key);
      if (owner !== undefined && owner !== uid) return 'taken';
      const prev = profiles.get(uid);
      if (prev && prev.key !== key) claims.delete(prev.key); // 이전 key 해제
      claims.set(key, uid);
      profiles.set(uid, { nickname, key });
      return 'ok';
    },
    ...over,
  };
  return store;
}

describe('NicknameService', () => {
  it('load: 프로필 없으면 nickname null, ready 상태', async () => {
    const svc = new NicknameService(fakeStore(), () => 'u1');
    const states: NicknameState[] = [];
    svc.onState((s) => states.push(s));
    await svc.load();
    expect(states.at(-1)).toEqual({ status: 'ready', nickname: null });
    expect(svc.current()).toBeNull();
  });

  it('load: 저장된 닉네임을 불러온다', async () => {
    const store = fakeStore();
    store.profiles.set('u1', { nickname: '용사', key: '용사' });
    const svc = new NicknameService(store, () => 'u1');
    await svc.load();
    expect(svc.current()).toBe('용사');
  });

  it('setNickname: 검증 실패는 store를 건드리지 않는다', async () => {
    const store = fakeStore();
    const svc = new NicknameService(store, () => 'u1');
    expect(await svc.setNickname('가')).toEqual({ kind: 'invalid', reason: 'too-short' });
    expect(store.claims.size).toBe(0);
    expect(svc.current()).toBeNull();
  });

  it('setNickname: 성공하면 상태와 점유가 갱신된다', async () => {
    const store = fakeStore();
    const svc = new NicknameService(store, () => 'u1');
    expect(await svc.setNickname('Kevin')).toEqual({ kind: 'ok', nickname: 'Kevin' });
    expect(svc.current()).toBe('Kevin');
    expect(store.claims.get('kevin')).toBe('u1');
  });

  it('setNickname: 다른 유저가 점유한 이름은 taken', async () => {
    const store = fakeStore();
    await new NicknameService(store, () => 'u2').setNickname('용사'); // u2가 먼저 점유
    const svc = new NicknameService(store, () => 'u1');
    expect(await svc.setNickname('용사')).toEqual({ kind: 'taken' });
    expect(svc.current()).toBeNull();
  });

  it('setNickname: 변경 시 이전 key를 해제해 재사용 가능하게 한다', async () => {
    const store = fakeStore();
    const u1 = new NicknameService(store, () => 'u1');
    await u1.setNickname('첫이름');
    await u1.setNickname('둘째'); // 변경 — '첫이름' 해제되어야 함
    expect(store.claims.has('첫이름')).toBe(false);
    expect(u1.current()).toBe('둘째');

    // 다른 유저가 해제된 이름을 이제 쓸 수 있다
    const u2 = new NicknameService(store, () => 'u2');
    expect((await u2.setNickname('첫이름')).kind).toBe('ok');
  });

  it('setNickname: 대소문자만 바꾼 자기 이름은 taken이 아니다', async () => {
    const store = fakeStore();
    const svc = new NicknameService(store, () => 'u1');
    await svc.setNickname('Kevin');
    expect((await svc.setNickname('KEVIN')).kind).toBe('ok');
    expect(svc.current()).toBe('KEVIN');
  });

  it('setNickname: 네트워크 오류는 error로 감싼다', async () => {
    const store = fakeStore({
      claim: async () => {
        throw { code: 'unavailable' };
      },
    });
    const svc = new NicknameService(store, () => 'u1');
    expect(await svc.setNickname('용사')).toEqual({ kind: 'error', code: 'unavailable' });
  });

  it('load 실패는 error 상태로, 이전 닉네임은 유지한다', async () => {
    const store = fakeStore();
    store.profiles.set('u1', { nickname: '용사', key: '용사' });
    const svc = new NicknameService(store, () => 'u1');
    await svc.load();
    store.load = async () => {
      throw { code: 'unavailable' };
    };
    await svc.load();
    expect(svc.current()).toBe('용사');
  });
});
