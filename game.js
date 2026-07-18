"use strict";
/* =========================================================
   방치형 왕국 (Idle Kingdom)
   - 순수 바닐라 JS / localStorage 저장
   ========================================================= */

// ---------- 큰 숫자 축약 표기 ----------
// 1234 -> 1.23K, 1e6 -> 1.00M ... 이후 aa, ab 단위
const SUFFIX = ["", "K", "M", "B", "T", "aa", "ab", "ac", "ad", "ae", "af", "ag"];
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIX.length) tier = SUFFIX.length - 1;
  const scaled = n / Math.pow(1000, tier);
  return scaled.toFixed(2) + SUFFIX[tier];
}
function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

// ---------- 게임 데이터 정의 ----------
// 건설 시설: 초당 골드를 생산. 구매할 때마다 비용 1.15배 상승.
const BUILDINGS = [
  { id: "farm",    icon: "🌾", name: "농장",       base: 1,      cost: 15,      desc: "기본 식량과 골드 생산" },
  { id: "mine",    icon: "⛏️", name: "광산",       base: 8,      cost: 120,     desc: "광부들이 금을 캡니다" },
  { id: "market",  icon: "🏪", name: "시장",       base: 47,     cost: 1300,    desc: "교역으로 부를 축적" },
  { id: "castle",  icon: "🏯", name: "성채",       base: 260,    cost: 14000,   desc: "세금을 거두는 요새" },
  { id: "harbor",  icon: "⚓", name: "항구",       base: 1400,   cost: 200000,  desc: "해상 무역의 중심지" },
  { id: "temple",  icon: "⛩️", name: "신전",       base: 7800,   cost: 3.3e6,   desc: "순례자들의 헌금" },
  { id: "wizard",  icon: "🧙", name: "마법탑",     base: 44000,  cost: 5.1e7,   desc: "연금술로 금을 창조" },
  { id: "dragon",  icon: "🐉", name: "용의 둥지",  base: 260000, cost: 7.5e8,   desc: "용이 지키는 보물더미" },
];

// 강화 업그레이드: 클릭 파워 또는 전역 배수 강화 (1회성 구매)
const UPGRADES = [
  { id: "u_click1", icon: "👆", name: "튼튼한 삽",     desc: "클릭당 골드 +4",         cost: 100,    type: "click", value: 4 },
  { id: "u_click2", icon: "⚒️", name: "황금 곡괭이",   desc: "클릭당 골드 +25",        cost: 5000,   type: "click", value: 25 },
  { id: "u_click3", icon: "🗡️", name: "왕의 권능",     desc: "클릭당 골드 +200",       cost: 250000, type: "click", value: 200 },
  { id: "u_mult1",  icon: "📜", name: "번영의 칙령",   desc: "전체 생산량 ×2",         cost: 25000,  type: "mult",  value: 2 },
  { id: "u_mult2",  icon: "🎖️", name: "황금기 선포",   desc: "전체 생산량 ×2",         cost: 2.5e6,  type: "mult",  value: 2 },
  { id: "u_mult3",  icon: "🌟", name: "전설의 시대",   desc: "전체 생산량 ×3",         cost: 5e8,    type: "mult",  value: 3 },
];

// ---------- 게임 상태 ----------
let state;
function defaultState() {
  return {
    gold: 0,
    totalEarned: 0,     // 환생 계산용 누적 획득
    crowns: 0,          // 프레스티지 재화(왕관)
    buildings: {},      // id -> 개수
    upgrades: {},       // id -> true(구매됨)
    lastTime: Date.now(),
  };
}

// 파생 값 계산: 클릭 파워, 초당 생산량
function getMultiplier() {
  // 왕관 보너스(개당 +10%) × 구매한 배수 업그레이드
  let mult = 1 + state.crowns * 0.10;
  for (const u of UPGRADES) {
    if (u.type === "mult" && state.upgrades[u.id]) mult *= u.value;
  }
  return mult;
}
function getClickPower() {
  let power = 1;
  for (const u of UPGRADES) {
    if (u.type === "click" && state.upgrades[u.id]) power += u.value;
  }
  return power * getMultiplier();
}
function getPerSecond() {
  let total = 0;
  for (const b of BUILDINGS) {
    const owned = state.buildings[b.id] || 0;
    total += owned * b.base;
  }
  return total * getMultiplier();
}
// 시설 현재 구매 비용 (개수에 따라 지수 증가)
function buildingCost(b) {
  const owned = state.buildings[b.id] || 0;
  return Math.floor(b.cost * Math.pow(1.15, owned));
}

