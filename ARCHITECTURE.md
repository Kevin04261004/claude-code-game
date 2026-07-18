# ARCHITECTURE.md — 방치형 자동전투 성장 게임

> 브라우저 탭에 띄워두고 방치하는 게임. 뱀파이어 서바이버즈식 자동 전투 + 방치형 성장.
> 유저 개입은 "세팅"(무기 강화, 스킬 트리, 빌드 구성)에 집중된다.

---

## 0. 핵심 설계 원칙

| 원칙 | 내용 |
|---|---|
| **시뮬레이션 우선** | 게임 로직은 렌더링 없이 헤드리스로 완결. 렌더러는 시뮬레이션 상태의 "구독자"일 뿐 |
| **데이터 주도** | 무기/스킬/적/스테이지는 전부 데이터 파일. 코드는 데이터를 해석하는 엔진만 담당 |
| **결정론적 시뮬레이션** | 고정 틱 + 시드 기반 RNG. 같은 입력이면 같은 결과 → 테스트 가능, 오프라인 정산 검증 가능, 추후 서버 리더보드 검증 가능 |
| **단일 밸런스 소스** | 모든 수치 공식/상수는 `config/balance.ts` 한 곳 |
| **작은 모듈** | 파일당 300줄 이하, 모듈당 책임 하나, 의존은 인터페이스로만 |

---

## 1. 렌더링 기술 선택: **Canvas 2D (렌더러 인터페이스 뒤에 배치)**

**결정: Canvas 2D로 시작한다. 단, 렌더러는 `IRenderer` 인터페이스 뒤에 두어 PixiJS로 교체 가능하게 한다.**

이유:

1. **성능이 충분하다.** 이 게임의 화면 동시 개체 수는 적 100~300 + 투사체 100~200 수준으로 예상된다. 스프라이트를 오프스크린 캔버스에 미리 구워두고(`drawImage`만 사용) 그리면 Canvas 2D로도 60fps가 안정적으로 나온다.
2. **의존성 0, 번들 최소.** 방치형 게임은 "가볍게 켜두는" 것이 가치다. PixiJS는 수백 KB의 WebGL 스택을 얹는다.
3. **백그라운드 탭에서는 어차피 렌더링을 안 한다.** 이 게임의 CPU 예산 대부분은 시뮬레이션 쪽 설계로 해결되며, WebGL의 이점(대량 스프라이트 배칭)이 빛나는 상황이 적다.
4. **교체 비용을 미리 지불해 둔다.** 로직-렌더링 완전 분리가 이미 요구사항이므로, 렌더러는 `IRenderer` 하나만 구현하면 갈아끼울 수 있다. 개체 수가 1,000+로 늘어나 병목이 확인되면 그때 PixiJS 구현체를 추가한다.

메뉴/스킬트리/강화 패널 같은 **"세팅" UI는 캔버스가 아니라 DOM**으로 만든다. (접근성, 스크롤, 텍스트 렌더링, 개발 속도 모두 DOM이 압도적으로 유리. 캔버스는 전투 씬 전용.)

---

## 2. 폴더 구조와 모듈 책임

