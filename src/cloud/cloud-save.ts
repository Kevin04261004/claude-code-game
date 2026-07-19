/**
 * 클라우드 미러 업로드 스케줄러 (ARCHITECTURE.md §9.3).
 * 로컬 저장이 일어날 때마다 notifySaved()로 통지받아, 디바운스 후 업로드한다.
 * 로컬이 진실의 원천이므로 업로드 실패는 게임에 영향을 주지 않는다.
 *
 * - 디바운스: BALANCE.CLOUD_UPLOAD_DEBOUNCE_MS (쓰기 쿼터 보호)
 * - 중요 통지(notifyCritical): 플레이어 조작(스킬/무기 등) 직후 — criticalDebounceMs의
 *   짧은 디바운스로 빠르게 미러링. 연타는 마지막 조작 기준 1회 업로드로 합쳐진다.
 * - dedupe: playtimeSec이 마지막 업로드와 같으면 스킵 (시뮬이 안 돌았으면 내용 동일).
 *   중요 통지는 명령이 상태를 바꿨다는 뜻이므로 이 dedupe를 우회한다(dirty).
 * - 탭 숨김(isHidden) 시: 디바운스 없이 즉시 fire-and-forget (복귀를 못 기다림)
 * - 오프라인(online() false) 시: 스킵하고 offline 상태 표시 — 다음 통지에서 재시도
 *
 * firebase를 import하지 않는다 — 업로더/타이머를 주입받아 fake로 테스트한다.
 */
import type { SaveDataV1 } from '../save/save-schema';

export interface UploadStatus {
  state: 'idle' | 'pending' | 'uploading' | 'offline' | 'error';
  lastUploadAt: number | null;
}

/** 브라우저(number)/Node(Timeout) 차이를 흡수하는 불투명 타이머 핸들 */
type TimerId = unknown;

interface SchedulerDeps {
  upload: (save: SaveDataV1) => Promise<void>;
  debounceMs: number;
  /** notifyCritical에 쓰는 짧은 디바운스 — 생략 시 debounceMs와 동일 */
  criticalDebounceMs?: number;
  online?: () => boolean;
  isHidden?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => TimerId;
  clearTimer?: (id: TimerId) => void;
  now?: () => number;
}

export class UploadScheduler {
  private timer: TimerId | null = null;
  private latest: SaveDataV1 | null = null;
  private lastUploadedPlaytime: number | null = null;
  /** 마지막 업로드 이후 내용이 바뀌었는가 — 중요 통지는 playtime dedupe 대신 이 플래그를 쓴다 */
  private dirty = false;
  private status: UploadStatus = { state: 'idle', lastUploadAt: null };
  private listeners = new Set<(s: UploadStatus) => void>();

  constructor(private readonly deps: SchedulerDeps) {}

  notifySaved(save: SaveDataV1): void {
    if (!this.dirty && save.playtimeSec === this.lastUploadedPlaytime) return; // 내용 변화 없음
    this.latest = save;
    this.dirty = true;

    if (this.deps.isHidden?.()) {
      // 탭이 숨겨짐 — 돌아온다는 보장이 없으니 즉시 최선 시도
      this.cancelTimer();
      void this.flush();
      return;
    }
    if (this.timer !== null) return; // 이미 예약됨 — 최신본만 갈아끼움 (위에서 완료)
    this.schedule(this.deps.debounceMs);
  }

  /**
   * 플레이어 조작(스킬 강화/추첨, 무기 강화 등) 직후의 통지 — 짧은 디바운스로
   * 빠르게 미러링한다. 기존 예약을 앞당기고, 연타는 마지막 조작 기준으로 합쳐진다.
   */
  notifyCritical(save: SaveDataV1): void {
    this.latest = save;
    this.dirty = true; // 명령이 상태를 바꿨다 — 같은 초의 playtime이어도 업로드해야 한다

    if (this.deps.isHidden?.()) {
      this.cancelTimer();
      void this.flush();
      return;
    }
    this.cancelTimer(); // 60초 예약이 있어도 짧은 쪽으로 앞당긴다
    this.schedule(this.deps.criticalDebounceMs ?? this.deps.debounceMs);
  }

  /** 예약 여부와 무관하게 대기 중인 최신 세이브를 즉시 업로드 */
  async flush(): Promise<void> {
    this.cancelTimer();
    const save = this.latest;
    if (!save || !this.dirty) return;

    const online = this.deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    if (!online()) {
      this.setStatus({ state: 'offline' });
      return; // 다음 notifySaved에서 재시도
    }

    this.setStatus({ state: 'uploading' });
    try {
      await this.deps.upload(save);
      this.lastUploadedPlaytime = save.playtimeSec;
      if (this.latest === save) this.dirty = false; // 업로드 중 새 통지가 왔으면 dirty 유지
      const now = this.deps.now ?? Date.now;
      this.setStatus({ state: 'idle', lastUploadAt: now() });
    } catch (e) {
      console.warn('[cloud] 업로드 실패 — 로컬 저장은 안전합니다', e);
      this.setStatus({ state: 'error' });
    }
  }

  private schedule(ms: number): void {
    const setTimer = this.deps.setTimer ?? ((fn: () => void, delay: number) => setTimeout(fn, delay));
    this.timer = setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
    this.setStatus({ state: 'pending' });
  }

  onStatus(cb: (s: UploadStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      const clearTimer = this.deps.clearTimer ?? ((id: TimerId) => clearTimeout(id as ReturnType<typeof setTimeout>));
      clearTimer(this.timer);
      this.timer = null;
    }
  }

  private setStatus(patch: Partial<UploadStatus> & { state: UploadStatus['state'] }): void {
    this.status = { lastUploadAt: this.status.lastUploadAt, ...patch };
    for (const cb of this.listeners) cb(this.status);
  }
}
