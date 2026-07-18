/**
 * 시뮬레이션 파사드 — 헤드리스 (DOM/Canvas 참조 금지).
 * 틱 순서 고정(§3.3): spawner → movement → collision → targeting/skills →
 * status → progression(스테이지/사망/정리).
 * 외부(UI)는 execute(명령 객체)로만 상태를 바꾼다.
 */
import { BALANCE } from '../config/balance';
import { TWO_PI } from '../core/math';
import { EventBus } from '../core/event-bus';
import { Rng } from '../core/rng';
import { SpatialGrid, resolveProjectiles } from './combat/collision';
import type { CombatCtx } from './combat/damage';
import { tickMovement } from './combat/movement';
import { tickSpawner } from './combat/spawner';
import { tickStatuses } from './combat/status-effects';
import { nearestEnemy } from './combat/targeting';
import { checkStageClear } from './progression/growth';
import { weaponDamage } from './progression/growth';
import { skillRollCost, skillSellPrice, skillUpgradeCost } from './progression/growth';
import { treeBonuses, unlockTreeNode } from './progression/skill-tree';
import { equipWeapon, equippedWeapon, upgradeWeapon } from './progression/weapon-upgrade';
import { decodeSkillId, encodeSkillId, rollSkillCombo } from './skills/skill-catalog';
import { composeSkill, type SkillInstance } from './skills/skill-composer';
import { spawnProjectile, tickSkills } from './skills/skill-resolver';
import type { SimState } from './state';

export type SimCommand =
  | { type: 'upgradeWeapon'; weaponId: string }
  | { type: 'equipWeapon'; weaponId: string }
  | { type: 'rollSkill' }
  | { type: 'upgradeSkill'; skillId: string }
  | { type: 'sellSkill'; skillId: string }
  | { type: 'equipSkill'; skillId: string; slot: number }
  | { type: 'unequipSkill'; slot: number }
  | { type: 'unlockTreeNode'; nodeId: string };

export class Simulation {
  readonly state: SimState;
  readonly bus: EventBus;
  private readonly rng: Rng;
  private readonly grid = new SpatialGrid();
  private instancesCache: SkillInstance[] | null = null;

  constructor(state: SimState, bus: EventBus) {
    this.state = state;
    this.bus = bus;
    this.rng = new Rng(state.rngState);
  }

  /** 장착 스킬의 합성 결과 (장착/레벨 변경 시까지 캐시) — 렌더러도 읽는다 */
  equippedInstances(): SkillInstance[] {
    if (!this.instancesCache) {
      const out: SkillInstance[] = [];
      for (const id of this.state.skills.equipped) {
        if (!id) continue;
        const owned = this.state.skills.owned.find((s) => s.id === id);
        if (owned) out.push(composeSkill(owned.id, owned.level));
      }
      this.instancesCache = out;
    }
    return this.instancesCache;
  }

  tick(): void {
    const s = this.state;
    s.tick++;
    s.totals.playtimeTicks++;
    const bonuses = treeBonuses(s);
    const ctx: CombatCtx = {
      rng: this.rng,
      bus: this.bus,
      goldMult: bonuses.goldMult,
      damageMult: bonuses.damageMult,
    };

    tickSpawner(s, this.rng);
    tickMovement(s, BALANCE.PLAYER_BASE_REGEN + bonuses.regenAdd, this.bus);
    this.grid.build(s.enemies);
    resolveProjectiles(s, this.grid, ctx);
    s.orbitAngle = (s.orbitAngle + BALANCE.ORBIT_SPIN_PER_TICK) % TWO_PI;
    this.fireWeapon(s);
    tickSkills(s, this.equippedInstances(), this.grid, ctx);
    tickStatuses(s, ctx);

    // 정리: 죽은 적/소멸한 투사체 제거 (틱 중에는 hp<=0 마킹만)
    if (s.enemies.some((e) => e.hp <= 0)) s.enemies = s.enemies.filter((e) => e.hp > 0);
    if (s.projectiles.some((p) => p.dead)) s.projectiles = s.projectiles.filter((p) => !p.dead);
    if (s.enemyProjectiles.some((b) => b.dead)) s.enemyProjectiles = s.enemyProjectiles.filter((b) => !b.dead);

    checkStageClear(s, this.bus);
    this.checkDeath(s);

    s.rngState = this.rng.state; // 클론/세이브가 언제나 현재 난수 상태를 갖도록
  }

  private fireWeapon(s: SimState): void {
    const eq = equippedWeapon(s);
    if (!eq) return;
    const left = s.cooldowns['weapon'] ?? 0;
    if (left > 0) {
      s.cooldowns['weapon'] = left - 1;
      return;
    }
    const target = nearestEnemy(s);
    if (!target) return;
    const d = Math.sqrt(target.x * target.x + target.y * target.y);
    spawnProjectile(s, {
      damage: weaponDamage(eq.def, eq.slot.level),
      dirX: target.x / d,
      dirY: target.y / d,
      speed: eq.def.projectileSpeed,
      radius: eq.def.projectileRadius,
      pierce: 0,
      status: null,
      lifestealPct: 0,
      explodePct: 0,
      canCrit: true,
      tint: null,
      styleKey: 'weapon',
      gradeIndex: 0,
    });
    s.cooldowns['weapon'] = eq.def.cooldownTicks;
  }

