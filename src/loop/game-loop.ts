/**
 * 틱 스케줄러 (ARCHITECTURE.md §3.1)
 * 누적기(accumulator)로 실시간 → 고정 틱 수 변환. 렌더링은 rAF 가변 프레임 +
 * 보간 계수(α). 프레임당 2틱 이상 재생 시 catchup 모드를 버스에 선언해
 * cosmetic 음소거 / state 배칭을 켠다 (§3.2).
 */
import { BALANCE } from '../config/balance';
import type { EventBus } from '../core/event-bus';
import type { Simulation } from '../sim/simulation';

export class GameLoop {
  private accMs = 0;
  private lastFrameMs: number | null = null;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly sim: Simulation,
    private readonly bus: EventBus,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameMs = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.bus.inCatchup) this.bus.endCatchup();
  }

  /** 복귀 따라잡기: 경과 시간을 누적기에 주입 (§3.2, 5분 미만 구간) */
  addCatchupMs(ms: number): void {
    this.accMs += Math.max(0, ms);
  }

  private frame = (nowMs: number): void => {
    if (!this.running) return;
    if (this.lastFrameMs !== null) {
      this.accMs += nowMs - this.lastFrameMs;
    }
    this.lastFrameMs = nowMs;

    const ticksToRun = Math.floor(this.accMs / BALANCE.TICK_MS);
    const capped = Math.min(ticksToRun, BALANCE.MAX_CATCHUP_TICKS_PER_FRAME);

    if (capped >= 2 && !this.bus.inCatchup) this.bus.beginCatchup();

    for (let i = 0; i < capped; i++) this.sim.tick();
    this.accMs -= capped * BALANCE.TICK_MS;

    // 누적기가 소진되면 catchup 종료 → 배칭된 이벤트 flush
    if (this.bus.inCatchup && this.accMs < BALANCE.TICK_MS * 2) this.bus.endCatchup();

    this.render(this.accMs / BALANCE.TICK_MS);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
