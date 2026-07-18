import { describe, expect, it } from 'vitest';
import { resolveProjectiles, SpatialGrid } from '../src/sim/combat/collision';
import type { Projectile } from '../src/sim/state';
import { makeCtx, makeEnemy, makeState } from './helpers';

function makeProjectile(id: number, px: number, py: number, x: number, y: number, pierce = 0): Projectile {
  return {
    id,
    x,
    y,
    px,
    py,
    vx: x - px,
    vy: y - py,
    damage: 50,
    radius: 5,
    pierceLeft: pierce,
    ttl: 40,
    elementId: null,
    status: null,
    lifestealPct: 0,
    explodePct: 0,
    canCrit: false,
    tint: null,
    hitIds: [],
    dead: false,
  };
}

describe('투사체 swept 충돌 (터널링 방지)', () => {
  it('★ 한 틱에 적을 건너뛴 빠른 투사체도 명중한다', () => {
    const state = makeState();
    const enemy = makeEnemy(1, 50, 0, 40); // 반경 10
    state.enemies.push(enemy);
    // 틱당 60유닛 이동: (20,0) → (80,0). 끝점 판정이라면 적(50,0)을 놓친다
    state.projectiles.push(makeProjectile(100, 20, 0, 80, 0));
    const grid = new SpatialGrid();
    grid.build(state.enemies);

    resolveProjectiles(state, grid, makeCtx());
    expect(enemy.hp).toBeLessThan(40);
    expect(state.projectiles[0]!.dead).toBe(true); // 관통 0 → 소멸
  });

  it('경로에서 벗어난 적은 맞지 않는다', () => {
    const state = makeState();
    const enemy = makeEnemy(1, 50, 40, 40); // 경로(y=0)에서 40 위 — 반경 합 15보다 멂
    state.enemies.push(enemy);
    state.projectiles.push(makeProjectile(100, 20, 0, 80, 0));
    const grid = new SpatialGrid();
    grid.build(state.enemies);

    resolveProjectiles(state, grid, makeCtx());
    expect(enemy.hp).toBe(40);
    expect(state.projectiles[0]!.dead).toBe(false);
  });

  it('관통 0이면 경로상 "먼저 만나는" 적만 맞는다', () => {
    const state = makeState();
    const near = makeEnemy(5, 40, 0, 40); // id는 크지만 경로상 앞
    const far = makeEnemy(1, 70, 0, 40); // id는 작지만 경로상 뒤
    state.enemies.push(far, near);
    state.projectiles.push(makeProjectile(100, 10, 0, 100, 0));
    const grid = new SpatialGrid();
    grid.build(state.enemies);

    resolveProjectiles(state, grid, makeCtx());
    expect(near.hp).toBeLessThan(40);
    expect(far.hp).toBe(40);
  });

  it('관통 n이면 경로 순서대로 n+1마리까지 맞는다', () => {
    const state = makeState();
    const a = makeEnemy(1, 30, 0, 40);
    const b = makeEnemy(2, 55, 0, 40);
    const c = makeEnemy(3, 80, 0, 40);
    state.enemies.push(a, b, c);
    state.projectiles.push(makeProjectile(100, 0, 0, 100, 0, 1)); // 관통 1 → 2마리
    const grid = new SpatialGrid();
    grid.build(state.enemies);

    resolveProjectiles(state, grid, makeCtx());
    expect(a.hp).toBeLessThan(40);
    expect(b.hp).toBeLessThan(40);
    expect(c.hp).toBe(40);
    expect(state.projectiles[0]!.dead).toBe(true);
  });

  it('이미 맞힌 적(hitIds)은 다음 틱에 다시 맞지 않는다', () => {
    const state = makeState();
    const enemy = makeEnemy(1, 50, 0, 1000);
    state.enemies.push(enemy);
    const p = makeProjectile(100, 20, 0, 80, 0, 5);
    state.projectiles.push(p);
    const grid = new SpatialGrid();
    grid.build(state.enemies);

    resolveProjectiles(state, grid, makeCtx());
    const hpAfterFirst = enemy.hp;
    resolveProjectiles(state, grid, makeCtx()); // 같은 위치에서 한 번 더
    expect(enemy.hp).toBe(hpAfterFirst);
  });
});
