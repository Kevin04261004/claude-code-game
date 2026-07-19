/**
 * ★ 모든 게임 밸런스 수치의 유일한 출처 (ARCHITECTURE.md §0, §5.3)
 * 여기 외의 곳에 매직 넘버로 밸런스 수치를 두지 않는다.
 */
export const BALANCE = {
  // ── 시간/루프 ──
  TICK_MS: 100,
  TPS: 10,
  MAX_CATCHUP_TICKS_PER_FRAME: 60,
  CATCHUP_THRESHOLD_MS: 5 * 60_000,
  AUTOSAVE_INTERVAL_MS: 30_000,
  BACKUP_INTERVAL_MS: 60 * 60_000,
  CLOUD_UPLOAD_DEBOUNCE_MS: 60_000, // 로컬 저장 후 클라우드 미러 업로드까지의 디바운스 (§9.3)
  CLOUD_UPLOAD_CRITICAL_DEBOUNCE_MS: 2_000, // 플레이어 조작(스킬 강화 등) 직후의 짧은 디바운스 — 조작 후 바로 종료해도 잃지 않게

  // ── 월드 ──
  ARENA_RADIUS: 340,
  SPAWN_RADIUS: 360,
  PLAYER_RADIUS: 14,
  GRID_CELL_SIZE: 48,
  ENEMY_CAP: 300,
  PROJECTILE_CAP: 400,
  PROJECTILE_TTL_TICKS: 40,
  MAX_ENEMY_RADIUS: 20, // 충돌 그리드 질의 패딩용 — enemies.ts의 radius 상한

  // ── 플레이어 성장 ──
  PLAYER_BASE_HP: 100,
  PLAYER_HP_PER_LEVEL: 12,
  PLAYER_BASE_REGEN: 2, // hp/sec
  EXP_BASE: 25,
  EXP_GROWTH: 1.13,
  DEATH_STAGE_PENALTY: 1,

  // ── 전투 공통 ──
  CRIT_CHANCE: 0.1,
  CRIT_MULT: 2,
  SLOW_CAP: 0.6, // 감속 중첩 상한

  // ── 적 공격 방식 ──
  // 자폭/탄환 피해도 touchDps처럼 스테이지 배율로 성장하므로 배수는 보수적으로:
  // 기존 접촉 방식의 "평균 접촉 시간 × dps"와 비슷한 기대 피해가 되도록 맞춘다.
  KAMIKAZE_DMG_MULT: 0.8, // 자폭(운석) 피해 = touchDps × 배수, 1회
  RANGED_ATTACK_RANGE: 80, // 정찰선 사거리 — 회전 칼날 궤도(70)+칼날(16)이 닿는 언저리
  RANGED_FIRE_COOLDOWN_TICKS: 25,
  RANGED_BULLET_SPEED: 140, // units/sec
  RANGED_BULLET_DMG_MULT: 1.5, // 탄환 피해 = touchDps × 배수
  RANGED_BULLET_RADIUS: 4,
  ENEMY_BULLET_TTL_TICKS: 50,

  // ── 무기 ──
  WEAPON_DMG_GROWTH: 1.15,
  WEAPON_COST_GROWTH: 1.17,
  WEAPON_TIER_LEVELS: 10, // n레벨마다 외형 티어 1 상승

  // ── 무기 행동별 (content/weapons.ts behavior) ──
  CANNON_AOE_RADIUS: 60, // shell: 착탄 폭발 반경
  CANNON_AOE_PCT: 0.5, // shell: 폭발 피해 = 직격의 50%
  BEAM_RANGE: 240, // beam: 연결 사거리
  BEAM_HIT_PERIOD_TICKS: 2, // beam: 피해 적용 주기 (초당 5회)
  BEAM_TICK_DMG_MULT: 0.2, // beam: 1회 피해 = weaponDamage × 0.2 (크리 없음 — 지속형)
  SWEEP_RADIUS: 200, // sweep: 회전 광선 반경
  SWEEP_DURATION_TICKS: 6, // sweep: 1회전에 걸리는 틱 (0.6초 — 빠른 회전)
  SWEEP_DMG_MULT: 4, // sweep: 회전당 피해 = weaponDamage × 4
  SWEEP_MIN_INTERVAL_TICKS: 12, // sweep: 주기 하한 (1.2초)
  SWEEP_INTERVAL_REDUCE_LEVELS: 2, // sweep: 2레벨마다 주기 1틱 감소

  // ── 스킬 ──
  SKILL_SLOTS: 4,
  SKILL_LEVEL_DMG_GROWTH: 1.1,
  SKILL_ROLL_COST_BASE: 60,
  SKILL_ROLL_COST_GROWTH: 1.2,
  SKILL_UPGRADE_COST_BASE: 40,
  SKILL_UPGRADE_COST_GROWTH: 1.25,
  SKILL_SELL_BASE: 30, // 최저 등급 Lv.1 기본 판매가 — 추첨 기본가(60G)의 절반이라 되팔이 이득 불가
  SKILL_SELL_GRADE_MULT: 2, // 등급당 판매가 ×2 — 등장 확률이 등급마다 1/2인 것과 대칭
  SKILL_SELL_MOD_BONUS: 0.25, // 변형 옵션 1개당 기본 판매가 +25%
  SKILL_SELL_UPGRADE_REFUND: 0.5, // 강화에 투자한 골드의 50% 환급
  GRADE_UNLOCK_STAGE_STEP: 4, // i등급은 최고 스테이지 i*step 도달부터 등장
  SKILL_MOD_COUNT_WEIGHTS: [0.4, 0.4, 0.2] as const, // 변형 0/1/2개 확률
  ORBIT_PHASE_OFFSET_RAD: 0.9, // 회전 스킬 다중 장착 시 슬롯별 위상차 (겹침 방지)
  ORBIT_HIT_PERIOD_TICKS: 3,
  ORBIT_BLADE_RADIUS: 16,
  ORBIT_SPIN_PER_TICK: 0.12, // rad/tick
  AURA_HIT_PERIOD_TICKS: 5,
  EXPLODE_RADIUS: 60,
  MULTISHOT_SPREAD_RAD: 0.18,

  // ── 스테이지 ──
  STAGE_KILLS_BASE: 30,
  STAGE_KILLS_GROWTH: 1.06,
  STAGE_HP_GROWTH: 1.18,
  STAGE_REWARD_GROWTH: 1.13,
  STAGE_SPAWN_BASE: 1.2, // 적/초
  STAGE_SPAWN_GROWTH: 1.03,
  STAGE_SPAWN_CAP: 8,

  // ── 오프라인 정산 (§5) ──
  OFFLINE_MIN_MS: 5 * 60_000, // 이 미만은 실제 틱 재생으로 따라잡기
  OFFLINE_EFFICIENCY: 0.5,
  OFFLINE_CAP_BASE_HOURS: 16,
  OFFLINE_CAP_MAX_HOURS: 48,
  OFFLINE_OVERCAP_EFFICIENCY: 0.1,
  OFFLINE_CHUNK_MINUTES: 10,
  OFFLINE_SAMPLE_WARMUP_TICKS: 300, // 빈 전투장이 정상 상태 밀도에 도달하는 시간

  OFFLINE_SAMPLE_TICKS: 300,
  RESAMPLE_LEVEL_DELTA: 5,
  OFFLINE_MAX_RESAMPLES: 64, // 재측정 비용 상한 — 초과 시 마지막 측정값 유지

  // ── 점수/리더보드 ──
  SCORE_PER_STAGE: 1000,
  SCORE_PER_LEVEL: 50,
  SCORE_PER_KILL: 1,
  RIVAL_COUNT: 9,
  RIVAL_SCORE_PER_HOUR: 130,
} as const;
