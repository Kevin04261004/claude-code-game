/** 클라우드 업로드 스케줄러 (src/cloud/cloud-save.ts) — fake 타이머/업로더 주입 */
import { describe, expect, it } from 'vitest';
import { UploadScheduler, type UploadStatus } from '../src/cloud/cloud-save';
import { toSave } from '../src/save/serializer';
import type { SaveDataV1 } from '../src/save/save-schema';
import { makeState } from './helpers';

function saveWithPlaytime(playtimeSec: number): SaveDataV1 {
  const s = toSave(makeState(1), 0);
  s.playtimeSec = playtimeSec;
  return s;
}

/** 수동 발화 fake 타이머 — 예약된 지연(ms)도 기록한다 */
function fakeTimers() {
  const pending: (() => void)[] = [];
  const delays: number[] = [];
  return {
    delays,
    setTimer: (fn: () => void, ms: number) => {
      pending.push(fn);
      delays.push(ms);
      return pending.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {
      pending.length = 0;
    },
    fire: () => {
      const fns = pending.splice(0);
      fns.forEach((f) => f());
    },
    count: () => pending.length,
  };
}

function makeScheduler(over: Partial<ConstructorParameters<typeof UploadScheduler>[0]> = {}) {
  const uploaded: SaveDataV1[] = [];
  const timers = fakeTimers();
  const scheduler = new UploadScheduler({
    upload: async (s) => {
      uploaded.push(s);
    },
    debounceMs: 60_000,
    online: () => true,
    isHidden: () => false,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: () => 12345,
    ...over,
  });
  return { scheduler, uploaded, timers };
}

const flushMicro = () => new Promise((r) => setTimeout(r, 0));

describe('UploadScheduler', () => {
  it('디바운스: 연속 통지를 하나로 접고 최신본만 업로드한다', async () => {
    const { scheduler, uploaded, timers } = makeScheduler();
    scheduler.notifySaved(saveWithPlaytime(10));
    scheduler.notifySaved(saveWithPlaytime(20));
    scheduler.notifySaved(saveWithPlaytime(30));
    expect(uploaded).toHaveLength(0);
    expect(timers.count()).toBe(1); // 타이머는 한 번만 예약
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.playtimeSec).toBe(30);
  });

  it('dedupe: playtimeSec이 같으면 재업로드하지 않는다', async () => {
    const { scheduler, uploaded, timers } = makeScheduler();
    scheduler.notifySaved(saveWithPlaytime(10));
    timers.fire();
    await flushMicro();
    scheduler.notifySaved(saveWithPlaytime(10)); // 시뮬이 안 돌아 내용 동일
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(1);
  });

  it('탭 숨김이면 디바운스 없이 즉시 업로드한다', async () => {
    const { scheduler, uploaded } = makeScheduler({ isHidden: () => true });
    scheduler.notifySaved(saveWithPlaytime(10));
    await flushMicro();
    expect(uploaded).toHaveLength(1);
  });

  it('오프라인이면 스킵하고 offline 상태를 알리며, 온라인 복귀 후 다음 통지에서 재시도한다', async () => {
    let online = false;
    const statuses: UploadStatus['state'][] = [];
    const { scheduler, uploaded, timers } = makeScheduler({ online: () => online });
    scheduler.onStatus((s) => statuses.push(s.state));
    scheduler.notifySaved(saveWithPlaytime(10));
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(0);
    expect(statuses).toContain('offline');
    online = true;
    scheduler.notifySaved(saveWithPlaytime(20));
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.playtimeSec).toBe(20);
  });

  it('업로드 실패는 error 상태로만 표시되고 던지지 않는다', async () => {
    const statuses: UploadStatus['state'][] = [];
    const { scheduler, timers } = makeScheduler({
      upload: async () => {
        throw new Error('permission-denied');
      },
    });
    scheduler.onStatus((s) => statuses.push(s.state));
    scheduler.notifySaved(saveWithPlaytime(10));
    timers.fire();
    await flushMicro();
    expect(statuses).toContain('error');
  });

  it('성공 시 idle 상태와 lastUploadAt을 보고한다', async () => {
    let last: UploadStatus | null = null;
    const { scheduler, timers } = makeScheduler();
    scheduler.onStatus((s) => (last = s));
    scheduler.notifySaved(saveWithPlaytime(10));
    timers.fire();
    await flushMicro();
    expect(last).toEqual({ state: 'idle', lastUploadAt: 12345 });
  });

  it('flush()는 예약을 기다리지 않고 즉시 업로드한다', async () => {
    const { scheduler, uploaded } = makeScheduler();
    scheduler.notifySaved(saveWithPlaytime(10));
    await scheduler.flush();
    expect(uploaded).toHaveLength(1);
  });

  it('notifyCritical: 긴 예약을 짧은 디바운스로 앞당긴다', async () => {
    const { scheduler, uploaded, timers } = makeScheduler({ criticalDebounceMs: 2_000 });
    scheduler.notifySaved(saveWithPlaytime(10));
    expect(timers.delays.at(-1)).toBe(60_000);
    scheduler.notifyCritical(saveWithPlaytime(11));
    expect(timers.delays.at(-1)).toBe(2_000);
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.playtimeSec).toBe(11);
  });

  it('notifyCritical: 연타는 마지막 조작 기준 1회 업로드로 합쳐진다', async () => {
    const { scheduler, uploaded, timers } = makeScheduler({ criticalDebounceMs: 2_000 });
    scheduler.notifyCritical(saveWithPlaytime(10));
    scheduler.notifyCritical(saveWithPlaytime(11));
    scheduler.notifyCritical(saveWithPlaytime(12));
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.playtimeSec).toBe(12);
  });

  it('notifyCritical: playtimeSec이 같아도(같은 초의 연속 조작) dedupe를 우회해 업로드한다', async () => {
    const { scheduler, uploaded, timers } = makeScheduler({ criticalDebounceMs: 2_000 });
    scheduler.notifyCritical(saveWithPlaytime(10));
    timers.fire();
    await flushMicro();
    scheduler.notifyCritical(saveWithPlaytime(10)); // 같은 초에 두 번째 조작
    timers.fire();
    await flushMicro();
    expect(uploaded).toHaveLength(2);
  });

  it('notifyCritical: 탭 숨김이면 디바운스 없이 즉시 업로드한다', async () => {
    const { scheduler, uploaded } = makeScheduler({ criticalDebounceMs: 2_000, isHidden: () => true });
    scheduler.notifyCritical(saveWithPlaytime(10));
    await flushMicro();
    expect(uploaded).toHaveLength(1);
  });
});
