/**
 * 클라우드 미러 업로드 스케줄러 (ARCHITECTURE.md §9.3).
 * 로컬 저장이 일어날 때마다 notifySaved()로 통지받아, 디바운스 후 업로드한다.
 * 로컬이 진실의 원천이므로 업로드 실패는 게임에 영향을 주지 않는다.
 *
 * - 디바운스: BALANCE.CLOUD_UPLOAD_DEBOUNCE_MS (쓰기 쿼터 보호)
 * - dedupe: playtimeSec이 마지막 업로드와 같으면 스킵 (시뮬이 안 돌았으면 내용 동일)
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
  private status: UploadStatus = { state: 'idle', lastUploadAt: null };
  private listeners = new Set<(s: UploadStatus) => void>();

  constructor(private readonly deps: SchedulerDeps) {}

  notifySaved(save: SaveDataV1): void {
    if (save.playtimeSec === this.lastUploadedPlaytime) return; // 내용 변화 없음
    this.latest = save;

    if (this.deps.isHidden?.()) {
      // 탭이 숨겨짐 — 돌아온다는 보장이 없으니 즉시 최선 시도
      this.cancelTimer();
      void this.flush();
      return;
    }
    if (this.timer !== null) return; // 이미 예약됨 — 최신본만 갈아끼움 (위에서 완료)
    const setTimer = this.deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this.timer = setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.deps.debounceMs);
    this.setStatus({ state: 'pending' });
  }

  /** 예약 여부와 무관하게 대기 중인 최신 세이브를 즉시 업로드 */
  async flush(): Promise<void> {
    this.cancelTimer();
    const save = this.latest;
    if (!save || save.playtimeSec === this.lastUploadedPlaytime) return;

    const online = this.deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    if (!online()) {
      this.setStatus({ state: 'offline' });
      return; // 다음 notifySaved에서 재시도
    }

    this.setStatus({ state: 'uploading' });
    try {
      await this.deps.upload(save);
      this.lastUploadedPlaytime = save.playtimeSec;
      const now = this.deps.now ?? Date.now;
      this.setStatus({ state: 'idle', lastUploadAt: now() });
    } catch (e) {
      console.warn('[cloud] 업로드 실패 — 로컬 저장은 안전합니다', e);
      this.setStatus({ state: 'error' });
    }
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
