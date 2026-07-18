/**
 * 무기 강화 패널 — sim에는 명령 객체로만 접근 (§2 의존 규칙).
 */
import { WEAPONS } from '../content/weapons';
import { weaponDamage, weaponTier, weaponUpgradeCost } from '../sim/progression/growth';
import type { Simulation } from '../sim/simulation';
import { button, el, fmt } from './dom';

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
      const tier = weaponTier(def, slot.level);
      const card = el('div', slot.equipped ? 'card equipped' : 'card');

      const title = el('div', 'card-title', `${def.name} Lv.${slot.level}`);
      const sub = el(
        'div',
        'card-sub',
        `티어 ${tier + 1} (${def.tiers[tier]}) · 데미지 ${fmt(weaponDamage(def, slot.level))}`,
      );
      card.append(title, sub);

      const row = el('div', 'card-actions');
      const cost = weaponUpgradeCost(def, slot.level);
      row.append(
        button(`강화 (${fmt(cost)}G)`, () => {
          this.sim.execute({ type: 'upgradeWeapon', weaponId: slot.weaponId });
          this.refresh();
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
}