```
/
├─ index.html
├─ vite.config.ts
├─ vitest.config.ts
└─ src/
   ├─ main.ts                     # 진입점: 부트스트랩만 (조립은 app/에 위임)
   │
   ├─ app/
   │  ├─ bootstrap.ts             # 세이브 로드 → 시뮬 생성 → 렌더러/UI 연결 순서 관장
   │  └─ ports.ts                 # 계층 간 인터페이스 모음 (IRenderer, IStorage, IClock, ILeaderboard)
   │
   ├─ config/
   │  └─ balance.ts               # ★ 모든 밸런스 수치/공식 상수의 유일한 출처
   │
   ├─ core/                       # 게임 장르와 무관한 범용 기반
   │  ├─ rng.ts                   # 시드 기반 결정론적 RNG (mulberry32)
   │  ├─ event-bus.ts             # 시뮬 → 외부 단방향 이벤트 발행. 채널 분리: state(상태 변경) / cosmetic(시각·사운드) — cosmetic 채널은 음소거/배칭 가능 (§3.2)
   │  ├─ clock.ts                 # IClock 구현: 실시간/테스트용 가짜 시계
   │  └─ math.ts                  # 벡터, 보간, 지수 성장 유틸 + 자체 구현 삼각함수(룩업 테이블) — sim에서 Math.sin/cos 직접 사용 금지 (§3.3)
   │
   ├─ sim/                        # ★ 헤드리스 시뮬레이션 (DOM/Canvas 참조 금지)
   │  ├─ simulation.ts            # 시뮬 파사드: tick(n) 호출을 받아 하위 시스템에 분배
   │  ├─ state.ts                 # SimState 타입 정의 (직렬화 가능한 순수 데이터)
   │  ├─ combat/
   │  │  ├─ spawner.ts            # 스테이지 데이터 기반 적 스폰 스케줄링
   │  │  ├─ movement.ts           # 적 이동(중앙으로 수렴), 투사체 이동
   │  │  ├─ collision.ts          # 투사체-적 충돌 판정: 균일 그리드 공간 분할 (§3.4)
   │  │  ├─ targeting.ts          # 무기/스킬의 대상 선정 (가장 가까운 적 등) — collision의 그리드를 재사용해 근접 질의
   │  │  ├─ damage.ts             # ★ 데미지 계산 공식 (crit, 속성 상성, 방어 감쇄)
   │  │  └─ status-effects.ts     # 화상/빙결/감전 등 지속 효과 틱 처리
   │  ├─ progression/
   │  │  ├─ growth.ts             # ★ 경험치/레벨/스탯 성장 공식
   │  │  ├─ weapon-upgrade.ts     # 무기 강화 로직 (비용, 성공, 외형 티어 결정)
   │  │  └─ skill-tree.ts         # 스킬 트리 노드 해금/선택 상태 관리
   │  ├─ skills/
   │  │  ├─ skill-composer.ts     # ★ 조합 데이터 → 스킬 인스턴스 생성기 (§4)
   │  │  ├─ skill-resolver.ts     # 스킬 인스턴스 → 매 틱 실제 효과 적용
   │  │  └─ skill-catalog.ts      # 조합 규칙 검증, 스킬 ID 인코딩/디코딩
   │  └─ offline/
   │     └─ offline-settlement.ts # ★ 오프라인 경과 시간 정산 (§5)
   │
   ├─ content/                    # ★ 게임 콘텐츠 = 순수 데이터 (로직 금지)
   │  ├─ weapons.ts               # 무기 정의 + 강화 티어별 외형 키
   │  ├─ enemies.ts               # 적 정의 (기본 스탯 배율, 행동 타입, 스프라이트 키)
   │  ├─ stages.ts                # 스테이지 정의 (스폰 테이블, 난이도 곡선 파라미터)
   │  ├─ skill-tree.ts            # 스킬 트리 노드 정의 (오프라인 상한 확장 노드 포함, §5.3)
   │  └─ skills/
   │     ├─ skill-bases.ts        # 기본 스킬 (발사체/오라/선회/소환 등 ~20종)
   │     ├─ skill-elements.ts     # 속성 (화염/냉기/번개/독/신성 등 ~8종)
   │     ├─ skill-grades.ts       # 등급 (일반~신화, 배율 곡선)
   │     └─ skill-mods.ts         # 변형 옵션 (관통/다중발사/폭발/흡혈 등 ~30종)
   │
   ├─ render/                     # IRenderer 구현 (sim을 읽기만 함, 쓰기 금지)
   │  ├─ canvas-renderer.ts       # Canvas 2D 구현체: 프레임 루프, 보간 렌더링
   │  ├─ sprite-cache.ts          # 절차적 스프라이트(구체/창/칼날)를 오프스크린 캔버스에 캐싱
   │  ├─ skill-visuals.ts         # 스킬별 전투 비주얼: 기본형별 발사체 형태, 궤도 칼날, 오라 구분 애니메이션
   │  ├─ weapon-visuals.ts        # 강화 티어 → 무기 외형 매핑/합성 (색, 이펙트, 형태)
   │  ├─ effects.ts               # 타격 이펙트, 데미지 숫자 (이벤트 버스 구독)
   │  └─ camera.ts                # 뷰포트/좌표 변환
   │
   ├─ ui/                        # DOM 기반 "세팅" 화면 (sim에는 명령 객체로만 접근)
   │  ├─ dom.ts                   # DOM 생성/숫자 포맷 공용 헬퍼
   │  ├─ styles.css               # 전체 UI 스타일
   │  ├─ hud.ts                   # 골드/레벨/스테이지 표시
   │  ├─ panel-weapons.ts         # 무기 강화 패널
   │  ├─ panel-skills.ts          # 스킬 트리/장착 패널
   │  ├─ panel-offline.ts         # 복귀 시 오프라인 보상 정산 모달
   │  └─ panel-leaderboard.ts     # 리더보드 패널
   │
   ├─ save/
   │  ├─ save-schema.ts           # 세이브 스키마 타입 v1 + 버전 상수 (§6)
   │  ├─ serializer.ts            # SimState ↔ SaveData 변환
   │  ├─ migrations.ts            # 버전별 마이그레이션 체인 (v1→v2→…)
   │  └─ storage.ts               # IStorage 구현: localStorage 어댑터 + 자동 저장 주기
   │
   ├─ leaderboard/
   │  ├─ leaderboard.ts           # ILeaderboard 인터페이스 소비 로직 (점수 산출)
   │  ├─ local-provider.ts        # 로컬 시뮬레이션 구현 (가상 경쟁자 생성)
   │  └─ remote-provider.ts       # (추후) 서버 구현체 자리 — 인터페이스만 맞추면 교체
   │
   └─ loop/
      ├─ game-loop.ts             # ★ 틱 스케줄러: 실시간 → 시뮬 틱 수 변환, 따라잡기 (§3)
      └─ visibility.ts            # visibilitychange 감지, 백그라운드/복귀 전환 처리

tests/
   ├─ helpers.ts                  # 테스트 공용 상태/적 생성 헬퍼
   ├─ damage.test.ts              # 데미지 공식
   ├─ growth.test.ts              # 성장 공식 (레벨 곡선, 비용 곡선)
   ├─ skill-composer.test.ts      # 스킬 조합 생성/ID 인코딩 왕복
   ├─ offline-settlement.test.ts  # 오프라인 정산 (정확 구간/근사 구간 오차 검증)
   ├─ save-migrations.test.ts     # 세이브 마이그레이션 체인
   └─ determinism.test.ts         # 같은 시드+같은 틱 수 → 같은 상태 해시
```

