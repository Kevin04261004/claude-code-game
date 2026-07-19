/**
 * IRenderer의 Canvas 2D 구현 (§1). sim 상태를 읽기만 하며(쓰기 금지),
 * px/py→x/y를 α로 보간해 10 TPS 시뮬을 60fps로 부드럽게 그린다 (§3.1).
 */
import type { IRenderer } from '../app/ports';
import { BALANCE } from '../config/balance';
import { ENEMIES } from '../content/enemies';
import { WEAPONS } from '../content/weapons';
import { weaponTier } from '../sim/progression/growth';
import type { Simulation } from '../sim/simulation';
import type { SimState } from '../sim/state';
import { Camera } from './camera';
import { EffectsLayer } from './effects';
import { drawAuras, drawOrbits, drawProjectiles } from './skill-visuals';
import { projectileSprite, shipSprite, spaceEnemySprite } from './sprite-cache';
import { Starfield } from './starfield';
import { drawBeamFx, drawSweepFx, drawWeapon } from './weapon-visuals';

export class CanvasRenderer implements IRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cam = new Camera();
  private readonly effects: EffectsLayer;
  private readonly starfield = new Starfield();
  private lastFrameAt = 0;
  private aimAngle = -Math.PI / 4; // 적이 없을 때도 마지막 조준각 유지

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.effects = new EffectsLayer(sim.bus, () => sim.state.settings.reducedEffects);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(320, rect?.width ?? 640);
    const h = Math.max(320, rect?.height ?? 640);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.cam.fit(this.canvas.width, this.canvas.height);
    this.starfield.build(this.canvas.width, this.canvas.height);
  }

  render(state: SimState, alpha: number): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const now = performance.now();
    const dt = this.lastFrameAt === 0 ? 16 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    // 우주 배경 + 반짝이는 별
    this.starfield.draw(ctx, now);

    // 방어 경계 — 은은하게 맥동하는 에너지 링
    ctx.save();
    ctx.strokeStyle = `rgba(90,166,232,${0.3 + 0.12 * Math.sin(now * 0.0016)})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#5aa6e8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cam.x(0), cam.y(0), cam.r(BALANCE.ARENA_RADIUS), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawAuras(ctx, cam, this.sim.equippedInstances(), now);
    this.drawEnemies(state, alpha, now);
    drawProjectiles(ctx, cam, state, alpha);
    this.drawEnemyBullets(state, alpha);
    drawOrbits(ctx, cam, state, this.sim.equippedInstances());
    this.drawWeaponFx(state, alpha, now);
    this.drawPlayer(state, now);

    this.effects.update(dt);
    this.effects.draw(ctx, cam);
  }

  private drawEnemies(state: SimState, alpha: number, now: number): void {
    for (const e of state.enemies) {
      const def = ENEMIES[e.defId];
      if (!def) continue;
      const x = this.cam.x(e.px + (e.x - e.px) * alpha);
      let y = this.cam.y(e.py + (e.y - e.py) * alpha);
      const sprite = spaceEnemySprite(def.shape, def.color, this.cam.r(e.radius));

      if (def.shape === 'circle' || def.shape === 'square') {
        // 운석: 개체별 속도/방향으로 천천히 자전
        const spin = ((e.id % 7) + 2) * 0.12 * (e.id % 2 === 0 ? 1 : -1);
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(now * 0.001 * spin * Math.PI);
        this.ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        this.ctx.restore();
      } else {
        // 외계인: 회전 대신 위아래로 떠다니는 부유감
        y += Math.sin(now * 0.004 + e.id) * this.cam.r(1.6);
        this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
      }
      // 피해를 입은 적만 미니 HP바
      if (e.hp < e.maxHp) {
        const w = this.cam.r(e.radius * 2);
        this.ctx.fillStyle = '#000000aa';
        this.ctx.fillRect(x - w / 2, y - this.cam.r(e.radius) - 6, w, 3);
        this.ctx.fillStyle = '#e05a5a';
        this.ctx.fillRect(x - w / 2, y - this.cam.r(e.radius) - 6, (w * e.hp) / e.maxHp, 3);
      }
    }
  }

  /** 적 탄환 — 정찰선의 플라즈마 볼트 (붉은 발광으로 아군 투사체와 구분) */
  private drawEnemyBullets(state: SimState, alpha: number): void {
    for (const b of state.enemyProjectiles) {
      if (b.dead) continue;
      const x = this.cam.x(b.px + (b.x - b.px) * alpha);
      const y = this.cam.y(b.py + (b.y - b.py) * alpha);
      const sprite = projectileSprite('#ff5a7a', this.cam.r(b.radius), 1);
      this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
  }

  /** 장착 무기의 전투 이펙트 — 광자 빔(대상 연결)·회전 광선(활성 회전) */
  private drawWeaponFx(state: SimState, alpha: number, now: number): void {
    const slot = state.weapons.find((w) => w.equipped) ?? state.weapons[0];
    const def = slot ? WEAPONS[slot.weaponId] : undefined;
    if (!def) return;
    const cam = this.cam;

    if (def.behavior === 'beam') {
      // sim의 판정과 같은 대상(가장 가까운 적, 사거리 내) — 보간 위치로 그린다
      let best: { x: number; y: number; r: number } | null = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        const d = e.x * e.x + e.y * e.y;
        if (d < bestD) {
          bestD = d;
          best = { x: e.px + (e.x - e.px) * alpha, y: e.py + (e.y - e.py) * alpha, r: e.radius };
        }
      }
      if (!best) return;
      const rr = BALANCE.BEAM_RANGE + best.r;
      if (bestD > rr * rr) return;
      const aim = Math.atan2(best.y, best.x);
      const muzzle = cam.r(BALANCE.PLAYER_RADIUS) * 1.6;
      drawBeamFx(
        this.ctx,
        cam.x(0) + Math.cos(aim) * muzzle,
        cam.y(0) + Math.sin(aim) * muzzle,
        cam.x(best.x),
        cam.y(best.y),
        def.tint,
        cam.scale,
        now,
      );
    }

    if (def.behavior === 'sweep') {
      const active = state.cooldowns['weaponSweep'] ?? 0;
      if (active <= 0) return;
      // sim의 부채꼴 진행(weapon-fire.ts)과 같은 공식 + alpha 보간으로 부드럽게
      const done = BALANCE.SWEEP_DURATION_TICKS - active;
      const angle = ((done + alpha) * Math.PI * 2) / BALANCE.SWEEP_DURATION_TICKS;
      drawSweepFx(this.ctx, cam.x(0), cam.y(0), cam.r(BALANCE.SWEEP_RADIUS), angle, def.tint, cam.scale);
    }
  }

  private drawPlayer(state: SimState, now: number): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const px = cam.x(0);
    const py = cam.y(0);
    const r = cam.r(BALANCE.PLAYER_RADIUS);

    // 가장 가까운 적을 조준 — 적이 없으면 마지막 각도 유지
    let bestD = Infinity;
    for (const e of state.enemies) {
      const d = e.x * e.x + e.y * e.y;
      if (d < bestD) {
        bestD = d;
        this.aimAngle = Math.atan2(e.y, e.x);
      }
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.aimAngle);

    // 추진 화염 — 배기 방향(-x)으로 일렁이는 플라즈마
    const flick = 0.75 + 0.25 * Math.sin(now * 0.02) + 0.12 * Math.sin(now * 0.047);
    const flameLen = r * 1.5 * flick;
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [1, -1]) {
      const fy = side * r * 0.28;
      const g = ctx.createLinearGradient(-r * 1.05, fy, -r * 1.05 - flameLen, fy);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(127,212,255,0.7)');
      g.addColorStop(1, 'rgba(90,166,232,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, fy - r * 0.14);
      ctx.lineTo(-r * 1.05 - flameLen, fy);
      ctx.lineTo(-r * 1.05, fy + r * 0.14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 우주선 본체 (+x 방향 스프라이트)
    const ship = shipSprite(r);
    ctx.drawImage(ship, -ship.width / 2, -ship.height / 2);
    ctx.restore();

    // 무기 — 강화 티어에 따라 외형 변경, 조준 방향에 그린다 (behavior별 형태)
    const slot = state.weapons.find((w) => w.equipped) ?? state.weapons[0];
    if (slot) {
      const def = WEAPONS[slot.weaponId];
      if (def) {
        const tierKey = def.tiers[weaponTier(def, slot.level)] ?? def.tiers[0]!;
        drawWeapon(ctx, px, py, this.aimAngle, tierKey, cam.scale, def.behavior);
      }
    }

    // HP 바
    const w = cam.r(BALANCE.PLAYER_RADIUS * 2.6);
    const hpRatio = Math.max(0, state.player.hp / state.player.maxHp);
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(px - w / 2, py - cam.r(BALANCE.PLAYER_RADIUS) - 10, w, 4);
    ctx.fillStyle = hpRatio > 0.3 ? '#6fce6f' : '#e05a5a';
    ctx.fillRect(px - w / 2, py - cam.r(BALANCE.PLAYER_RADIUS) - 10, w * hpRatio, 4);
  }
}
