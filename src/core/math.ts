/**
 * 결정론적 수학 유틸 (ARCHITECTURE.md §3.3)
 *
 * sim 내부에서는 Math.sin/cos/tan/atan2/pow(비정수 지수)를 쓰지 않는다 —
 * 스펙이 정확도를 강제하지 않아 플랫폼별로 마지막 비트가 갈라질 수 있다.
 * IEEE 754가 정확히 규정하는 +,-,*,/,sqrt 만으로 자체 구현한다.
 */
export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** 결정론적 sin — [-π,π] 범위 축약 후 테일러 급수 (기본 연산만 사용) */
export function dSin(x: number): number {
  x = x % TWO_PI;
  if (x > PI) x -= TWO_PI;
  else if (x < -PI) x += TWO_PI;
  const x2 = x * x;
  // x - x³/3! + x⁵/5! - … - x¹⁵/15!  (|x|≤π에서 오차 ~1e-6, 게임용으로 충분)
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))))
  );
}

/** 결정론적 cos */
export function dCos(x: number): number {
  return dSin(x + HALF_PI);
}

/** 정수 거듭제곱 — Math.pow 대신 사용 (성장 곡선의 지수는 전부 정수) */
export function ipow(base: number, n: number): number {
  let r = 1;
  let b = base;
  let e = Math.floor(n);
  if (e < 0) return 1 / ipow(base, -e);
  while (e > 0) {
    if (e & 1) r *= b;
    b *= b;
    e >>= 1;
  }
  return r;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** 벡터 (dx,dy)를 angle만큼 회전 — 결정론적 삼각함수 사용 */
export function rotate(dx: number, dy: number, angle: number): { x: number; y: number } {
  const c = dCos(angle);
  const s = dSin(angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
