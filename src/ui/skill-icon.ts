/**
 * 스킬 아이콘 — 절차적 캔버스 드로잉 (UI 계층 전용, sim에서 참조 금지).
 * 기본형(behavior)마다 고유 실루엣, 속성 색으로 틴트, 등급 색 테두리,
 * 변형 옵션 개수는 우하단 점으로 표기 → ID만 보고도 능력을 유추할 수 있게.
 * 같은 아이콘이 여러 곳(슬롯 + 보유 목록)에 동시에 붙을 수 있어
 * 캔버스 요소가 아닌 data URL을 캐싱하고 <img>로 쓴다.
 */
import { SKILL_ELEMENTS } from '../content/skills/skill-elements';
import { SKILL_GRADES } from '../content/skills/skill-grades';
import { decodeSkillId } from '../sim/skills/skill-catalog';

const SIZE = 64; // 내부 해상도 — 표시 크기는 CSS가 결정
const cache = new Map<string, string>();

export function skillIconURL(skillId: string): string {
  const hit = cache.get(skillId);
  if (hit) return hit;

  const combo = decodeSkillId(skillId);
  const tint = SKILL_ELEMENTS[combo.elementId]!.visualTint;
  const grade = SKILL_GRADES[combo.gradeId]!;

  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;

  drawBackground(ctx, tint);
  drawMotif(ctx, combo.baseId, tint);
  drawModPips(ctx, combo.modIds.length);
  drawGradeBorder(ctx, grade.color, grade.index);

  const url = c.toDataURL();
  cache.set(skillId, url);
  return url;
}

function drawBackground(ctx: CanvasRenderingContext2D, tint: string): void {
  const r = SIZE * 0.18;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, SIZE - 3, SIZE - 3, r);
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, '#232840');
  bg.addColorStop(1, '#12151f');
  ctx.fillStyle = bg;
  ctx.fill();
  // 중앙에 옅은 속성색 광원
  const glow = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 2, SIZE / 2, SIZE / 2, SIZE * 0.55);
  glow.addColorStop(0, hexA(tint, 0.28));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fill();
}

/** 기본형별 실루엣 — 좌표계는 아이콘 중앙 원점 */
function drawMotif(ctx: CanvasRenderingContext2D, baseId: string, tint: string): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  switch (baseId) {
    case 'magic_bolt': {
      // 마력탄: 대각선 궤적을 그리는 발광 구체
      for (const [x, y, r, a] of [[-15, 12, 5, 0.22], [-7, 5, 7, 0.45]] as const) {
        ctx.fillStyle = hexA(tint, a);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(4, -4, 0, 4, -4, 12);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, tint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(4, -4, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'piercing_lance': {
      // 관통창: 우상단을 향한 길쭉한 창 + 관통선
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = hexA(tint, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(21, 0); // 촉
      ctx.lineTo(4, -6);
      ctx.lineTo(-19, 0);
      ctx.lineTo(4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'orbit_blade': {
      // 회전 칼날: 점선 궤도 + 마주보는 초승달 두 개
      ctx.strokeStyle = hexA(tint, 0.45);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [1, -1]) {
        ctx.save();
        ctx.translate(17 * side, 0);
        ctx.rotate(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(0, 0, 8, -Math.PI * 0.75, Math.PI * 0.75);
        ctx.arc(3.6, 0, 5.6, Math.PI * 0.75, -Math.PI * 0.75, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'nova': {
      // 충격파: 바깥으로 퍼지는 동심원
      const rings: readonly [number, number, number][] = [[7, 3, 1], [13, 2.5, 0.55], [19, 2, 0.28]];
      for (const [r, w, a] of rings) {
        ctx.strokeStyle = hexA(tint, a);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'aura': {
      // 오라: 은은하게 차오르는 원반 + 테두리
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
      g.addColorStop(0, hexA(tint, 0.85));
      g.addColorStop(0.7, hexA(tint, 0.35));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(tint, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // 알 수 없는 기본형 — 단색 구체 폴백
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 변형 옵션 개수 — 우하단 흰 점 */
function drawModPips(ctx: CanvasRenderingContext2D, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = SIZE - 11 - i * 8;
    const y = SIZE - 11;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawGradeBorder(ctx: CanvasRenderingContext2D, color: string, gradeIndex: number): void {
  ctx.save();
  if (gradeIndex >= 3) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 2 + gradeIndex;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, SIZE - 3, SIZE - 3, SIZE * 0.18);
  ctx.stroke();
  ctx.restore();
}

/** '#rrggbb' → 'rgba(r,g,b,a)' */
function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
