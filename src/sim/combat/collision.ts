/**
 * 충돌 판정 — 균일 그리드 공간 분할 (ARCHITECTURE.md §3.4)
 *
 * 전수 비교는 적 300 × 투사체 200 = 틱당 6만 회이고, 고속 따라잡기(프레임당
 * 최대 60틱)에서는 프레임당 360만 회로 부풀어 예산을 초과한다. 그리드는
 * 셀 + 인접 범위만 검사해 이를 수백 회 수준으로 줄인다.
 *
 * 결정론: 적은 배열 순서(id 오름차순)대로 셀에 등록되고, 질의 결과는
 * id 오름차순으로 정렬해 반환 → 부동소수점 적용 순서가 고정된다.
 */
import { BALANCE } from '../../config/balance';
import { dist2 } from '../../core/math';
import type { CombatCtx } from './damage';
import { applyHit } from './damage';
import type { Enemy, SimState } from '../state';

export class SpatialGrid {
  private cells = new Map<string, Enemy[]>();

  constructor(private readonly cellSize: number = BALANCE.GRID_CELL_SIZE) {}

  /** movement 직후(이동 완료 좌표 기준) 매 틱 전체 재구축 */
  build(enemies: Enemy[]): void {
    this.cells.clear();
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const key = `${Math.floor(e.x / this.cellSize)},${Math.floor(e.y / this.cellSize)}`;
      const cell = this.cells.get(key);
      if (cell) cell.push(e);
      else this.cells.set(key, [e]);
    }
  }

  /** (x,y) 중심 반경 r과 겹칠 수 있는 후보 반환 — 정밀 판정은 호출자 몫 */
  query(x: number, y: number, r: number): Enemy[] {
    const pad = r + BALANCE.MAX_ENEMY_RADIUS;
    const x0 = Math.floor((x - pad) / this.cellSize);
    const x1 = Math.floor((x + pad) / this.cellSize);
    const y0 = Math.floor((y - pad) / this.cellSize);
    const y1 = Math.floor((y + pad) / this.cellSize);
    const out: Enemy[] = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) out.push(...cell);
      }
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }
}

/**
 * 선분(이동 전→이동 후) 위에서 원(적)까지 가장 가까워지는 진행도 t ∈ [0,1]과
 * 그 지점의 거리²를 반환 — 빠른 투사체가 한 틱에 적을 건너뛰는 터널링 방지
 */
function sweepClosest(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): { t: number; d2: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return { t, d2: dist2(ax + dx * t, ay + dy * t, cx, cy) };
}

/**
 * 투사체-적 충돌 해소. 판정은 이번 틱의 이동 선분 전체(swept)로 하며,
 * 관통은 경로상 먼저 만나는 적부터 순서대로 소모한다. 관통 소진 시 제거.
 */
export function resolveProjectiles(state: SimState, grid: SpatialGrid, ctx: CombatCtx): void {
  for (const p of state.projectiles) {
    if (p.dead) continue;
    // 그리드 질의는 이동 선분 전체를 덮어야 한다: 선분 중점 + (반길이 + 반경)
    const midX = (p.px + p.x) / 2;
    const midY = (p.py + p.y) / 2;
    const halfLen = Math.sqrt(dist2(p.px, p.py, p.x, p.y)) / 2;
    const candidates = grid.query(midX, midY, p.radius + halfLen);

    // 경로상 접촉하는 적을 진행도 순으로 수집 (동순위는 id 오름차순 — 결정론)
    const hits: { t: number; e: (typeof candidates)[number] }[] = [];
    for (const e of candidates) {
      if (e.hp <= 0 || p.hitIds.includes(e.id)) continue;
      const rr = p.radius + e.radius;
      const { t, d2 } = sweepClosest(p.px, p.py, p.x, p.y, e.x, e.y);
      if (d2 <= rr * rr) hits.push({ t, e });
    }
    hits.sort((a, b) => a.t - b.t || a.e.id - b.e.id);

    for (const { e } of hits) {
      if (e.hp <= 0) continue; // 같은 틱의 유폭 등으로 이미 죽었을 수 있음
      p.hitIds.push(e.id);
      applyHit(state, ctx, e, {
        damage: p.damage,
        status: p.status,
        lifestealPct: p.lifestealPct,
        explodePct: p.explodePct,
        canCrit: p.canCrit,
      });
      if (p.pierceLeft <= 0) {
        p.dead = true;
        break;
      }
      p.pierceLeft--;
    }
  }
}