**의존 방향 (한 방향만 허용):**

```
content(데이터) ─→ sim(로직) ─→ state(순수 데이터)
                     │
        ┌────────────┼────────────┐
     render         ui          save          ← 전부 sim을 "읽거나 명령"만 함
        └───── app/ports.ts 의 인터페이스를 통해서만 접속 ─────┘
```

- `sim/`은 DOM, Canvas, localStorage를 **절대 import하지 않는다** → 그대로 Vitest(Node)에서 실행 가능.
- UI → sim은 `sim.execute({ type: 'upgradeWeapon', weaponId })` 같은 **명령 객체**로만. 직접 상태 변경 금지.
- sim → 외부는 **이벤트 버스**로만 (`enemyKilled`, `levelUp`, `weaponUpgraded` …). sim은 구독자가 누군지 모른다.

---

## 3. 게임 루프: 시뮬레이션 틱과 렌더링 프레임의 분리

### 3.1 구조

- **시뮬레이션: 고정 틱, 10 TPS (100ms/틱).** `sim.tick()`은 항상 정확히 100ms 분량의 세계를 진행시킨다. 가변 델타타임 없음.
- **렌더링: rAF 기반 가변 프레임 (보통 60fps).** 렌더러는 직전 틱과 현재 틱 사이를 **보간**해서 그린다. 시뮬은 10 TPS여도 화면은 부드럽다.
- 둘을 잇는 것은 `loop/game-loop.ts`의 **누적기(accumulator)** 하나뿐이다:

```ts
// game-loop.ts 의사코드
onFrame(nowMs) {
  accumulatorMs += nowMs - lastFrameMs;
  lastFrameMs = nowMs;

  const ticksToRun = Math.floor(accumulatorMs / TICK_MS);      // TICK_MS = 100
  const capped = Math.min(ticksToRun, MAX_CATCHUP_TICKS_PER_FRAME); // 예: 60틱(6초 분량)
  for (let i = 0; i < capped; i++) sim.tick();
  accumulatorMs -= capped * TICK_MS;

  renderer.render(sim.state, accumulatorMs / TICK_MS);          // 두 번째 인자 = 보간 계수 α
}
```

### 3.2 백그라운드 탭: "아무것도 하지 않는다"

