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
import { projectileSprite, shapeSprite } from './sprite-cache';
import { drawWeapon } from './weapon-visuals';

export class CanvasRenderer implements IRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cam = new Camera();
  private readonly effects: EffectsLayer;
  private lastFrameAt = 0;

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
  }

  render(state: SimState, alpha: number): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const now = performance.now();
    const dt = this.lastFrameAt === 0 ? 16 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    ctx.fillStyle = '#12141c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 아레나 경계
    ctx.strokeStyle = '#2a2e3e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cam.x(0), cam.y(0), cam.r(BALANCE.ARENA_RADIUS), 0, Math.PI * 2);
    ctx.stroke();

    this.drawAuras(state);
    this.drawEnemies(state, alpha);
    this.drawProjectiles(state, alpha);
    this.drawOrbits(state);
    this.drawPlayer(state);

    this.effects.update(dt);
    this.effects.draw(ctx, cam);
  }

  private drawAuras(state: SimState): void {
    for (const inst of this.sim.equippedInstances()) {
      if (inst.behavior !== 'aura') continue;
      this.ctx.fillStyle = `${inst.tint}18`;
      this.ctx.strokeStyle = `${inst.tint}55`;
      this.ctx.beginPath();
      this.ctx.arc(this.cam.x(0), this.cam.y(0), this.cam.r(inst.radius), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  private drawEnemies(state: SimState, alpha: number): void {
    for (const e of state.enemies) {
      const def = ENEMIES[e.defId];
      if (!def) continue;
      const x = this.cam.x(e.px + (e.x - e.px) * alpha);
      const y = this.cam.y(e.py + (e.y - e.py) * alpha);
      const sprite = shapeSprite(def.shape, def.color, this.cam.r(e.radius));
      this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
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

  private drawProjectiles(state: SimState, alpha: number): void {
    for (const p of state.projectiles) {
      const x = this.cam.x(p.px + (p.x - p.px) * alpha);
      const y = this.cam.y(p.py + (p.y - p.py) * alpha);
      const sprite = projectileSprite(p.tint ?? '#cfd6ff', this.cam.r(p.radius));
      this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
  }

  private drawOrbits(state: SimState): void {
    for (const inst of this.sim.equippedInstances()) {
      if (inst.behavior !== 'orbit') continue;
      for (let i = 0; i < inst.count; i++) {
        const angle = state.orbitAngle + (i * Math.PI * 2) / inst.count;
        const x = this.cam.x(Math.cos(angle) * inst.radius);
        const y = this.cam.y(Math.sin(angle) * inst.radius);
        const sprite = projectileSprite(inst.tint, this.cam.r(BALANCE.ORBIT_BLADE_RADIUS * 0.6));
        this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
      }
    }
  }

  private drawPlayer(state: SimState): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const px = cam.x(0);
    const py = cam.y(0);

    // 몸체
    ctx.fillStyle = '#e8e0d0';
    ctx.strokeStyle = '#2a2e3e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, cam.r(BALANCE.PLAYER_RADIUS), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 무기 — 강화 티어에 따라 외형 변경, 가장 가까운 적을 조준
    const slot = state.weapons.find((w) => w.equipped) ?? state.weapons[0];
    if (slot) {
      const def = WEAPONS[slot.weaponId];
      if (def) {
        const tierKey = def.tiers[weaponTier(def, slot.level)] ?? def.tiers[0]!;
        let angle = -Math.PI / 4;
        let bestD = Infinity;
        for (const e of state.enemies) {
          const d = e.x * e.x + e.y * e.y;
          if (d < bestD) {
            bestD = d;
            angle = Math.atan2(e.y, e.x);
          }
        }
        drawWeapon(ctx, px, py, angle, tierKey, cam.scale);
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
