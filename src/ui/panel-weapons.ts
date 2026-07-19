/**
 * 무기 강화 패널 — sim에는 명령 객체로만 접근 (§2 의존 규칙).
 * 특성 수치는 sim이 쓰는 공식(growth.ts/BALANCE)에서 그대로 파생해 표시한다
 * — 표시와 실제 동작이 어긋나지 않는다.
 */
import { BALANCE } from '../config/balance';
import { WEAPONS, type WeaponDef } from '../content/weapons';
import {
  beamTickDamage,
  sweepDamage,
  sweepIntervalTicks,
  sweepPeriodSec,
  weaponDamage,
  weaponTier,
  weaponUpgradeCost,
} from '../sim/progression/growth';
import type { Simulation } from '../sim/simulation';
import { button, el, fmt, repeatButton } from './dom';

const BEHAVIOR_BADGE: Record<WeaponDef['behavior'], string> = {
  bolt: '⚡ 속사형',
  shell: '💥 폭발형',
  beam: '🔗 지속형',
  sweep: '🌀 주기형',
};

export class WeaponsPanel {
  readonly root = el('div', 'panel-body');

  constructor(private readonly sim: Simulation) {
    this.refresh();
    sim.bus.on('weaponUpgraded', () => this.refresh());
    sim.bus.on('weaponEquipped', () => this.refresh());
  }

  refresh(): void {
    this.root.replaceChildren();
    for (const slot of this.sim.state.weapons) {
      const def = WEAPONS[slot.weaponId];
      if (!def) continue;
      const card = el('div', slot.equipped ? 'card equipped' : 'card');

      const head = el('div', 'card-title', `${def.name} Lv.${slot.level}`);
      const badge = el('span', 'weapon-badge', ` ${BEHAVIOR_BADGE[def.behavior]}`);
      badge.style.color = def.tint;
      head.append(badge);
      card.append(head);
      card.append(el('div', 'card-sub', def.desc));

      for (const line of this.statLines(def, slot.level)) {
        card.append(el('div', 'card-sub weapon-stat', line));
      }

      const row = el('div', 'card-actions');
      const cost = weaponUpgradeCost(def, slot.level);
      row.append(
        // 꾹 누르면 뗄 때까지 연속 강화 — 성공 시 weaponUpgraded 이벤트가 refresh를 부른다
        repeatButton(`강화 (${fmt(cost)}G)`, () => {
          this.sim.execute({ type: 'upgradeWeapon', weaponId: slot.weaponId });
        }),
      );
      if (!slot.equipped) {
        row.append(
          button('장착', () => {
            this.sim.execute({ type: 'equipWeapon', weaponId: slot.weaponId });
          }, 'btn secondary'),
        );
      }
      card.append(row);
      this.root.append(card);
    }
  }

  /** behavior별 정확한 수치 — sim과 같은 공식에서 파생 */
  private statLines(def: WeaponDef, level: number): string[] {
    const tier = weaponTier(def, level) + 1;
    const dmg = weaponDamage(def, level);
    switch (def.behavior) {
      case 'bolt': {
        const perSec = BALANCE.TPS / def.cooldownTicks;
        return [
          `티어 ${tier} · 발당 ${fmt(dmg)} · 초당 ${perSec.toFixed(1)}발`,
          `DPS ${fmt(dmg * perSec)}`,
        ];
      }
      case 'shell': {
        const perSec = BALANCE.TPS / def.cooldownTicks;
        return [
          `티어 ${tier} · 직격 ${fmt(dmg)} · 초당 ${perSec.toFixed(1)}발`,
          `폭발: 반경 ${BALANCE.CANNON_AOE_RADIUS} 내 ${Math.round(BALANCE.CANNON_AOE_PCT * 100)}% 피해 · 직격 DPS ${fmt(dmg * perSec)}`,
        ];
      }
      case 'beam': {
        const hitsPerSec = BALANCE.TPS / BALANCE.BEAM_HIT_PERIOD_TICKS;
        const tickDmg = beamTickDamage(def, level);
        return [
          `티어 ${tier} · 초당 ${hitsPerSec.toFixed(0)}회 × ${fmt(tickDmg)} 지속 피해`,
          `사거리 ${BALANCE.BEAM_RANGE} · DPS ${fmt(tickDmg * hitsPerSec)} (크리 없음)`,
        ];
      }
      case 'sweep': {
        const rotDmg = sweepDamage(def, level);
        const period = sweepPeriodSec(def, level);
        const nextPeriod = sweepPeriodSec(def, level + 1);
        const periodLine =
          nextPeriod < period
            ? `주기 ${period.toFixed(1)}초 (다음 레벨 ${nextPeriod.toFixed(1)}초)`
            : sweepIntervalTicks(def, level) <= BALANCE.SWEEP_MIN_INTERVAL_TICKS
              ? `주기 ${period.toFixed(1)}초 (최소 도달)`
              : `주기 ${period.toFixed(1)}초`;
        return [
          `티어 ${tier} · 회전당 ${fmt(rotDmg)} — 반경 ${BALANCE.SWEEP_RADIUS} 내 모든 적`,
          `${periodLine} · 적당 DPS ${fmt(rotDmg / period)}`,
        ];
      }
    }
  }
}
