/**
 * 무기 강화/장착 명령 처리. 외형 티어는 레벨에서 파생되며,
 * 티어가 바뀌면 weaponUpgraded 이벤트에 tierChanged로 표시된다
 * (렌더러가 이를 구독해 무기 외형을 갱신).
 */
import type { EventBus } from '../../core/event-bus';
import { WEAPONS } from '../../content/weapons';
import type { SimState } from '../state';
import { weaponTier, weaponUpgradeCost } from './growth';

export function upgradeWeapon(state: SimState, bus: EventBus, weaponId: string): boolean {
  const slot = state.weapons.find((w) => w.weaponId === weaponId);
  const def = WEAPONS[weaponId];
  if (!slot || !def) return false;
  const cost = weaponUpgradeCost(def, slot.level);
  if (state.player.gold < cost) return false;

  const prevTier = weaponTier(def, slot.level);
  state.player.gold -= cost;
  slot.level++;
  const tier = weaponTier(def, slot.level);
  bus.emit('state', {
    type: 'weaponUpgraded',
    weaponId,
    level: slot.level,
    tier,
    tierChanged: tier !== prevTier,
  });
  return true;
}

export function equipWeapon(state: SimState, bus: EventBus, weaponId: string): boolean {
  if (!state.weapons.some((w) => w.weaponId === weaponId)) return false;
  for (const w of state.weapons) w.equipped = w.weaponId === weaponId;
  bus.emit('state', { type: 'weaponEquipped', weaponId });
  return true;
}

export function equippedWeapon(state: SimState) {
  const slot = state.weapons.find((w) => w.equipped) ?? state.weapons[0];
  if (!slot) return null;
  const def = WEAPONS[slot.weaponId];
  return def ? { slot, def } : null;
}
