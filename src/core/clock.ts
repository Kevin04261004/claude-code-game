import type { IClock } from '../app/ports';

/** 실제 시계 */
export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/** 테스트용 가짜 시계 — 시간을 수동으로 전진 */
export class FixedClock implements IClock {
  constructor(private t: number) {}

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    this.t += ms;
  }

  set(ms: number): void {
    this.t = ms;
  }
}
