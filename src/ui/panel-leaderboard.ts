/**
 * 리더보드 패널.
 *  - 글로벌 랭킹(IGlobalLeaderboard)이 붙어 있고 조회에 성공하면 실제 유저 순위를 표시.
 *  - 클라우드가 아직 없거나(게스트 시작 직후) 조회 실패/오프라인이면 로컬 시뮬(ILeaderboard)로 폴백.
 * 글로벌은 비동기라 조회 중 로딩을 보이고, 탭을 빠르게 오가도 오래된 결과가
 * 덮어쓰지 않도록 요청 토큰으로 최신 것만 반영한다.
 */
import type { IClock, IGlobalLeaderboard, ILeaderboard, LeaderboardEntry } from '../app/ports';
import { BALANCE } from '../config/balance';
import { el, fmt } from './dom';

export class LeaderboardPanel {
  readonly root = el('div', 'panel-body');
  private global: IGlobalLeaderboard | null = null;
  private token = 0;

  constructor(
    private readonly local: ILeaderboard,
    private readonly clock: IClock,
    /** 본인의 현재 점수 (푸터·게시용) */
    private readonly playerScore: () => number,
  ) {
    this.refresh();
  }

  /** 클라우드 준비가 끝나면 부트스트랩이 글로벌 소스를 붙인다 */
  attachGlobal(global: IGlobalLeaderboard): void {
    this.global = global;
    this.refresh();
  }

  refresh(): void {
    const my = ++this.token;
    const g = this.global;
    if (!g) {
      this.renderLocal();
      return;
    }

    const score = this.playerScore();
    void g.publish(score).catch(() => {}); // 게시 실패는 조용히 무시 (스로틀·닉네임 가드는 내부에서)

    this.root.replaceChildren(el('div', 'section-title', '🏆 글로벌 랭킹'), el('div', 'lb-note', '불러오는 중…'));
    g.top(BALANCE.LEADERBOARD_TOP_N)
      .then((entries) => {
        if (my !== this.token) return; // 더 최신 refresh가 있었다 — 무시
        this.renderGlobal(entries, g.selfName(), score);
      })
      .catch(() => {
        if (my !== this.token) return;
        this.renderLocal('오프라인 — 로컬 순위를 표시합니다');
      });
  }

  private renderGlobal(entries: LeaderboardEntry[], name: string | null, score: number): void {
    this.root.replaceChildren(el('div', 'section-title', '🏆 글로벌 랭킹'));

    if (entries.length === 0) {
      this.root.append(el('div', 'lb-note', '아직 랭킹에 오른 플레이어가 없습니다'));
    } else {
      entries.forEach((entry, i) => this.root.append(this.row(i + 1, entry.name, entry.score, entry.isPlayer)));
    }

    // 본인이 상위 목록에 없으면 하단에 본인 점수를 따로 보여준다
    const inTop = entries.some((e) => e.isPlayer);
    if (name && !inTop) {
      this.root.append(el('div', 'lb-note', '내 점수'), this.row(null, name, score, true));
    } else if (!name) {
      this.root.append(el('div', 'lb-note', '닉네임을 설정하면 랭킹에 등록됩니다'));
    }
  }

  private renderLocal(note?: string): void {
    this.root.replaceChildren(el('div', 'section-title', '주간 리더보드 (로컬 시뮬레이션)'));
    if (note) this.root.append(el('div', 'lb-note', note));
    const entries = this.local.entries(this.clock.now());
    entries.forEach((entry, i) => this.root.append(this.row(i + 1, entry.name, entry.score, entry.isPlayer)));
  }

  private row(rank: number | null, name: string, score: number, isPlayer: boolean): HTMLElement {
    const row = el('div', isPlayer ? 'card equipped lb-row' : 'card lb-row');
    row.append(
      el('span', 'lb-rank', rank === null ? '—' : `${rank}`),
      el('span', 'lb-name', name),
      el('span', 'lb-score', fmt(score)),
    );
    return row;
  }
}
