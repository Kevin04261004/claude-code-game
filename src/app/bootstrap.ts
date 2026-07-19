/**
 * 부트스트랩 — 세이브 로드 → 오프라인 정산 → 시뮬 생성 → 렌더러/UI/루프 연결 (§2).
 * 조립 순서와 배선만 담당하고, 로직은 각 모듈에 있다.
 */
import { BALANCE } from '../config/balance';
import { SystemClock } from '../core/clock';
import { EventBus } from '../core/event-bus';
import { LocalLeaderboard } from '../leaderboard/local-provider';
import { updateBestScore } from '../leaderboard/leaderboard';
import { GameLoop } from '../loop/game-loop';
import { registerVisibility } from '../loop/visibility';
import { CanvasRenderer } from '../render/canvas-renderer';
import { settleOffline } from '../sim/offline/offline-settlement';
import { Simulation } from '../sim/simulation';
import type { SaveDataV1 } from '../save/save-schema';
import { fromSave, newGameState, toSave } from '../save/serializer';
import { SaveStorage, LocalStore } from '../save/storage';
import { Hud } from '../ui/hud';
import { LeaderboardPanel } from '../ui/panel-leaderboard';
import { showOfflineModal } from '../ui/panel-offline';
import { SkillsPanel } from '../ui/panel-skills';
import { WeaponsPanel } from '../ui/panel-weapons';

export function bootstrap(): void {
  const clock = new SystemClock();
  const storage = new SaveStorage(new LocalStore(), () => clock.now());

  // 1) 세이브 로드 (복구 체인 포함, §6)
  const loaded = storage.load();
  if (loaded.source === 'backup') console.warn('[save] 주 세이브 손상 — 백업으로 복구했습니다');
  if (loaded.corruptPreserved) console.warn(`[save] 손상본 보존: ${loaded.corruptPreserved}`);

  const state = loaded.save ? fromSave(loaded.save) : newGameState(clock.now() >>> 0, clock.now());

  // 2) 시뮬 생성
  const bus = new EventBus();
  const sim = new Simulation(state, bus);
  let cloudNotify: ((save: SaveDataV1) => void) | null = null; // 클라우드 미러 부트 전에는 null (§9.3)
  const saveNow = () => {
    updateBestScore(state);
    const save = toSave(state, clock.now());
    storage.write(save);
    cloudNotify?.(save);
  };

  // 3) 오프라인 정산 (시작 시점, §5)
  let startupCatchupMs = 0;
  if (loaded.save) {
    const elapsed = Math.max(0, clock.now() - loaded.save.savedAt);
    if (elapsed >= BALANCE.OFFLINE_MIN_MS) {
      const report = settleOffline(state, elapsed);
      saveNow();
      showOfflineModal(report);
    } else {
      startupCatchupMs = elapsed;
    }
  }

  // 4) 렌더러 + UI
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new CanvasRenderer(canvas, sim);
  const hud = new Hud(document.getElementById('hud')!);
  mountTabs(sim, clock);

  // 5) 루프 시작
  const loop = new GameLoop(sim, bus, (alpha) => {
    renderer.render(state, alpha);
    hud.update(state);
  });
  loop.addCatchupMs(startupCatchupMs);
  loop.start();

  registerVisibility({ clock, sim, loop, saveNow, onSettled: showOfflineModal });
  setInterval(saveNow, BALANCE.AUTOSAVE_INTERVAL_MS); // 탭이 숨겨지면 브라우저가 스로틀 — 숨김 시 저장은 visibility가 담당

  // 6) 클라우드 동기화 (§9) — dynamic import로 firebase 청크 분리, 실패해도 게임은 로컬 전용으로 계속
  void import('../cloud/boot')
    .then(({ startCloud }) =>
      startCloud({
        currentSave: () => toSave(state, clock.now()),
        writeLocalSave: (s) => storage.write(s),
        hudRoot: document.getElementById('hud')!,
        onUploaderReady: (notify) => {
          cloudNotify = notify;
        },
        reload: () => location.reload(),
      }),
    )
    .catch((e) => console.warn('[cloud] 클라우드 동기화 비활성 — 로컬 저장만 사용합니다', e));
}

function mountTabs(sim: Simulation, clock: SystemClock): void {
  const tabsRoot = document.getElementById('tabs')!;
  const content = document.getElementById('tab-content')!;

  const weapons = new WeaponsPanel(sim);
  const skills = new SkillsPanel(sim);
  const leaderboard = new LeaderboardPanel(new LocalLeaderboard(sim.state), clock);

  const tabs: { label: string; root: HTMLElement; onShow?: () => void }[] = [
    { label: '⚔️ 무기', root: weapons.root, onShow: () => weapons.refresh() },
    { label: '✨ 스킬', root: skills.root, onShow: () => skills.refresh() },
    { label: '🏆 랭킹', root: leaderboard.root, onShow: () => leaderboard.refresh() },
  ];

  const buttons: HTMLButtonElement[] = [];
  tabs.forEach((tab, i) => {
    const b = document.createElement('button');
    b.textContent = tab.label;
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      content.replaceChildren(tab.root);
      tab.onShow?.();
    });
    buttons.push(b);
    tabsRoot.append(b);
    if (i === 0) b.click();
  });
}