- 탭이 숨겨지면 rAF는 브라우저가 멈춰준다. **우리는 setInterval 폴백을 쓰지 않는다** (브라우저가 1분 1회로 스로틀하며, "CPU를 거의 안 씀" 요구와 충돌).
- `visibilitychange`로 숨김을 감지하면: 즉시 세이브 + `lastSimTimestamp` 기록 후 완전 정지.
- 복귀하면 경과 시간을 계산해 두 가지 경로로 따라잡는다:
  - **경과 < CATCHUP_THRESHOLD (예: 5분)** → 위 루프의 캡(프레임당 60틱)을 이용해 몇 프레임에 걸쳐 **실제 틱을 재생**. 유저는 전투가 빠르게 감기는 걸 본다 (연출로도 좋음).
  - **경과 ≥ 5분** → §5의 **오프라인 정산 알고리즘**으로 처리하고 정산 모달을 띄운다.
- 노트북 절전, 시스템 시간 변경 등으로 `Date.now()`가 과거로 가면 경과 시간을 0으로 클램프.

**고속 따라잡기 중 이벤트 정책 (음소거/배칭)**

- 이벤트 버스는 **`state` 채널**(레벨업, 스테이지 클리어 등 — UI/저장이 반드시 알아야 하는 상태 변경)과 **`cosmetic` 채널**(타격 이펙트, 데미지 숫자, 사운드 트리거 등 — 놓쳐도 무해한 연출)로 분리한다.
- `game-loop.ts`는 한 프레임에 2틱 이상 재생하는 순간 **catchup 모드**를 버스에 선언한다:
  - `cosmetic` 채널은 **음소거**된다 (구독자에게 전달하지 않고 버림). 5분 재생이면 `enemyKilled` 이펙트가 수천 건 발생하는데, 이를 전부 렌더/사운드에 흘리면 따라잡기 자체가 이펙트 생성 비용에 지배당한다.
  - `state` 채널은 **배칭**된다: 같은 종류의 이벤트를 카운터로 접어(`enemyKilled × 1,203`, `levelUp: 5→9`) catchup 종료 시 요약 1회로 flush. UI는 최종값만 갱신하면 된다.
- catchup 종료(누적기 소진) 시 모드를 해제하고 일반 발행으로 복귀한다. 이 정책은 event-bus 내부에 있으므로 **sim 코드는 catchup 여부를 전혀 모른다** — 결정론에 영향 없음.

### 3.3 결정론

- 시뮬 내부의 모든 난수는 `core/rng.ts`(시드 저장됨)만 사용. `Math.random()` 금지.
- **구현 의존적 수학 함수 사용 금지**: `Math.sin/cos/tan/atan2/pow(비정수 지수)` 등은 브라우저/플랫폼별로 마지막 비트가 다를 수 있어(스펙이 정확도를 강제하지 않음) 장시간 시뮬에서 상태가 갈라진다. sim 내부에서는 `core/math.ts`의 **자체 구현(삼각함수는 룩업 테이블 + 선형 보간, 지수는 정수 거듭제곱 누적)** 만 사용한다. 렌더러는 화면용이므로 네이티브 `Math` 사용 가능.
- 틱 순서 고정: `spawner → movement → collision → targeting → skills → damage → status → progression`.
- 이 덕에 `determinism.test.ts`에서 "시드 X로 1,000틱 = 항상 동일한 상태 해시"를 보장하고, 추후 서버가 리더보드 점수를 재현·검증할 수 있다. 이 테스트 시나리오에는 **회전형 스킬(orbit 등) 장착 상태를 반드시 포함**시켜 삼각함수 경로가 결정론 검증을 통과하는지 상시 확인한다.

### 3.4 충돌 판정: 균일 그리드 공간 분할 (`collision.ts`)

- 목표 규모는 적 300 + 투사체 200. 전수 비교(brute force)는 틱당 **300 × 200 = 60,000회** 거리 계산이고, 고속 따라잡기(프레임당 최대 60틱)에서는 프레임당 **360만 회**로 부풀어 따라잡기와 저사양 기기 성능 예산을 초과한다. 그래서 전수 비교를 피한다.
- 방식: 월드를 **셀 크기 = 최대 히트 반경 × 2**의 균일 그리드로 나누고, 매 틱 적을 셀에 등록 → 각 투사체는 자기 셀 + 인접 8셀의 적들만 검사한다. 개체가 화면 전체에 퍼지는 이 게임 특성상 셀당 밀도가 낮아 검사 횟수가 수백 회 수준으로 떨어진다 (쿼드트리 대비 구현이 단순하고, 매 틱 전체 재구축해도 충분히 싸며, 결정론 유지가 쉬움).
- 틱 순서상 **movement 직후**에 그리드를 재구축한다 (이동 후 좌표 기준이어야 판정이 정확). 같은 틱의 `targeting`(가장 가까운 적 질의)도 이 그리드를 재사용한다.
- **터널링 방지(swept)**: 빠른 투사체는 틱당 이동 거리(예: 장거리 관통창 ≈ 48유닛)가 적 지름보다 커서, 이동 후 "점 위치"로만 판정하면 적을 건너뛴다. 판정은 이동 전→이동 후 **선분과 적 원의 최근접 거리**로 하고, 그리드 질의도 선분 중점 + (반길이+반경)으로 경로 전체를 덮는다. 관통은 경로상 진행도(t) 순으로 소모한다.
- 결정론 유의점: 셀 내 적 목록은 **엔티티 ID 오름차순**으로 순회해 부동소수점 연산 순서를 고정하고, swept 히트 정렬은 (t, id) 복합 키로 타이를 끊는다.