  private checkDeath(s: SimState): void {
    if (s.player.hp > 0) return;
    s.enemies = [];
    s.projectiles = [];
    s.enemyProjectiles = [];
    s.player.hp = s.player.maxHp;
    s.stage.index = Math.max(0, s.stage.index - BALANCE.DEATH_STAGE_PENALTY);
    s.stage.kills = 0;
    s.spawnAcc = 0;
    this.bus.emit('state', { type: 'playerDied', stageIndex: s.stage.index });
  }

  execute(cmd: SimCommand): boolean {
    const s = this.state;
    switch (cmd.type) {
      case 'upgradeWeapon':
        return upgradeWeapon(s, this.bus, cmd.weaponId);
      case 'equipWeapon':
        return equipWeapon(s, this.bus, cmd.weaponId);
      case 'rollSkill':
        return this.rollSkill();
      case 'upgradeSkill':
        return this.upgradeSkill(cmd.skillId);
      case 'sellSkill':
        return this.sellSkill(cmd.skillId);
      case 'equipSkill':
        return this.equipSkill(cmd.skillId, cmd.slot);
      case 'unequipSkill':
        return this.unequipSkill(cmd.slot);
      case 'unlockTreeNode':
        return unlockTreeNode(s, this.bus, cmd.nodeId);
    }
  }

  private rollSkill(): boolean {
    const s = this.state;
    const cost = skillRollCost(s.skills.rollCount);
    if (s.player.gold < cost) return false;
    s.player.gold -= cost;
    s.skills.rollCount++;
    const id = encodeSkillId(rollSkillCombo(this.rng, s.stage.highestIndex));
    const existing = s.skills.owned.find((sk) => sk.id === id);
    if (existing) {
      existing.level++; // 중복 획득 → 레벨 전환
    } else {
      s.skills.owned.push({ id, level: 1 });
      const empty = s.skills.equipped.indexOf(null);
      if (empty >= 0) s.skills.equipped[empty] = id; // 빈 슬롯 자동 장착
    }
    s.rngState = this.rng.state;
    this.invalidateSkills();
    this.bus.emit('state', { type: 'skillRolled', skillId: id, duplicate: !!existing });
    return true;
  }

  private upgradeSkill(skillId: string): boolean {
    const s = this.state;
    const owned = s.skills.owned.find((sk) => sk.id === skillId);
    if (!owned) return false;
    const inst = composeSkill(owned.id, owned.level);
    const cost = skillUpgradeCost(inst.gradeIndex, owned.level);
    if (s.player.gold < cost) return false;
    s.player.gold -= cost;
    owned.level++;
    this.invalidateSkills();
    this.bus.emit('state', { type: 'skillUpgraded', skillId, level: owned.level });
    return true;
  }

  /** 스킬 판매 — 보유 목록에서 제거하고 판매가만큼 골드 환급. 장착 중이면 자동 해제 */
  private sellSkill(skillId: string): boolean {
    const s = this.state;
    const idx = s.skills.owned.findIndex((sk) => sk.id === skillId);
    if (idx < 0) return false;
    const owned = s.skills.owned[idx]!;
    const inst = composeSkill(owned.id, owned.level);
    const price = skillSellPrice(inst.gradeIndex, owned.level, decodeSkillId(owned.id).modIds.length);
    s.skills.owned.splice(idx, 1);
    for (let i = 0; i < s.skills.equipped.length; i++) {
      if (s.skills.equipped[i] === skillId) s.skills.equipped[i] = null;
    }
    s.player.gold += price;
    this.invalidateSkills();
    this.bus.emit('state', { type: 'skillSold', skillId, gold: price });
    return true;
  }

  private equipSkill(skillId: string, slot: number): boolean {
    const s = this.state;
    if (slot < 0 || slot >= BALANCE.SKILL_SLOTS) return false;
    if (!s.skills.owned.some((sk) => sk.id === skillId)) return false;
    // 같은 스킬이 다른 슬롯에 있으면 해제 (중복 장착 금지)
    for (let i = 0; i < s.skills.equipped.length; i++) {
      if (s.skills.equipped[i] === skillId) s.skills.equipped[i] = null;
    }
    s.skills.equipped[slot] = skillId;
    this.invalidateSkills();
    this.bus.emit('state', { type: 'skillEquipped', skillId, slot });
    return true;
  }

  private unequipSkill(slot: number): boolean {
    const s = this.state;
    if (slot < 0 || slot >= s.skills.equipped.length) return false;
    if (s.skills.equipped[slot] === null) return false;
    s.skills.equipped[slot] = null;
    this.invalidateSkills();
    this.bus.emit('state', { type: 'skillEquipped', skillId: null, slot });
    return true;
  }

  private invalidateSkills(): void {
    this.instancesCache = null;
    // 사라진 스킬의 쿨다운 잔재는 무해하지만, 캐시 무효화 시점에 정리
    for (const key of Object.keys(this.state.cooldowns)) {
      if (key !== 'weapon' && !this.state.skills.equipped.includes(key)) {
        delete this.state.cooldowns[key];
      }
    }
  }
}
