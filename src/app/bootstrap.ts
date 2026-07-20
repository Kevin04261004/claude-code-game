/**
 * 부트스트랩 — 세이브 로드 → 시작 화면(§9.2) → 시작 세이브 결정(클라우드 비교)
 * → 오프라인 정산 → 시뮬 생성 → 렌더러/UI/루프 연결 (§2).
 * 조립 순서와 배선만 담당하고, 로직은 각 모듈에 있다.
 */
import { BALANCE } from '../config/balance';
import { SystemClock } from '../core/clock';
import { EventBus } from '../core/event-bus';
import { LocalLeaderboard } from '../leaderboard/local-provider';
import { currentScore, updateBestScore } from '../leaderboard/leaderboard';
import { GameLoop } from '../loop/game-loop';
import { registerVisibility } from '../loop/visibility';
import { CanvasRenderer } from '../render/canvas-renderer';
import { settleOffline } from '../sim/offline/offline-settlement';
import { Simulation } from '../sim/simulation';
import type { CloudHandle, MirrorNotifier } from '../cloud/boot';
import type { SaveDataV1 } from '../save/save-schema';
import { fromSave, newGameState, toSave } from '../save/serializer';
import { SaveStorage, LocalStore } from '../save/storage';
import { Hud } from '../ui/hud';
import { LeaderboardPanel } from '../ui/panel-leaderboard';
import { showOfflineModal } from '../ui/panel-offline';
import { SkillsPanel } from '../ui/panel-skills';
import { WeaponsPanel } from '../ui/panel-weapons';
import { showStartScreen } from '../ui/start-screen';

/** 게스트 시작 시 클라우드 준비를 기다려 주는 최대 시간 — 초과하면 로컬로 먼저 시작 */
const GUEST_CLOUD_WAIT_MS = 1500;

export async function bootstrap(): Promise<void> {
  const clock = new SystemClock();
  const storage = new SaveStorage(new LocalStore(), () => clock.now());

  // 1) 세이브 로드 (복구 체인 포함, §6)
  const loaded = storage.load();
  if (loaded.source === 'backup') console.warn('[save] 주 세이브 손상 — 백업으로 복구했습니다');
  if (loaded.corruptPreserved) console.warn(`[save] 손상본 보존: ${loaded.corruptPreserved}`);

  // 2) 클라우드 준비(SDK 로드 + 세션 복원/익명 로그인)를 시작 화면과 병렬로.
  //    실패해도 게스트 로컬 플레이는 항상 가능하다.
  const cloudReady: Promise<CloudHandle | null> = import('../cloud/boot')
    .then((m) => m.prepareCloud())
    .catch((e) => {
      console.warn('[cloud] 클라우드 동기화 비활성 — 로컬 저장만 사용합니다', e);
      return null;
    });

  // 3) 시작 화면 — 게스트 플레이 또는 Google 로그인/계속하기
  const mode = await showStartScreen(loaded.save, cloudReady);

  // 4) 시작 세이브 결정 — 로그인했으면 클라우드와 비교해 게임 시작 "전"에 채택 (§9.3).
  //    게스트는 클라우드가 이미 준비된 경우에만 짧게 비교하고, 늦으면 게임 중 백그라운드 비교.
  let startSave = loaded.save;
  let lateCloudSync = false;
  const handle =
    mode === 'synced'
      ? await cloudReady
      : await Promise.race([cloudReady, delay(GUEST_CLOUD_WAIT_MS).then(() => null)]);
  if (handle) {
    const { resolveStartSave } = await import('../cloud/boot');
    const resolved = await resolveStartSave(handle, loaded.save);
    if (resolved && resolved !== loaded.save) storage.write(resolved); // 클라우드 채택 즉시 로컬에 고정
    startSave = resolved;
  } else {
    lateCloudSync = true;
  }

  startGame(startSave, clock, storage, cloudReady, lateCloudSync);
}