---

## 4. 스킬 수천 개: 조합 기반 데이터 설계

### 4.1 구조

스킬 하나를 하드코딩하는 대신, **4개 축의 조합**으로 정의한다:

```
스킬 = 기본형(base) × 속성(element) × 등급(grade) × 변형(mods 0~2개)
```

규모: 기본형 20 × 속성 8 × 등급 6 × 변형 C(30,2)+30+1 ≈ **20 × 8 × 6 × 466 ≈ 45만 조합** (실제 노출은 조합 규칙으로 제한 — 수천 개 규모로 큐레이션).

- **스킬 ID는 조합을 그대로 인코딩한 문자열**: `"orbit_blade:frost:epic:pierce+lifesteal"`
  → 세이브에는 이 ID만 저장하면 되고, 로드 시 `skill-composer.ts`가 ID를 파싱해 동일한 스킬을 재생성한다. (수천 개 스킬 정의를 세이브에 넣을 필요 없음)
- `skill-composer.ts`는 4개 데이터 테이블을 읽어 **`SkillInstance`(수치가 모두 계산된 평탄한 스탯 객체)**를 만든다.
- `skill-resolver.ts`는 `SkillInstance`의 `behavior` 필드(기본형이 정의)에 따라 매 틱 효과를 적용한다. 즉 **엔진이 아는 것은 기본형 20종의 행동 패턴뿐**이고, 나머지 축은 전부 수치/태그 변조다.

### 4.2 데이터 테이블 형태와 예시 3개

```ts
// content/skills/skill-bases.ts — 기본형: "행동"을 정의하는 유일한 축
export const SKILL_BASES = {
  orbit_blade: {
    name: '회전 칼날',
    behavior: 'orbit',            // 엔진이 해석하는 행동 타입
    baseDamage: 8,                // 이하 수치는 balance.ts 계수와 곱해짐
    baseCooldownTicks: 0,         // 상시 유지형
    baseCount: 2,                 // 칼날 개수
    baseRadius: 60,
    tags: ['melee', 'sustained'],
  },
  // ... bolt(직선 투사체), nova(원형 폭발), aura(장판) 등 ~20종
} as const;

// content/skills/skill-elements.ts — 속성: 피해 유형 + 부가 상태이상
export const SKILL_ELEMENTS = {
  frost: {
    name: '냉기',
    damageMult: 0.9,
    statusEffect: { kind: 'slow', power: 0.3, durationTicks: 20 },
    visualTint: '#7fd4ff',
  },
  // ... fire(화상 DoT), lightning(연쇄), poison(중첩 DoT) 등 ~8종
} as const;

// content/skills/skill-mods.ts — 변형: 수치·태그 변조 (행동 추가 없음)
export const SKILL_MODS = {
  pierce: {
    name: '관통',
    statMods: { pierceCount: +2, damageMult: 0.85 },
    allowedBehaviors: ['bolt', 'orbit'],   // 조합 제한 규칙
  },
  // ... multishot, lifesteal, explode_on_kill 등 ~30종
} as const;

// content/skills/skill-grades.ts — 등급: 전 수치 배율 곡선 (예: mult = 1.5^gradeIndex)
```

`skill-composer.ts`의 합성 순서: **base 수치 → element 배율/상태이상 부착 → grade 배율 → mods 순차 적용** → 완성된 `SkillInstance`. 순서를 고정해야 결정론이 유지된다.

### 4.3 조합 규칙 (`skill-catalog.ts`)

