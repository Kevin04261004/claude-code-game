/**
 * 계정 UI (ARCHITECTURE.md §9.2) — HUD에 상태 버튼 한 줄 + 클릭 시 계정 모달.
 * 로그인 강제 없음 — 로그인의 가치(기기 간 동기화)만 안내한다.
 */
import type { AuthStatus, IAuth, LinkResult } from '../app/ports';
import type { UploadScheduler, UploadStatus } from '../cloud/cloud-save';
import { button, el } from '../ui/dom';

export class AuthUi {
  private readonly statusBtn: HTMLButtonElement;
  private authStatus: AuthStatus = { state: 'loading' };
  private uploadStatus: UploadStatus = { state: 'idle', lastUploadAt: null };
  private modalRefresh: (() => void) | null = null;

  constructor(
    hudRoot: HTMLElement,
    private readonly auth: IAuth,
    /** 로그인 성공(첫 연결/기존 계정 전환) 직후 클라우드 비교·업로드를 즉시 돌린다 */
    private readonly onSignedIn: () => void,
  ) {
    const row = el('div', 'hud-row');
    row.append(el('span', 'hud-label', '☁️ 계정'));
    this.statusBtn = button('연결 중…', () => this.openModal(), 'btn account');
    row.append(this.statusBtn);
    hudRoot.append(row);
    auth.onStatus((s) => {
      this.authStatus = s;
      this.render();
    });
  }

  bindUploader(scheduler: UploadScheduler): void {
    scheduler.onStatus((s) => {
      this.uploadStatus = s;
      this.render();
    });
  }

  private render(): void {
    this.statusBtn.textContent = this.statusLabel();
    this.modalRefresh?.();
  }

  private statusLabel(): string {
    switch (this.authStatus.state) {
      case 'loading':
        return '연결 중…';
      case 'guest':
        return '게스트';
      case 'linked':
        return this.authStatus.user.email ?? '로그인됨';
      case 'offline':
        return '오프라인';
      case 'error':
        return '오류';
    }
  }

  // ── 계정 모달 ──

  private openModal(): void {
    const root = document.getElementById('modal-root');
    if (!root) return;

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal');
    const body = el('div');
    modal.append(body);

    const close = () => {
      this.modalRefresh = null;
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    let hint = ''; // 팝업 차단 등 일회성 안내
    const rebuild = () => {
      body.replaceChildren();
      body.append(el('div', 'modal-title', '☁️ 계정'));

      const list = el('div', 'modal-list');
      list.append(this.row('상태', this.statusLabel()));
      if (this.authStatus.state === 'guest' || this.authStatus.state === 'linked') {
        list.append(this.row('ID', `${this.authStatus.user.uid.slice(0, 8)}…`));
      }
      list.append(this.row('클라우드 저장', this.lastUploadLabel()));
      body.append(list);

      if (hint) body.append(el('div', 'modal-hint', hint));

      const actions = el('div', 'modal-actions');
      if (this.authStatus.state === 'linked') {
        body.append(el('div', 'modal-hint', '로그아웃해도 이 기기의 세이브는 유지됩니다.'));
        actions.append(
          button('로그아웃', () => void this.auth.signOut(), 'btn secondary'),
          button('닫기', close),
        );
      } else {
        body.append(el('div', 'modal-hint', '다른 기기에서 이어하려면 Google로 로그인하세요. 게스트 진행은 그대로 유지됩니다.'));
        actions.append(
          // 주의: 팝업 차단을 피하려면 클릭 핸들러에서 즉시 호출 (선행 await 금지)
          button('Google로 로그인', () => {
            void this.auth.linkWithGoogle().then((r) => {
              hint = this.linkResultHint(r);
              rebuild();
              if (r.kind === 'linked' || r.kind === 'switched-account') this.onSignedIn();
            });
          }),
          button('닫기', close, 'btn secondary'),
        );
      }
      body.append(actions);
    };

    this.modalRefresh = rebuild;
    rebuild();
    overlay.append(modal);
    root.append(overlay);
  }

  private linkResultHint(r: LinkResult): string {
    switch (r.kind) {
      case 'linked':
        return '✅ 연결 완료 — 이제 어느 기기에서든 이어할 수 있어요.';
      case 'switched-account':
        return '✅ 기존 계정으로 전환했어요 — 세이브를 비교하는 중입니다.';
      case 'popup-blocked':
        return '⚠️ 브라우저가 팝업을 차단했어요. 팝업 허용 후 다시 시도해 주세요.';
      case 'cancelled':
        return '';
      case 'error':
        return `⚠️ 로그인 실패 (${r.code}). 잠시 후 다시 시도해 주세요.`;
    }
  }

  private lastUploadLabel(): string {
    if (this.uploadStatus.state === 'offline') return '오프라인 — 연결되면 재개';
    if (this.uploadStatus.state === 'error') return '실패 — 자동 재시도 예정';
    if (this.uploadStatus.state === 'uploading') return '업로드 중…';
    const at = this.uploadStatus.lastUploadAt;
    if (at === null) return this.uploadStatus.state === 'pending' ? '대기 중…' : '아직 없음';
    const min = Math.floor((Date.now() - at) / 60_000);
    return min < 1 ? '방금 전' : `${min}분 전`;
  }

  private row(label: string, value: string): HTMLElement {
    const row = el('div', 'modal-row');
    row.append(el('span', undefined, label), el('span', 'hud-value', value));
    return row;
  }
}
