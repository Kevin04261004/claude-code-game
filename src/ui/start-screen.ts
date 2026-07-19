/**
 * 시작 화면 — 게임 부팅 전 게이트 (ARCHITECTURE.md §9.2).
 * "게스트로 플레이"는 항상 즉시 가능(로컬 우선 원칙), Google 로그인은
 * firebase 준비(cloudReady)가 끝나면 활성화된다. 이미 로그인된 계정이
 * 복원되면 "계속하기" 하나로 합쳐진다.
 *
 * 반환: 'guest'(클라우드 없이/늦게) | 'synced'(로그인·복원 완료 — 시작 전 클라우드 비교 진행)
 */
import type { AuthStatus } from '../app/ports';
import type { CloudHandle } from '../cloud/boot';
import { compareSaves, summarize } from '../cloud/sync';
import type { SaveDataV1 } from '../save/save-schema';
import { button, el, fmtDuration } from './dom';

export type StartMode = 'guest' | 'synced';

export function showStartScreen(localSave: SaveDataV1 | null, cloudReady: Promise<CloudHandle | null>): Promise<StartMode> {
  return new Promise((resolve) => {
    const screen = el('div', 'start-screen');
    const inner = el('div', 'start-inner');

    inner.append(el('div', 'start-title', 'AFK METEOR'));
    inner.append(el('div', 'start-sub', '방치형 자동전투 — 우주를 떠도는 동안에도 성장합니다'));

    if (localSave) {
      const s = summarize(localSave);
      inner.append(el('div', 'start-save-info', `이 기기의 세이브: Lv.${s.level} · 스테이지 ${s.stageIndex + 1} · ${fmtDuration(s.playtimeSec * 1000)}`));
    }
    // 로그인 세션이 복원되면 클라우드 세이브를 미리 조회해 여기에 표시한다
    const cloudInfo = el('div', 'start-save-info');
    cloudInfo.style.display = 'none';
    inner.append(cloudInfo);

    const actions = el('div', 'start-actions');
    const hint = el('div', 'start-hint', '');
    const done = (mode: StartMode) => {
      screen.remove();
      resolve(mode);
    };

    // 게스트 버튼 — 항상 즉시 사용 가능 (로그인 계정이 복원되면 '계속하기'로 바뀐다)
    let primaryMode: StartMode = 'guest';
    const guestBtn = button(localSave ? '▶ 게스트로 계속하기' : '▶ 게스트로 시작', () => done(primaryMode), 'btn wide start-btn');

    // Google 버튼 — firebase 준비 후 활성화
    let googleAction: () => void = () => {};
    const googleBtn = button('Google 연결 중…', () => googleAction(), 'btn wide secondary start-btn');
    googleBtn.disabled = true;

    actions.append(guestBtn, googleBtn);
    inner.append(actions, hint);
    const subHint = el('div', 'start-hint dim', '로그인하면 다른 기기에서도 이어할 수 있어요');
    inner.append(subHint);
    screen.append(inner);
    document.body.append(screen);

    void cloudReady.then((handle) => {
      if (!handle) {
        googleBtn.textContent = '오프라인 — 로그인 불가';
        return;
      }
      handle.auth.onStatus((s) => applyStatus(handle, s));
    });

    let cloudPreviewStarted = false;

    function applyStatus(handle: CloudHandle, s: AuthStatus): void {
      if (s.state === 'linked') {
        // 이미 로그인된 계정 복원 — 버튼 하나로 합치고, 클라우드 세이브를 미리 보여준다
        primaryMode = 'synced';
        guestBtn.textContent = `▶ 계속하기 (${s.user.email ?? '로그인됨'})`;
        googleBtn.style.display = 'none';
        void showCloudPreview(handle);
        return;
      }
      if (s.state === 'guest') {
        googleBtn.disabled = false;
        googleBtn.textContent = 'Google로 로그인';
        googleAction = () => {
          // 팝업 차단 방지: 클릭 핸들러에서 선행 await 없이 즉시 호출
          void handle.auth.linkWithGoogle().then((r) => {
            if (r.kind === 'linked' || r.kind === 'switched-account') {
              done('synced');
            } else if (r.kind === 'popup-blocked') {
              hint.textContent = '⚠️ 브라우저가 팝업을 차단했어요. 팝업 허용 후 다시 시도해 주세요.';
            } else if (r.kind === 'error') {
              hint.textContent = `⚠️ 로그인 실패 (${r.code}). 게스트로 시작한 뒤 나중에 다시 시도할 수 있어요.`;
            }
            // cancelled → 그대로 대기
          });
        };
      }
      if (s.state === 'offline' || s.state === 'error') {
        googleBtn.disabled = true;
        googleBtn.textContent = s.state === 'offline' ? '오프라인 — 로그인 불가' : '로그인 불가 (연결 오류)';
      }
    }

    /** 클라우드 세이브 요약 + 계속하기 시 어느 쪽으로 이어지는지 안내 (판정은 resolveStartSave와 동일 로직) */
    async function showCloudPreview(handle: CloudHandle): Promise<void> {
      if (cloudPreviewStarted) return;
      cloudPreviewStarted = true;
      let remote: SaveDataV1 | null = null;
      try {
        remote = await handle.cloud.fetch(handle.uid());
      } catch {
        return; // 조회 실패 — 안내 생략, 시작 시 resolveStartSave가 다시 시도한다
      }
      if (!remote) {
        if (localSave) subHint.textContent = '클라우드에 세이브 없음 — 계속하면 이 기기의 세이브가 올라갑니다';
        return;
      }
      const c = summarize(remote);
      cloudInfo.textContent = `☁️ 클라우드 세이브: Lv.${c.level} · 스테이지 ${c.stageIndex + 1} · ${fmtDuration(c.playtimeSec * 1000)}`;
      cloudInfo.style.display = '';
      subHint.textContent = previewHint(remote);
    }

    function previewHint(remote: SaveDataV1): string {
      if (!localSave) return '계속하면 클라우드 세이브로 이어집니다';
      const v = compareSaves(localSave, remote);
      if (v.kind === 'use-cloud') return '클라우드가 더 앞서 있어요 — 계속하면 클라우드 세이브로 이어집니다';
      if (v.kind === 'ask') return '두 세이브의 진행도가 서로 달라요 — 계속하면 선택 화면이 나옵니다';
      return v.uploadNeeded
        ? '이 기기가 더 앞서 있어요 — 계속하면 이 세이브가 클라우드에 올라갑니다'
        : '클라우드와 같은 지점입니다 — 이어서 계속합니다';
    }
  });
}
