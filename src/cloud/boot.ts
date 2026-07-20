/**
 * 클라우드 동기화 오케스트레이터 (ARCHITECTURE.md §9).
 * bootstrap이 dynamic import로 로드한다 — firebase 번들은 별도 청크,
 * 어떤 실패도 게임을 막지 않는다 (게스트 로컬 플레이는 항상 가능).
 *
 * 세 단계로 나뉜다:
 *  1) prepareCloud()      — 시작 화면과 병렬: SDK 로드 + 세션 복원/익명 로그인
 *  2) resolveStartSave()  — 게임 시작 전: 클라우드 비교·채택 (시작 전이라 reload 불필요)
 *  3) attachMirror()      — 게임 중: 계정 UI + 디바운스 미러 업로드
 */
import type { IGlobalLeaderboard } from '../app/ports';
import type { SaveDataV1 } from '../save/save-schema';
import { AuthService } from '../auth/auth-service';
import { AuthUi } from '../auth/auth-ui';
import { BALANCE } from '../config/balance';
import { FirestoreCloudSave, getFirebaseSdk, getLeaderboardStore, getNicknameStore } from '../firebase/client';
import { GlobalLeaderboard } from '../leaderboard/global-provider';
import { NicknameService } from '../profile/nickname-service';
import { UploadScheduler } from './cloud-save';
import { showConflictModal } from './conflict-ui';
import { resolveInitial, summarize } from './sync';

export interface CloudHandle {
  auth: AuthService;
  cloud: FirestoreCloudSave;
  /** 현재 uid — Google 연결로 계정이 전환되면 자동 갱신된다 */
  uid(): string;
}

export async function prepareCloud(): Promise<CloudHandle> {
  const cloud = new FirestoreCloudSave();
  const auth = new AuthService(getFirebaseSdk());
  let uid = '';
  auth.onStatus((s) => {
    if (s.state === 'guest' || s.state === 'linked') uid = s.user.uid;
  });
  await auth.ensureSignedIn();
  return { auth, cloud, uid: () => uid };
}

/**
 * 게임 시작 전에 사용할 세이브를 결정한다. 클라우드 채택 시에도 아직 시뮬이
 * 없으므로 재부팅 없이 반환값으로 바로 시작하면 된다. 밀린 쪽은 항상 보존.
 */
export async function resolveStartSave(h: CloudHandle, local: SaveDataV1 | null): Promise<SaveDataV1 | null> {
  let remote: SaveDataV1 | null = null;
  try {
    remote = await h.cloud.fetch(h.uid());
  } catch (e) {
    console.warn('[cloud] 클라우드 세이브 조회 실패 — 로컬로 시작합니다', e);
    return local;
  }

  const verdict = resolveInitial(local, remote);
  if (verdict.kind === 'use-local') {
    if (verdict.uploadNeeded && local) void uploadQuiet(h, local);
    return local;
  }
  if (verdict.kind === 'use-cloud') {
    if (local) await preserve(h, local);
    return remote;
  }

  const choice = await showConflictModal(summarize(local!), summarize(remote!));
  if (choice === 'cloud') {
    await preserve(h, local!);
    return remote;
  }
  await preserve(h, remote!);
  void uploadQuiet(h, local!);
  return local;
}

/** bootstrap의 saveNow가 호출하는 미러 통지 인터페이스 */
export interface MirrorNotifier {
  /** 일반 저장(자동저장 등) — 긴 디바운스 */
  notifySaved(s: SaveDataV1): void;
  /** 플레이어 조작(스킬/무기 등) 직후 — 짧은 디바운스로 빠르게 업로드 */
  notifyCritical(s: SaveDataV1): void;
}