- `allowedBehaviors` 같은 제한으로 말이 안 되는 조합 차단 (예: 장판 스킬에 관통).
- **ID 정규화 규칙: mods는 항상 사전순(lexicographic) 정렬 후 인코딩한다.** `pierce+lifesteal`과 `lifesteal+pierce`는 같은 스킬이므로 ID도 하나여야 한다 — 정규화가 없으면 같은 스킬이 인벤토리에 중복 존재하거나, 세이브 비교/중복 판정이 깨진다. `encode()`가 정렬을 강제하고, `decode()`는 비정규 ID 입력 시 정규화된 ID로 교정해 반환한다. (합성 시 mods **적용 순서**도 이 정렬 순서를 따른다 → 수치 결과까지 결정론 유지)
- 스테이지/등급 진행에 따라 노출되는 조합 풀을 제어 → "수천 개"는 한 번에 쏟아지는 게 아니라 성장에 따라 열린다.
- 유닛 테스트: 임의 ID 1,000개에 대해 `encode(decode(id)) === id` 왕복 검증, **mods 순서를 뒤섞은 입력 → 동일한 정규 ID 산출 검증**, 금지 조합 거부 검증.

---

## 5. 오프라인 정산 알고리즘

### 5.1 개요: 2단계 하이브리드

| 구간 | 방식 | 이유 |
|---|---|---|
| 경과 < 5분 | **실제 틱 재생** (프레임당 캡 걸고 고속 재생) | 완전히 정확, 저비용, 시각적 재미 |
| 경과 ≥ 5분 (상한: §5.3) | **표본 측정 + 청크별 외삽** | 16시간 = 576,000틱 전체 재생은 CPU 예산 초과 |

### 5.2 표본 측정 + 외삽 절차 (`offline-settlement.ts`)

핵심 아이디어: **처치율(kills/sec)을 스탯 수식으로 추정하지 않고, 정산 시작 시점에 실제 전투 30초 분량(300틱)을 헤드리스로 돌려 "측정"한다.** 측정값을 청크에 외삽하고, 빌드가 유의미하게 바뀐 청크에서만 재측정한다.

```
1. effectiveSec = min(elapsed, cap)×OFFLINE_EFFICIENCY
               + max(elapsed-cap, 0)×OFFLINE_OVERCAP_EFFICIENCY   // 상한은 §5.3
2. 표본 측정: 현재 상태 사본(빈 전투장)으로 워밍업 300틱 + 계측 300틱을
   헤드리스 실행하고 { killRate, goldRate, expRate } 측정. 수십 ms면 끝남
3. 남은 시간이 0이 될 때까지 "구간" 반복. 구간 길이는
   [스테이지 클리어 예상 시점 | 청크 상한(10분) | 남은 시간] 중 먼저 오는 지점:
   a. 구간 보상 = 측정된 rate × 구간 길이
   b. 경험치는 성장 공식(growth.ts)으로 레벨업 반영
   c. 처치 수 누적이 클리어 조건에 닿으면 스테이지 전진
   d. 재측정 판정: 스테이지가 전진했거나, 표본 이후 누적 레벨업 ≥
      RESAMPLE_LEVEL_DELTA(5) 이면 → 갱신된 상태로 2를 다시 수행.
      재측정 횟수는 OFFLINE_MAX_RESAMPLES(64)로 상한 — 초과 시 마지막
      측정값 유지(후반 성장을 과소평가하는 쪽으로 보수적)
4. 결과(획득 골드/경험치/레벨/스테이지 진행)를 SettlementReport로 반환
5. UI가 정산 모달로 보여주고, 상태 반영 + 즉시 저장
```

구간을 청크가 아니라 **스테이지 클리어 경계**에서 끊는 이유: 초반에는 스테이지가
수십 초 단위로 전진해 보상 배율이 10분 청크 안에서 복리로 커진다. 측정값은 "그
스테이지의 정상 상태"에서만 유효하므로, 유효 범위가 끝나는 지점(클리어)에서 정확히
재측정해야 오차가 누적되지 않는다. (스폰율/보상 배율로 측정값을 해석적으로 보정하는
방식은 DPS 한계 구간에서 크게 어긋나는 것이 검증 테스트로 확인되어 채택하지 않았다.)

**사망 "벽" 모델링**: 표본 측정 중 플레이어가 사망하면(`playerDied` 계수) 그
스테이지는 벽으로 판정한다 — 실전에서는 사망 → 스테이지 -1 → 재등반이 반복되며
전진이 정체하므로, 정산도 전진을 멈추고 처치 수를 클리어 직전에서 클램프한다.
보상률은 사망 사이클이 포함된 실측값을 그대로 쓰고, 레벨업 누적(RESAMPLE_LEVEL_DELTA)
재측정에서 사망이 사라지면 벽 돌파로 전진을 재개한다. (이 모델 없이는 30분 검증에서
정산이 스테이지 17 vs 실제 9로 +19% 과대평가 — 테스트로 확인)

