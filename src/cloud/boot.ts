/**
 * 클라우드 동기화 부트 오케스트레이터 (ARCHITECTURE.md §9).
 * bootstrap이 게임 시작 "후" dynamic import로 호출한다 — firebase 번들은
 * 별도 청크로 분리되어 첫 페인트에 영향이 없고, 어떤 실패도 게임을 막지 않는다.
 *
 * 흐름: 익명 로그인 → 클라우드 세이브 비교(§9.3) → 판정 실행 → 미러 업로더 연결.
 * Google 계정 전환(switched-account) 시 비교를 다시 돌린다.
 */
import type { SaveDataV1 } from '../save/save-schema';
import { AuthService } from '../auth/auth-service';
import { AuthUi } from '../auth/auth-ui';
import { BALANCE } from '../config/balance';
import { FirestoreCloudSave, getFirebaseSdk } from '../firebase/client';
import { UploadScheduler } from './cloud-save';
import { showConflictModal } from './conflict-ui';
import { compareSaves, summarize } from './sync';

export interface CloudBootDeps {
  currentSave: () => SaveDataV1;
  writeLocalSave: (s: SaveDataV1) => void;
  hudRoot: HTMLElement;
  /** 미러 준비 완료 시 로컬 저장 통지 콜백을 넘겨준다 (bootstrap의 saveNow가 호출) */
  onUploaderReady: (notify: (s: SaveDataV1) => void) => void;
  reload: () => void;
}

export async function startCloud(deps: CloudBootDeps): Promise<void> {
  const cloud = new FirestoreCloudSave();
  const auth = new AuthService(getFirebaseSdk());

  // 현재 uid 추적 — Google 연결로 계정이 전환되면 상태 이벤트로 갱신된다
  let uid = '';
  auth.onStatus((s) => {
    if (s.state === 'guest' || s.state === 'linked') uid = s.user.uid;
  });

  const scheduler = new UploadScheduler({
    upload: (save) => cloud.upload(uid, save),
    debounceMs: BALANCE.CLOUD_UPLOAD_DEBOUNCE_MS,
    isHidden: () => document.visibilityState === 'hidden',
  });

  const ui = new AuthUi(deps.hudRoot, auth, () => void syncOnce());
  ui.bindUploader(scheduler);

  await auth.ensureSignedIn(); // 실패 시 throw — bootstrap의 catch가 로컬 전용으로 안내
  await syncOnce();

  deps.onUploaderReady((save) => scheduler.notifySaved(save));
  window.addEventListener('online', () => void scheduler.flush());

  /** 로컬↔클라우드 비교 후 판정 실행. 클라우드 채택 시 로컬 교체 + 재부팅 */
  async function syncOnce(): Promise<void> {
    const local = deps.currentSave();
    const remote = await cloud.fetch(uid);
    const verdict = compareSaves(local, remote);

    if (verdict.kind === 'use-local') {
      if (verdict.uploadNeeded) await cloud.upload(uid, local);
      return;
    }

    const choice = verdict.kind === 'use-cloud' ? 'cloud' : await showConflictModal(summarize(local), summarize(remote!));

    if (choice === 'cloud') {
      await preserve(local); // 밀린 로컬을 보존 후 교체
      try {
        deps.writeLocalSave(remote!);
      } catch (e) {
        console.warn('[cloud] 로컬 교체 실패 — 재부팅을 중단합니다', e);
        return;
      }
      deps.reload(); // state가 앱 전반의 클로저에 묶여 있어 재부팅이 가장 안전하다
    } else {
      await preserve(remote!); // 밀린 클라우드를 보존 후 로컬로 덮어쓰기
      await cloud.upload(uid, local);
    }
  }

  /** 밀린 세이브 보존 — 클라우드 실패 시 localStorage로 폴백 (어느 쪽도 파괴하지 않는다) */
  async function preserve(loser: SaveDataV1): Promise<void> {
    try {
      await cloud.preserveDiscarded(uid, loser);
    } catch {
      try {
        localStorage.setItem(`idle-game:save:discarded-${Date.now()}`, JSON.stringify(loser));
      } catch {
        // 저장 공간 부족 등 — 보존 실패가 동기화 자체를 막지는 않는다
      }
    }
  }
}