export interface MirrorDeps {
  currentSave: () => SaveDataV1;
  writeLocalSave: (s: SaveDataV1) => void;
  hudRoot: HTMLElement;
  /** 미러 준비 완료 시 통지 인터페이스를 넘겨준다 (bootstrap의 saveNow가 호출) */
  onUploaderReady: (uploader: MirrorNotifier) => void;
  /** 글로벌 랭킹 소스 준비 완료 — 랭킹 패널이 붙이고, saveNow가 점수를 게시한다 */
  onLeaderboardReady?: (global: IGlobalLeaderboard) => void;
  reload: () => void;
}

/**
 * 게임 중 미러 연결. runInitialSync는 시작 화면 단계에서 클라우드 준비가
 * 늦어 비교를 건너뛴 경우만 true — 이때 클라우드가 앞서면 교체 후 재부팅한다.
 */
export function attachMirror(h: CloudHandle, deps: MirrorDeps, runInitialSync: boolean): void {
  const scheduler = new UploadScheduler({
    upload: (save) => h.cloud.upload(h.uid(), save),
    debounceMs: BALANCE.CLOUD_UPLOAD_DEBOUNCE_MS,
    criticalDebounceMs: BALANCE.CLOUD_UPLOAD_CRITICAL_DEBOUNCE_MS,
    isHidden: () => document.visibilityState === 'hidden',
  });

  const nickname = new NicknameService(getNicknameStore(), h.uid);
  const ui = new AuthUi(deps.hudRoot, h.auth, nickname, () => {
    void syncInGame();
    void nickname.load(); // 계정 전환 시 새 계정의 닉네임으로 갱신
  });
  ui.bindUploader(scheduler);
  void nickname.load();

  const global = new GlobalLeaderboard(getLeaderboardStore(), h.uid, () => nickname.current());
  deps.onLeaderboardReady?.(global);

  deps.onUploaderReady({
    notifySaved: (save) => scheduler.notifySaved(save),
    notifyCritical: (save) => scheduler.notifyCritical(save),
  });
  window.addEventListener('online', () => void scheduler.flush());
  if (runInitialSync) void syncInGame();

  /** 게임 도중의 비교(늦은 초기 비교/로그인 직후) — 클라우드 채택은 로컬 교체 + 재부팅 */
  async function syncInGame(): Promise<void> {
    const local = deps.currentSave();
    let remote: SaveDataV1 | null = null;
    try {
      remote = await h.cloud.fetch(h.uid());
    } catch (e) {
      console.warn('[cloud] 클라우드 세이브 조회 실패', e);
      return;
    }
    const verdict = resolveInitial(local, remote);

    if (verdict.kind === 'use-local') {
      if (verdict.uploadNeeded) void uploadQuiet(h, local);
      return;
    }
    const choice = verdict.kind === 'use-cloud' ? 'cloud' : await showConflictModal(summarize(local), summarize(remote!));
    if (choice === 'cloud') {
      await preserve(h, local);
      try {
        deps.writeLocalSave(remote!);
      } catch (e) {
        console.warn('[cloud] 로컬 교체 실패 — 재부팅을 중단합니다', e);
        return;
      }
      deps.reload(); // state가 앱 전반의 클로저에 묶여 있어 재부팅이 가장 안전하다
    } else {
      await preserve(h, remote!);
      void uploadQuiet(h, local);
    }
  }
}

function uploadQuiet(h: CloudHandle, save: SaveDataV1): Promise<void> {
  return h.cloud.upload(h.uid(), save).catch((e) => console.warn('[cloud] 업로드 실패 — 로컬 저장은 안전합니다', e));
}

/** 밀린 세이브 보존 — 클라우드 실패 시 localStorage로 폴백 (어느 쪽도 파괴하지 않는다) */
async function preserve(h: CloudHandle, loser: SaveDataV1): Promise<void> {
  try {
    await h.cloud.preserveDiscarded(h.uid(), loser);
  } catch {
    try {
      localStorage.setItem(`idle-game:save:discarded-${Date.now()}`, JSON.stringify(loser));
    } catch {
      // 저장 공간 부족 등 — 보존 실패가 동기화 자체를 막지는 않는다
    }
  }
}
