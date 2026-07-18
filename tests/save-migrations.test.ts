import { describe, expect, it } from 'vitest';
import { FixedClock } from '../src/core/clock';
import { migrate } from '../src/save/migrations';
import { SAVE_VERSION } from '../src/save/save-schema';
import { fromSave, newGameState, toSave } from '../src/save/serializer';
import { BACKUP_KEY, CORRUPT_PREFIX, MemoryStore, SAVE_KEY, SaveStorage } from '../src/save/storage';

function makeStorage(t = 1_000_000) {
  const store = new MemoryStore();
  const clock = new FixedClock(t);
  return { store, clock, storage: new SaveStorage(store, () => clock.now()) };
}

describe('세이브 직렬화 왕복', () => {
  it('toSave → fromSave 후 영속 필드가 보존된다', () => {
    const state = newGameState(42, 0);
    state.player.gold = 1234;
    state.player.level = 7;
    state.skills.owned.push({ id: 'nova:fire:common', level: 2 });
    state.skills.equipped[0] = 'nova:fire:common';
    state.stage.index = 5;
    state.stage.highestIndex = 6;

    const restored = fromSave(migrate(JSON.parse(JSON.stringify(toSave(state, 999)))));
    expect(restored.player.gold).toBe(1234);
    expect(restored.player.level).toBe(7);
    expect(restored.skills.owned).toEqual([{ id: 'nova:fire:common', level: 2 }]);
    expect(restored.skills.equipped[0]).toBe('nova:fire:common');
    expect(restored.stage.index).toBe(5);
    expect(restored.stage.highestIndex).toBe(6);
    // 전투장 순간 상태는 저장되지 않는다 (§6)
    expect(restored.enemies).toEqual([]);
    expect(restored.projectiles).toEqual([]);
  });

  it('미래 버전 세이브는 거부한다 (다운그레이드 시 손상으로 취급)', () => {
    const save = toSave(newGameState(1, 0), 0) as unknown as Record<string, unknown>;
    save['version'] = SAVE_VERSION + 1;
    expect(() => migrate(save)).toThrow();
  });
});

describe('로드 실패 복구 체인 (§6)', () => {
  it('정상 주 세이브 → primary 소스로 로드', () => {
    const { storage } = makeStorage();
    storage.write(toSave(newGameState(1, 0), 0));
    const res = storage.load();
    expect(res.source).toBe('primary');
    expect(res.save).not.toBeNull();
  });

  it('주 세이브 손상 + 백업 정상 → 백업 복구 + 손상본 보존 + 주 세이브 복원', () => {
    const { store, storage } = makeStorage();
    store.set(BACKUP_KEY, JSON.stringify(toSave(newGameState(1, 0), 0)));
    store.set(SAVE_KEY, '{"truncated": tru'); // 잘린 JSON
    const res = storage.load();
    expect(res.source).toBe('backup');
    expect(res.save).not.toBeNull();
    expect(res.corruptPreserved).not.toBeNull();
    expect(store.get(res.corruptPreserved!)).toBe('{"truncated": tru'); // 원문 그대로 보존
    expect(store.get(SAVE_KEY)).toBe(store.get(BACKUP_KEY)); // 백업으로 복원됨
  });

  it('둘 다 손상 → 손상본 보존 후 새 게임 (save: null)', () => {
    const { store, storage } = makeStorage();
    store.set(SAVE_KEY, 'not json at all');
    store.set(BACKUP_KEY, '{"version": 999}'); // 파싱은 되지만 검증 실패
    const res = storage.load();
    expect(res.source).toBe('new');
    expect(res.save).toBeNull();
    expect(res.corruptPreserved).not.toBeNull();
    expect(store.get(res.corruptPreserved!)).toBe('not json at all');
  });

  it('필수 필드 누락도 손상으로 취급', () => {
    const { store, storage } = makeStorage();
    const broken = toSave(newGameState(1, 0), 0) as unknown as Record<string, unknown>;
    delete broken['player'];
    store.set(SAVE_KEY, JSON.stringify(broken));
    const res = storage.load();
    expect(res.source).toBe('new');
  });

  it('세이브가 아예 없으면 조용히 새 게임', () => {
    const { storage } = makeStorage();
    const res = storage.load();
    expect(res.source).toBe('new');
    expect(res.corruptPreserved).toBeNull();
  });

  it('corrupt 키는 최근 3개까지만 보관', () => {
    const { store, clock, storage } = makeStorage();
    for (let i = 0; i < 5; i++) {
      clock.advance(1000);
      store.set(SAVE_KEY, `corrupt-${i}`);
      storage.load();
    }
    const corruptKeys = store.keys().filter((k) => k.startsWith(CORRUPT_PREFIX));
    expect(corruptKeys.length).toBeLessThanOrEqual(3);
  });

  it('백업은 1시간에 1회만 갱신된다', () => {
    const { store, clock, storage } = makeStorage();
    const s1 = toSave(newGameState(1, 0), 0);
    storage.write(s1); // 최초 쓰기 → 백업 생성
    const backup1 = store.get(BACKUP_KEY);
    clock.advance(60_000);
    const s2 = { ...s1, savedAt: 123456 };
    storage.write(s2); // 1시간 미경과 → 백업 유지
    expect(store.get(BACKUP_KEY)).toBe(backup1);
    clock.advance(61 * 60_000);
    storage.write(s2); // 1시간 경과 → 백업 갱신
    expect(store.get(BACKUP_KEY)).not.toBe(backup1);
  });
});
