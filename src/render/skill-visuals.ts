/**
 * 스킬별 전투 씬 비주얼 (§1 렌더 계층 — sim 읽기 전용)
 * - 발사체: styleKey(기본형)별 형태 + 속성 틴트 + 등급 발광 + 잔상 궤적
 * - 회전 칼날: 초승달 스프라이트를 궤도 접선 방향으로 회전
 * - 오라: 다중 장착 시 대시 패턴/역방향 회전 애니메이션으로 서로 구분
 *   (같은 반경이라도 두 원이 모두 보이도록 — 실제 판정 반경은 그대로 표시)
 */
import { BALANCE } from '../config/balance';
import { orbitPhase } from '../sim/skills/skill-resolver';
import type { SkillInstance } from '../sim/skills/skill-composer';
import type { SimState } from '../sim/state';
import type { Camera } from './camera';
import { bladeSprite, lanceSprite, projectileSprite } from './sprite-cache';

export function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  state: SimState,
  alpha: number,
): void {
  for (const p of state.projectiles) {
    const wx = p.px + (p.x - p.px) * alpha;
    const wy = p.py + (p.y - p.py) * alpha;
    const x = cam.x(wx);
    const y = cam.y(wy);
    const color = p.tint ?? '#cfd6ff';

    // 잔상 궤적: 이번 틱 이동 선분을 옅게
    const tx = cam.x(p.px);
    const ty = cam.y(p.py);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = Math.max(1, cam.r(p.radius) * 0.5);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (p.styleKey === 'piercing_lance') {
      const sprite = lanceSprite(color, cam.r(p.radius * 4.5), p.gradeIndex);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    } else {
      // weapon / magic_bolt / 기타: 발광 구체 (등급이 높을수록 큰 발광)
      const sprite = projectileSprite(color, cam.r(p.radius), p.gradeIndex);
      ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
  }
}

export function drawOrbits(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  state: SimState,
  instances: SkillInstance[],
): void {
  for (let j = 0; j < instances.length; j++) {
    const inst = instances[j]!;
    if (inst.behavior !== 'orbit') continue;
    // 궤도 가이드 링 (옅게) — 어느 스킬의 칼날인지 시각적으로 묶어준다
    ctx.strokeStyle = inst.tint;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cam.x(0), cam.y(0), cam.r(inst.radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let i = 0; i < inst.count; i++) {
      // sim의 판정 위치와 동일 공식 (state.orbitAngle + 슬롯 위상차 + 칼날 간격)
      const angle = state.orbitAngle + orbitPhase(j) + (i * Math.PI * 2) / inst.count;
      const x = cam.x(Math.cos(angle) * inst.radius);
      const y = cam.y(Math.sin(angle) * inst.radius);
      const sprite = bladeSprite(inst.tint, cam.r(BALANCE.ORBIT_BLADE_RADIUS * 0.9), inst.gradeIndex);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2); // 궤도 접선 방향
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }
  }
}

export function drawAuras(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  instances: SkillInstance[],
  timeMs: number,
): void {
  let auraIndex = 0;
  for (const inst of instances) {
    if (inst.behavior !== 'aura') continue;
    const r = cam.r(inst.radius);
    const cx = cam.x(0);
    const cy = cam.y(0);
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 400 + auraIndex * 1.7);

    // 채움: 속성색을 아주 옅게 (겹치면 색이 섞여 보임)
    ctx.fillStyle = inst.tint;
    ctx.globalAlpha = 0.06 + 0.03 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 테두리: 오라마다 다른 대시 패턴 + 서로 반대 방향으로 회전 → 같은 반경도 구분됨
    const dash = 6 + auraIndex * 5;
    ctx.setLineDash([dash, dash * 0.7]);
    ctx.lineDashOffset = (timeMs / 30) * (auraIndex % 2 === 0 ? 1 : -1);
    ctx.strokeStyle = inst.tint;
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    auraIndex++;
  }
}
