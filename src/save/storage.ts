/**
 * localStorage 어댑터 + 로드 실패 복구 체인 (ARCHITECTURE.md §6)
 *   주 세이브 파싱/검증 실패 → 백업 시도 → 둘 다 실패 시 손상본을
 *   corrupt-* 키에 원문 보존 후 새 게임. 어떤 단계에서도 기존 데이터를
 *   삭제하며 시작하지 않는다.
 */
import type { IKeyValueStore } from '../app/ports';
import { migrate } from './migrations';
import type { SaveDataV1 } from './save-schema';

export const SAVE_KEY = 'idle-game:save';
export const BACKUP_KEY = 'idle-game:save:backup';
export const CORRUPT_PREFIX = 'idle-game:save:corrupt-';
const MAX_CORRUPT_KEEP = 3;

export type LoadSource = 'primary' | 'backup' | 'new';

export interface LoadResult {
  save: SaveDataV1 | null; // null이면 새 게임 시작
  source: LoadSource;
  corruptPreserved: string | null; // 보존된 손상본 키
}

/** 브라우저 localStorage 구현 */
export class LocalStore implements IKeyValueStore {
  get(key: string): string | null {
    return localStorage.getItem(key);
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  remove(key: string): void {
    localStorage.removeItem(key);
  }
  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  }
}

/** 테스트용 인메모리 구현 */
export class MemoryStore implements IKeyValueStore {
  private map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

export class SaveStorage {
  private lastBackupAt = 0;

  constructor(
    private readonly store: IKeyValueStore,
    private readonly now: () => number,
  ) {}

  load(): LoadResult {
    const primaryRaw = this.store.get(SAVE_KEY);
    if (primaryRaw !== null) {
      const primary = this.tryParse(primaryRaw);
      if (primary) return { save: primary, source: 'primary', corruptPreserved: null };
    }

    const backupRaw = this.store.get(BACKUP_KEY);
    if (backupRaw !== null) {
      const backup = this.tryParse(backupRaw);
      if (backup) {
        const corruptKey = primaryRaw !== null ? this.preserveCorrupt(primaryRaw) : null;
        this.store.set(SAVE_KEY, backupRaw); // 백업을 주 세이브로 복원
        return { save: backup, source: 'backup', corruptPreserved: corruptKey };
      }
    }

    // 둘 다 실패 — 존재했던 원문을 보존하고 새 게임
    let corruptKey: string | null = null;
    if (primaryRaw !== null) corruptKey = this.preserveCorrupt(primaryRaw);
    else if (backupRaw !== null) corruptKey = this.preserveCorrupt(backupRaw);
    return { save: null, source: primaryRaw === null && backupRaw === null ? 'new' : 'new', corruptPreserved: corruptKey };
  }

  write(save: SaveDataV1): void {
    this.store.set(SAVE_KEY, JSON.stringify(save));
    // 매시 1회 주 세이브를 백업으로 복사 (§6)
    const t = this.now();
    if (t - this.lastBackupAt >= 60 * 60_000) {
      this.lastBackupAt = t;
      this.store.set(BACKUP_KEY, JSON.stringify(save));
    }
  }

  private tryParse(raw: string): SaveDataV1 | null {
    try {
      return migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private preserveCorrupt(raw: string): string {
    const key = `${CORRUPT_PREFIX}${this.now()}`;
    this.store.set(key, raw);
    // 최근 N개만 보관 (localStorage 용량 보호)
    const corruptKeys = this.store
      .keys()
      .filter((k) => k.startsWith(CORRUPT_PREFIX))
      .sort();
    while (corruptKeys.length > MAX_CORRUPT_KEEP) {
      const oldest = corruptKeys.shift();
      if (oldest) this.store.remove(oldest);
    }
    return key;
  }
}