// 환생 시 획득 왕관: 누적 획득량 기반 (제곱근 스케일)
function prestigeGain() {
  const need = 1e6; // 최소 100만 누적부터 의미있게
  if (state.totalEarned < need) return 0;
  return Math.floor(Math.sqrt(state.totalEarned / 1e6));
}

// ---------- DOM 참조 ----------
const $ = (id) => document.getElementById(id);
const goldVal = $("goldVal"), rateVal = $("rateVal"), gemVal = $("gemVal");
const perClick = $("perClick");

// ---------- 렌더링 ----------
function renderBuildings() {
  const container = $("tab-build");
  container.innerHTML = "";
  for (const b of BUILDINGS) {
    const owned = state.buildings[b.id] || 0;
    const cost = buildingCost(b);
    const can = state.gold >= cost;
    // 이전 시설을 하나도 안 샀으면 잠금(자연스러운 진행)
    const idx = BUILDINGS.indexOf(b);
    const prevOwned = idx === 0 ? 1 : (state.buildings[BUILDINGS[idx-1].id] || 0);
    const locked = prevOwned === 0 && owned === 0;

    const card = document.createElement("div");
    card.className = "card" + (locked ? " locked" : (can ? " affordable" : ""));
    const prodEach = fmt(b.base * getMultiplier());
    card.innerHTML = `
      <div class="icon">${locked ? "🔒" : b.icon}</div>
      <div class="info">
        <div class="name">${locked ? "??? (이전 건물 필요)" : b.name}</div>
        <div class="desc">${locked ? "" : b.desc}</div>
        <div class="prod">${locked ? "" : `개당 +${prodEach}/초`}</div>
      </div>
      <div class="right">
        <div class="cost ${can ? "" : "cant"}">💰 ${fmt(cost)}</div>
        <div class="owned">보유 ${owned}</div>
      </div>`;
    if (!locked) card.onclick = () => buyBuilding(b);
    container.appendChild(card);
  }
}

function renderUpgrades() {
  const container = $("tab-upgrade");
  container.innerHTML = "";
  for (const u of UPGRADES) {
    const bought = !!state.upgrades[u.id];
    const can = !bought && state.gold >= u.cost;
    const card = document.createElement("div");
    card.className = "card" + (bought ? " locked" : (can ? " affordable" : ""));
    card.innerHTML = `
      <div class="icon">${u.icon}</div>
      <div class="info">
        <div class="name">${u.name} ${bought ? "✅" : ""}</div>
        <div class="desc">${u.desc}</div>
      </div>
      <div class="right">
        <div class="cost ${bought ? "" : (can ? "" : "cant")}">${bought ? "구매완료" : "💰 " + fmt(u.cost)}</div>
      </div>`;
    if (!bought) card.onclick = () => buyUpgrade(u);
    container.appendChild(card);
  }
}

function renderPrestige() {
  const gain = prestigeGain();
  $("prestigeGain").textContent = gain;
  $("prestigeBtn").disabled = gain <= 0;
  if (gain <= 0) {
    $("prestigeReq").textContent = `누적 100만 골드 획득 시 환생 가능 (현재 ${fmt(state.totalEarned)})`;
  } else {
    $("prestigeReq").textContent = `환생하면 왕국이 리셋되지만 강해집니다!`;
  }
}

// 상단 스탯 + 버튼 상태 갱신 (매 프레임 가벼운 갱신)
function renderStats() {
  goldVal.textContent = fmt(state.gold);
  rateVal.textContent = fmt(getPerSecond());
  gemVal.textContent = fmt(state.crowns);
  perClick.textContent = fmt(getClickPower());
}

// ---------- 구매 로직 ----------
function buyBuilding(b) {
  const cost = buildingCost(b);
  if (state.gold < cost) { toast("골드가 부족합니다!"); return; }
  state.gold -= cost;
  state.buildings[b.id] = (state.buildings[b.id] || 0) + 1;
  renderBuildings();
}
function buyUpgrade(u) {
  if (state.upgrades[u.id]) return;
  if (state.gold < u.cost) { toast("골드가 부족합니다!"); return; }
  state.gold -= u.cost;
  state.upgrades[u.id] = true;
  toast(`${u.name} 구매! ${u.desc}`);
  renderUpgrades();
  renderBuildings();
}

function doPrestige() {
  const gain = prestigeGain();
  if (gain <= 0) return;
  if (!confirm(`환생하여 💎${gain} 왕관을 얻으시겠습니까?\n골드와 건물이 모두 초기화됩니다.`)) return;
  const keepCrowns = state.crowns + gain;
  state = defaultState();
  state.crowns = keepCrowns;
  toast(`👑 환생 완료! 왕관 ${keepCrowns}개 (생산량 +${keepCrowns*10}%)`);
  renderAll();
  save();
}