- **측정 방식인 이유**: 스탯 기반 수식(DPS ÷ 유효HP)은 조합 스킬의 실제 동작 — 관통 하나가 몇 마리를 맞추는지, 오라 범위에 평균 몇 마리가 들어오는지, 상태이상 시너지 — 을 근사하는 별도 모델을 요구한다. 스킬이 조합으로 수천 개인 이 게임에서 그 모델은 실제 전투와 반드시 어긋나고, 어긋날 때마다 이중 유지보수가 된다. 30초 실측은 **전투 코드 그 자체가 곧 모델**이므로 원리적으로 어긋날 수 없다.
- **비용**: 재측정 1회 = 600틱(워밍업+계측). 상한 64회 × 600틱 = 38,400틱 ≈ 16시간 전체 재생(576,000틱)의 7%. 실제 정산은 수십~수백 ms로 모달 표시 전에 끝난다.
- 구간 방식인 이유: 한 방에 `rate × elapsed`로 계산하면 오프라인 중의 레벨업/스테이지 전진에 의한 **복리 성장**이 무시된다.
- **정확도 검증 테스트**: 동일 상태에서 "실제 틱 재생 결과"와 "동일 유효시간 정산 결과"의 골드/경험치 오차가 ±10% 이내임을 `offline-settlement.test.ts`로 상시 검증. 표본 측정은 시드 RNG를 쓰므로 테스트도 결정론적이다.
- 시계 조작(시스템 시간 되돌리기)은 음수 클램프로, 시간 앞당기기는 오프라인 상한으로 이득 제한.

### 5.3 오프라인 상한: 기본값 + 성장으로 확장

타겟 유저의 핵심 사이클은 **퇴근 → 다음날 출근(14~16시간)**이다. 상한이 12시간이면 매일 밤 2~4시간을 "버리게" 되어, 방치형의 핵심 보상 루프가 매일 손해감으로 시작한다. 따라서:

- **기본 상한 16시간** (`balance.ts: OFFLINE_CAP_BASE_HOURS = 16`) — 야근·아침 준비를 포함한 평일 밤을 손해 없이 커버.
- **상한 확장을 성장 요소로 설계**: 스킬 트리의 특수 노드("시간 압축" 계열)로 단계당 +8시간, **최대 48시간**(`OFFLINE_CAP_MAX_HOURS`)까지 확장. 주말(금요일 퇴근 → 월요일 출근 ≈ 60시간)을 완전히 커버하지는 않게 남겨, 주말에 한 번은 탭을 열 동기를 유지한다.
- 확장 상태는 `skills.treeNodes`에 이미 포함되므로 **세이브 스키마 변경 불필요** — 상한은 로드 시 노드에서 파생 계산(`offlineCapHours(save)`).
- 상한 초과분은 0이 아니라 `OFFLINE_OVERCAP_EFFICIENCY`(예: 10%)로 감쇄 적립 — "딱 끊기는" 손해감을 완화하는 보조 장치. 관련 상수는 전부 `balance.ts`.

---

## 6. 세이브 데이터 스키마 v1

```ts
// save/save-schema.ts
export const SAVE_VERSION = 1;

export interface SaveDataV1 {
  version: 1;
  savedAt: number;              // epoch ms — 오프라인 정산 기준점
  playtimeSec: number;
  rngSeed: number;              // 결정론 유지용 현재 RNG 상태

  player: {
    level: number;
    exp: number;                // 현재 레벨 내 누적치
    gold: number;
    gems: number;               // 프리미엄 재화(추후)
    baseStats: { hp: number; regen: number };  // 파생 스탯은 저장하지 않고 재계산
  };

  weapons: Array<{
    weaponId: string;           // content/weapons.ts 키
    level: number;              // 외형 티어는 level에서 파생 — 저장하지 않음
    equipped: boolean;
  }>;

  skills: {
    owned: Array<{ id: string; level: number }>;  // id = 조합 인코딩 문자열 (§4)
    equipped: string[];                            // 장착 슬롯 (최대 N개)
    treeNodes: string[];                           // 해금한 스킬트리 노드 ID
  };

  progression: {
    stageId: string;
    stageKills: number;         // 현재 스테이지 누적 처치
    highestStageId: string;
  };

  leaderboard: {
    localRivals: Array<{ name: string; seed: number; startedAt: number }>;
    bestScore: number;          // 점수 = 결정론적 산출식 (balance.ts)
  };

  settings: { sfxVolume: number; reducedEffects: boolean };
}
```