function startGame(
  startSave: SaveDataV1 | null,
  clock: SystemClock,
  storage: SaveStorage,
  cloudReady: Promise<CloudHandle | null>,
  lateCloudSync: boolean,
): void {
  const state = startSave ? fromSave(startSave) : newGameState(clock.now() >>> 0, clock.now());

  // 시뮬 생성
  const bus = new EventBus();
  const sim = new Simulation(state, bus);
  let mirror: MirrorNotifier | null = null; // 클라우드 미러 연결 전에는 null (§9.3)
  let publishScore: ((score: number) => void) | null = null; // 글로벌 랭킹 연결 전에는 null
  const myScore = () => Math.max(currentScore(state), state.leaderboard.bestScore);
  const saveNow = (critical = false) => {
    updateBestScore(state);
    publishScore?.(myScore()); // 게시는 내부 스로틀·닉네임 가드로 걸러진다
    const save = toSave(state, clock.now());
    storage.write(save);
    if (critical) mirror?.notifyCritical(save);
    else mirror?.notifySaved(save);
  };

  // 플레이어 조작은 즉시 로컬 저장 + 짧은 디바운스 업로드 — 조작 직후 앱을 꺼도 잃지 않는다 (§9.3)
  const PLAYER_ACTION_EVENTS = ['skillRolled', 'skillUpgraded', 'skillSold', 'skillEquipped', 'weaponUpgraded', 'weaponEquipped', 'treeNodeUnlocked'];
  for (const t of PLAYER_ACTION_EVENTS) bus.on(t, () => saveNow(true));

  // 오프라인 정산 (시작 시점, §5) — 채택된 세이브의 savedAt 기준
  let startupCatchupMs = 0;
  if (startSave) {
    const elapsed = Math.max(0, clock.now() - startSave.savedAt);
    if (elapsed >= BALANCE.OFFLINE_MIN_MS) {
      const report = settleOffline(state, elapsed);
      saveNow();
      showOfflineModal(report);
    } else {
      startupCatchupMs = elapsed;
    }
  }

  // 렌더러 + UI
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new CanvasRenderer(canvas, sim);
  const hud = new Hud(document.getElementById('hud')!);
  const leaderboardPanel = mountTabs(sim, clock, myScore);

  // 루프 시작
  const loop = new GameLoop(sim, bus, (alpha) => {
    renderer.render(state, alpha);
    hud.update(state);
  });
  loop.addCatchupMs(startupCatchupMs);
  loop.start();

  registerVisibility({ clock, sim, loop, saveNow, onSettled: showOfflineModal });
  setInterval(saveNow, BALANCE.AUTOSAVE_INTERVAL_MS); // 탭이 숨겨지면 브라우저가 스로틀 — 숨김 시 저장은 visibility가 담당

  // 클라우드 미러 연결 (§9) — 준비가 늦었어도 여기서 따라붙는다
  void cloudReady.then(async (handle) => {
    if (!handle) return;
    const { attachMirror } = await import('../cloud/boot');
    attachMirror(
      handle,
      {
        currentSave: () => toSave(state, clock.now()),
        writeLocalSave: (s) => storage.write(s),
        hudRoot: document.getElementById('hud')!,
        onUploaderReady: (uploader) => {
          mirror = uploader;
        },
        onLeaderboardReady: (global) => {
          publishScore = (score) => void global.publish(score).catch(() => {});
          leaderboardPanel.attachGlobal(global); // 붙는 즉시 글로벌로 갱신
        },
        reload: () => location.reload(),
      },
      lateCloudSync,
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mountTabs(sim: Simulation, clock: SystemClock, myScore: () => number): LeaderboardPanel {
  const tabsRoot = document.getElementById('tabs')!;
  const content = document.getElementById('tab-content')!;

  const weapons = new WeaponsPanel(sim);
  const skills = new SkillsPanel(sim);
  const leaderboard = new LeaderboardPanel(new LocalLeaderboard(sim.state), clock, myScore);

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

  return leaderboard;
}
