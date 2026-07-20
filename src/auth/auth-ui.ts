/**
 * 계정 UI (ARCHITECTURE.md §9.2) — HUD에 상태 버튼 한 줄 + 클릭 시 계정 모달.
 * 로그인 강제 없음 — 로그인의 가치(기기 간 동기화)만 안내한다.
 */
import type { AuthStatus, IAuth, INickname, LinkResult, NicknameState, SetNicknameResult } from '../app/ports';
import type { UploadScheduler, UploadStatus } from '../cloud/cloud-save';
import { NICKNAME_MAX } from '../profile/nickname-rules';
import { button, el } from '../ui/dom';

export class AuthUi {
  private readonly statusBtn: HTMLButtonElement;
  private authStatus: AuthStatus = { state: 'loading' };
  private uploadStatus: UploadStatus = { state: 'idle', lastUploadAt: null };
  private nickState: NicknameState = { status: 'loading', nickname: null };
  private modalRefresh: (() => void) | null = null;
  // 닉네임 편집 상태 — 모달을 열 때/닫을 때 초기화
  private nickEditing = false;
  private nickDraft = '';
  private nickHint = '';

  constructor(
    hudRoot: HTMLElement,
    private readonly auth: IAuth,
    private readonly nickname: INickname,
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
    nickname.onState((s) => {
      this.nickState = s;
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
    // 닉네임이 있으면 버튼엔 닉네임을, 없으면 계정 상태를 보여준다
    this.statusBtn.textContent = this.nickState.nickname ?? this.statusLabel();
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

    // 모달을 새로 열 때 닉네임 편집 상태 초기화
    this.nickEditing = false;
    this.nickHint = '';

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal');
    const body = el('div');
    modal.append(body);

    const close = () => {
      this.modalRefresh = null;
      this.nickEditing = false;
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

      // 닉네임 — 게스트/로그인 모두 설정 가능 (uid 보유)
      if (this.authStatus.state === 'guest' || this.authStatus.state === 'linked') {
        body.append(this.nicknameSection(rebuild));
      }

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

  // ── 닉네임 섹션 ──

  private nicknameSection(rebuild: () => void): HTMLElement {
    const wrap = el('div', 'modal-nick');
    const current = this.nickState.nickname;

    if (!this.nickEditing) {
      const loading = this.nickState.status === 'loading';
      wrap.append(this.row('닉네임', loading ? '불러오는 중…' : (current ?? '미설정')));
      if (this.nickHint) wrap.append(el('div', 'modal-hint', this.nickHint));
      const startEdit = () => {
        this.nickEditing = true;
        this.nickDraft = current ?? '';
        this.nickHint = '';
        rebuild();
      };
      const editBtn = button(current ? '닉네임 변경' : '닉네임 설정', startEdit, 'btn secondary');
      editBtn.disabled = loading;
      wrap.append(editBtn);
      return wrap;
    }

    // 편집 모드
    wrap.append(el('div', 'modal-hint', `닉네임은 2~${NICKNAME_MAX}자, 다른 사람과 겹칠 수 없어요.`));
    const input = el('input', 'nick-input');
    input.type = 'text';
    input.maxLength = NICKNAME_MAX;
    input.placeholder = '닉네임 입력';
    input.value = this.nickDraft;
    input.addEventListener('input', () => (this.nickDraft = input.value));
    wrap.append(input);
    if (this.nickHint) wrap.append(el('div', 'modal-hint', this.nickHint));

    const submit = async () => {
      const r = await this.nickname.setNickname(this.nickDraft);
      this.nickHint = this.nickResultHint(r);
      if (r.kind === 'ok') this.nickEditing = false;
      rebuild();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void submit();
    });

    const actions = el('div', 'modal-actions');
    actions.append(
      button('저장', () => void submit()),
      button('취소', () => {
        this.nickEditing = false;
        this.nickHint = '';
        rebuild();
      }, 'btn secondary'),
    );
    wrap.append(actions);

    // 리렌더 직후 입력창에 포커스 (rebuild가 DOM을 교체하므로 다음 틱에)
    setTimeout(() => input.focus(), 0);
    return wrap;
  }

  private nickResultHint(r: SetNicknameResult): string {
    switch (r.kind) {
      case 'ok':
        return `✅ 닉네임을 '${r.nickname}'(으)로 설정했어요.`;
      case 'taken':
        return '⚠️ 이미 사용 중인 닉네임이에요. 다른 이름을 시도해 주세요.';
      case 'invalid':
        return r.reason === 'too-short' || r.reason === 'empty'
          ? '⚠️ 닉네임은 2자 이상이어야 해요.'
          : r.reason === 'too-long'
            ? `⚠️ 닉네임은 ${NICKNAME_MAX}자까지 가능해요.`
            : '⚠️ 사용할 수 없는 문자가 포함돼 있어요.';
      case 'error':
        return `⚠️ 설정 실패 (${r.code}). 잠시 후 다시 시도해 주세요.`;
    }
  }

  private row(label: string, value: string): HTMLElement {
    const row = el('div', 'modal-row');
    row.append(el('span', undefined, label), el('span', 'hud-value', value));
    return row;
  }
}
