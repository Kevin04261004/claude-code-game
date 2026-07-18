/**
 * 우주 배경 — 심우주 그라데이션 + 성운 + 별밭을 오프스크린 캔버스에 1회 렌더,
 * 프레임 루프에서는 drawImage 1번 + 반짝이는 별 몇 개만 그린다 (§1 성능 원칙).
 * 순수 연출 계층: 시뮬 상태를 읽지 않으므로 네이티브 Math.random 사용 가능.
 */

interface Twinkle {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

const NEBULA_COLORS = ['#31215a', '#16324a', '#41224a', '#1a3a3f'];

export class Starfield {
  private bg: HTMLCanvasElement | null = null;
  private twinkles: Twinkle[] = [];

  /** 캔버스 크기 변경 시 재생성 (픽셀 단위 — DPR 반영된 크기를 받는다) */
  build(w: number, h: number): void {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;

    // 심우주 바탕
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#060812');
    base.addColorStop(1, '#0d1020');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // 성운 — 옅은 색 구름 몇 덩어리
    for (let i = 0; i < 4; i++) {
      const nx = Math.random() * w;
      const ny = Math.random() * h;
      const nr = (0.25 + Math.random() * 0.3) * Math.min(w, h);
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      const color = NEBULA_COLORS[i % NEBULA_COLORS.length]!;
      g.addColorStop(0, `${color}38`);
      g.addColorStop(0.6, `${color}1c`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 별밭 — 대부분 희미한 점, 일부 밝은 별
    const count = Math.floor((w * h) / 4500);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const bright = Math.random() < 0.08;
      const r = bright ? 1 + Math.random() * 1.2 : 0.5 + Math.random() * 0.6;
      ctx.globalAlpha = bright ? 0.7 + Math.random() * 0.3 : 0.25 + Math.random() * 0.45;
      ctx.fillStyle = bright && Math.random() < 0.3 ? '#cfe4ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 십자 광채가 있는 큰 별 소수
    const sparkles = Math.max(3, Math.floor(count / 40));
    for (let i = 0; i < sparkles; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 3 + Math.random() * 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - len, y);
      ctx.lineTo(x + len, y);
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y + len);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 반짝임 애니메이션 대상 — 프레임마다 알파만 바꿔 그린다
    this.twinkles = [];
    for (let i = 0; i < 14; i++) {
      this.twinkles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.001 + Math.random() * 0.002,
      });
    }

    this.bg = c;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.bg) return;
    ctx.drawImage(this.bg, 0, 0);
    for (const t of this.twinkles) {
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * t.speed + t.phase));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
