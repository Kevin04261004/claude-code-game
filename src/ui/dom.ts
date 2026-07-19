/** 작은 DOM 생성 헬퍼 — UI 모듈 공용 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.addEventListener('click', onClick);
  return b;
}

/** 꾹 누름 반복 타이밍 — UI 감각 값 (게임 밸런스 아님) */
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 120;

/**
 * 누르는 즉시 1회 실행되고, 꾹 누르면 마우스/손을 뗄 때까지 반복 실행되는 버튼.
 * 실행 결과로 패널이 리렌더돼 버튼 DOM이 교체되어도 반복이 끊기지 않도록
 * 종료 감지는 버튼이 아닌 window의 pointerup/pointercancel에 건다.
 */
export function repeatButton(label: string, action: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.style.touchAction = 'none'; // 홀드 중 스크롤로 pointercancel되는 것을 방지
  b.style.setProperty('-webkit-user-select', 'none');
  b.style.setProperty('-webkit-touch-callout', 'none'); // iOS 롱프레스 메뉴 방지
  b.addEventListener('contextmenu', (e) => e.preventDefault()); // Android 롱프레스 메뉴 방지
  b.addEventListener('click', (e) => {
    if (e.detail === 0) action(); // 키보드(Enter/Space)로 눌렀을 때만 — 포인터는 pointerdown이 처리
  });
  b.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault(); // 텍스트 선택 방지
    action();
    let repeat: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => {
      repeat = setInterval(action, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
    const stop = () => {
      clearTimeout(delay);
      if (repeat !== null) clearInterval(repeat);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop); // 홀드 중 탭 전환 등으로 up을 놓쳐도 정지
  });
  return b;
}

export function fmt(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.floor(n));
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
