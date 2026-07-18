/**
 * 시뮬 → 외부 단방향 이벤트 발행 (ARCHITECTURE.md §3.2)
 *
 * 채널 분리:
 *  - 'state'    : 상태 변경(레벨업, 스테이지 클리어 등) — catchup 중에는 카운터로 배칭
 *  - 'cosmetic' : 연출(타격 이펙트, 데미지 숫자 등)      — catchup 중에는 음소거(버림)
 *
 * catchup 모드는 game-loop이 선언하며, sim 코드는 catchup 여부를 전혀 모른다.
 */
export type Channel = 'state' | 'cosmetic';

export interface SimEvent {
  type: string;
  [key: string]: unknown;
}

export type EventHandler = (event: SimEvent) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private catchup = false;
  /** catchup 중 state 채널 이벤트를 종류별 카운터로 접는다 */
  private batched = new Map<string, { count: number; last: SimEvent }>();

  on(type: string, handler: EventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(channel: Channel, event: SimEvent): void {
    if (this.catchup) {
      if (channel === 'cosmetic') return; // 음소거
      const b = this.batched.get(event.type);
      if (b) {
        b.count++;
        b.last = event;
      } else {
        this.batched.set(event.type, { count: 1, last: event });
      }
      return;
    }
    this.dispatch(event);
  }

  get inCatchup(): boolean {
    return this.catchup;
  }

  beginCatchup(): void {
    this.catchup = true;
  }

  /** catchup 종료: 배칭된 state 이벤트를 요약 1회로 flush */
  endCatchup(): void {
    if (!this.catchup) return;
    this.catchup = false;
    const counts: Record<string, number> = {};
    for (const [type, b] of this.batched) {
      counts[type] = b.count;
      // 각 종류의 마지막 이벤트는 실제로 1회 전달 — UI가 최종값으로 갱신할 수 있게
      this.dispatch(b.last);
    }
    this.batched.clear();
    this.dispatch({ type: 'catchupSummary', counts });
  }

  private dispatch(event: SimEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    for (const h of set) h(event);
  }
}

/** 구독자 없는 버스 — 헤드리스 측정/테스트용 */
export function nullBus(): EventBus {
  return new EventBus();
}
