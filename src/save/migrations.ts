/**
 * 세이브 버전 마이그레이션 체인 (§6).
 * v1이 최초 버전이므로 아직 비어 있다. v2 도입 시:
 *   MIGRATIONS[1] = (s) => ({ ...s, version: 2, 새필드: 기본값 })
 * 로드 시 version부터 SAVE_VERSION까지 순차 적용된다.
 */
import { SAVE_VERSION, validateSave, type SaveDataV1 } from './save-schema';

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {};

/** 임의 버전의 파싱된 세이브 → 최신 스키마. 실패 시 throw (복구 체인이 잡는다) */
export function migrate(raw: unknown): SaveDataV1 {
  if (!raw || typeof raw !== 'object') throw new Error('migrate: not an object');
  let save = raw as Record<string, unknown>;
  const v = save['version'];
  if (typeof v !== 'number') throw new Error('migrate: missing version');
  let version: number = v;
  if (version > SAVE_VERSION) throw new Error(`migrate: future version ${version}`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`migrate: no migration from v${version}`);
    save = step(save);
    version = save['version'] as number;
  }
  validateSave(save);
  return save;
}