// ---------- 클릭 처리 ----------
function handleClick(e) {
  const power = getClickPower();
  state.gold += power;
  state.totalEarned += power;
  spawnFloat(e, "+" + fmt(power));
}
function spawnFloat(e, text) {
  const zone = $("clickZone");
  const rect = zone.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "float";
  el.textContent = text;
  let x, y;
  if (e.touches && e.touches[0]) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
  else { x = e.clientX; y = e.clientY; }
  el.style.left = (x - rect.left - 10) + "px";
  el.style.top = (y - rect.top - 20) + "px";
  zone.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------- 게임 루프 (delta-time) ----------
let lastFrame = Date.now();
function loop() {
  const now = Date.now();
  const dt = (now - lastFrame) / 1000; // 초 단위 경과
  lastFrame = now;
  const gain = getPerSecond() * dt;
  state.gold += gain;
  state.totalEarned += gain;
  renderStats();
  // 구매 가능 여부가 바뀔 수 있으니 현재 탭 카드 하이라이트만 가볍게 갱신
  refreshAffordability();
  requestAnimationFrame(loop);
}
// 매 프레임 전체 innerHTML을 다시 그리면 무거우므로, 클래스만 토글
function refreshAffordability() {
  const buildCards = $("tab-build").children;
  BUILDINGS.forEach((b, i) => {
    const card = buildCards[i]; if (!card || card.classList.contains("locked")) return;
    const can = state.gold >= buildingCost(b);
    card.classList.toggle("affordable", can);
    const costEl = card.querySelector(".cost");
    if (costEl) costEl.classList.toggle("cant", !can);
  });
  const upCards = $("tab-upgrade").children;
  UPGRADES.forEach((u, i) => {
    const card = upCards[i]; if (!card || state.upgrades[u.id]) return;
    const can = state.gold >= u.cost;
    card.classList.toggle("affordable", can);
    const costEl = card.querySelector(".cost");
    if (costEl) costEl.classList.toggle("cant", !can);
  });
}

// ---------- 저장 / 로드 ----------
const SAVE_KEY = "idleKingdomSave_v1";
function save(silent) {
  state.lastTime = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (!silent) toast("💾 저장되었습니다");
}
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { state = defaultState(); return; }
  try {
    const loaded = JSON.parse(raw);
    state = Object.assign(defaultState(), loaded);
    state.buildings = loaded.buildings || {};
    state.upgrades = loaded.upgrades || {};
  } catch { state = defaultState(); }
}
function resetGame() {
  if (!confirm("정말 모든 진행 상황을 초기화할까요? 되돌릴 수 없습니다.")) return;
  localStorage.removeItem(SAVE_KEY);
  state = defaultState();
  renderAll();
  toast("게임이 초기화되었습니다");
}

// ---------- 오프라인 보상 ----------
function checkOffline() {
  const elapsed = (Date.now() - (state.lastTime || Date.now())) / 1000;
  if (elapsed < 10) return; // 10초 미만은 무시
  const capped = Math.min(elapsed, 60 * 60 * 8); // 최대 8시간까지만 보상
  const earned = getPerSecond() * capped;
  if (earned <= 0) return;
  state.gold += earned;
  state.totalEarned += earned;
  $("offlineTime").textContent = fmtTime(elapsed);
  $("offlineGold").textContent = fmt(earned);
  $("offlineModal").classList.add("show");
}

// ---------- 토스트 ----------
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- 탭 전환 ----------
function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      $("tab-build").classList.toggle("hidden", which !== "build");
      $("tab-upgrade").classList.toggle("hidden", which !== "upgrade");
      $("tab-prestige").classList.toggle("hidden", which !== "prestige");
      if (which === "prestige") renderPrestige();
    };
  });
}

function renderAll() {
  renderBuildings();
  renderUpgrades();
  renderPrestige();
  renderStats();
}

// ---------- 초기화 ----------
function init() {
  load();
  renderAll();
  setupTabs();
  checkOffline();

  // 클릭(마우스+터치)
  const btn = $("bigBtn");
  btn.addEventListener("click", handleClick);

  // 버튼 이벤트
  $("prestigeBtn").onclick = doPrestige;
  $("saveBtn").onclick = () => save(false);
  $("resetBtn").onclick = resetGame;
  $("offlineClose").onclick = () => $("offlineModal").classList.remove("show");

  // 3초마다 자동 저장 + 프레스티지 탭 갱신
  setInterval(() => { save(true); renderPrestige(); }, 3000);
  // 종료 시 저장
  window.addEventListener("beforeunload", () => save(true));

  lastFrame = Date.now();
  requestAnimationFrame(loop);
}
init();