**설계 규칙**

- **파생값은 저장하지 않는다.** DPS, 무기 외형 티어, 스킬 실수치 등은 로드 시 데이터+공식으로 재계산 → 밸런스 패치가 기존 세이브에 자동 반영되고, 세이브 크기와 불일치 버그가 줄어든다.
- **전투장의 순간 상태(적 위치, 투사체)는 저장하지 않는다.** 로드 시 전투는 새로 시작 — 방치형에서 손실이 아니며 스키마가 극적으로 단순해진다.
- **마이그레이션**: `migrations.ts`에 `{ 1: v1→v2, 2: v2→v3, ... }` 순차 체인. 로드 시 `version`부터 현재까지 차례로 적용. 각 단계는 유닛 테스트로 고정.
- 저장 시점: ① 30초 주기 자동 ② 탭 숨김/닫힘(`visibilitychange`) ③ 유저의 세팅 변경 직후.
- localStorage 키: 주 세이브 `idle-game:save` + 백업 `idle-game:save:backup`(마이그레이션 직전, 그리고 매시 1회 주 세이브를 복사).

**로드 실패 복구 체인 (`storage.ts`)**

```
1. `idle-game:save` 파싱 + 스키마 검증 시도
   └ 실패 시 →
2. `idle-game:save:backup` 파싱 + 스키마 검증 시도 (성공하면 백업으로 복구했음을 유저에게 고지)
   └ 실패 시 →
3. 손상본을 지우지 않고 `idle-game:save:corrupt-<epoch>` 키로 원문 그대로 보존한 뒤 새 게임 시작
   (유저에게 고지 + 손상본이 남아 있어 추후 수동 복구/버그 리포트 분석 가능)
```

- "파싱 실패"는 JSON 오류뿐 아니라 스키마 검증 실패(필수 필드 누락, 타입 불일치, 알 수 없는 미래 버전)를 포함한다.
- 어떤 단계에서도 **기존 데이터를 덮어쓰거나 삭제하며 시작하지 않는다** — 새 게임의 첫 자동 저장이 일어나기 전까지 손상본과 백업은 모두 원형 유지. `corrupt-*` 키는 최근 3개까지만 보관(localStorage 용량 보호).
- 이 체인은 `save-migrations.test.ts`에서 손상 픽스처(잘린 JSON, 필드 누락, 미래 버전)로 검증한다.

---

## 7. 테스트 전략 (Vitest)

| 대상 | 검증 내용 |
|---|---|
| `damage.ts` | 공식 스냅샷: 스탯 조합별 기대 데미지, 크리/상성 경계값 |
| `growth.ts` | 레벨 곡선 단조 증가, 비용 곡선, 경험치 오버플로 이월 |
| `skill-composer.ts` | ID 인코딩/디코딩 왕복, **mods 순서 뒤섞은 입력 → 동일 정규 ID**, 금지 조합 거부, 합성 순서 결과 고정 |
| `offline-settlement.ts` | 실제 틱 재생 vs 표본 측정 정산 오차 ±10%, 재측정 트리거 조건, 시간 조작 클램프, 상한/초과분 감쇄 |
| `migrations.ts` | 각 버전 픽스처 → 최신 스키마 변환 성공, **손상 픽스처 → 백업 복구 → corrupt 보존 체인** |
| `determinism.test.ts` | 동일 시드 + N틱 → 동일 상태 해시 (회귀 감시망). **orbit 등 삼각함수 경로를 쓰는 스킬 장착 시나리오 포함** |

`sim/`이 DOM 없이 동작하므로 전부 Node 환경에서 브라우저 목킹 없이 실행된다.

---

## 8. 이후 확장 여지 (지금은 구현하지 않음)

- **Web Worker로 시뮬 이전**: `sim/`이 이미 헤드리스이므로 포스트-MVP에 메시지 채널만 얹으면 됨.
- **서버 리더보드**: `ILeaderboard`의 `remote-provider.ts` 구현 + 결정론 시뮬 덕에 서버 측 점수 재현 검증 가능.
- **PixiJS 렌더러**: `IRenderer` 구현체 추가로 교체.
