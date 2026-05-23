const BACKEND_URL = "https://stock-monitor-b6d6.onrender.com";

const state = {
  mode: "basic",
  trend: "up",
  volume: "breakout",
  position: "pullback",
  candle: "normalCandle",
  ma: "maBull",
  rsi: "rsiMid",
  kd: "kdUp",
  macd: "macdExpand",
};

const labels = {
  up: "趨勢偏多：優先找回檔買點。",
  side: "橫盤整理：先等突破或跌破。",
  down: "趨勢偏空：新手不建議亂接刀。",
  breakout: "放量突破：有資金進場跡象。",
  normal: "成交量普通：訊號沒有特別強。",
  low: "量縮：回檔時是好事，突破時則偏弱。",
  highNoUp: "爆量不漲：小心主力倒貨或高檔換手。",
  pullback: "位置偏好：強勢股回測不破，是較適合新手的買點。",
  support: "接近支撐：要確認有守住，不是跌破。",
  breakoutFail: "突破失敗：追價風險高，容易變假突破。",
  chase: "位置偏高：避免追高，容易買在情緒高點。",
  normalCandle: "K棒普通：目前沒有明顯警訊。",
  longRed: "長紅K：偏強，但若在高檔爆量要小心隔日回檔。",
  upperShadow: "長上影線：上方賣壓重，短線不適合追。",
  longBlack: "高檔長黑：短線轉弱警訊，優先保護本金。",
  maBull: "均線多頭排列：短線偏強。",
  maMixed: "均線糾結：方向不明，容易震盪。",
  maBear: "均線空頭排列：偏弱，新手不要亂接。",
  rsiHot: "RSI 偏熱：代表漲多，適合等回測，不適合追價。",
  rsiMid: "RSI 中性：沒有過熱或過冷。",
  rsiCold: "RSI 偏冷：跌深不等於便宜，要先等止跌。",
  kdUp: "KD 轉強：短線動能變好，但仍要搭配位置。",
  kdDown: "KD 轉弱：短線動能下降，追價要小心。",
  kdHighTurn: "KD 高檔下彎：常見短線回檔或洗盤訊號。",
  kdHighStrong: "KD 高檔鈍化：強勢股可能續漲，但不可無腦追高。",
  macdExpand: "MACD 紅柱放大：上漲動能增強。",
  macdShrink: "MACD 紅柱縮小：上漲力道變弱。",
  macdGreen: "MACD 綠柱放大：短線偏弱。",
};

function calculateScore() {
  let score = 0;
  const notes = [];

  if (state.trend === "up") score += 2;
  if (state.trend === "down") score -= 2;
  notes.push(labels[state.trend]);

  if (state.volume === "breakout") score += 2;
  if (state.volume === "low") score += state.position === "pullback" ? 1 : -1;
  if (state.volume === "highNoUp") score -= 2;
  notes.push(labels[state.volume]);

  if (state.position === "pullback") score += 2;
  if (state.position === "support") score += 1;
  if (state.position === "breakoutFail") score -= 2;
  if (state.position === "chase") score -= 2;
  notes.push(labels[state.position]);

  if (state.candle === "longRed") score += state.position === "chase" ? -1 : 1;
  if (state.candle === "upperShadow") score -= 2;
  if (state.candle === "longBlack") score -= 3;
  notes.push(labels[state.candle]);

  if (state.mode === "advanced") {
    if (state.ma === "maBull") score += 1;
    if (state.ma === "maBear") score -= 1;
    if (state.rsi === "rsiHot") score -= 1;
    if (state.rsi === "rsiCold") score -= 1;
    if (state.kd === "kdUp") score += 1;
    if (state.kd === "kdDown" || state.kd === "kdHighTurn") score -= 1;
    if (state.macd === "macdExpand") score += 1;
    if (state.macd === "macdShrink") score -= 1;
    if (state.macd === "macdGreen") score -= 2;
  }

  return { score, notes };
}

function updateAnalysis() {
  const stockName = document.querySelector("#stockName")?.value || "這檔股票";
  const { score, notes } = calculateScore();
  const title = document.querySelector("#resultTitle");
  const badge = document.querySelector("#resultBadge");
  const action = document.querySelector("#resultAction");
  const notesBox = document.querySelector("#notes");

  if (!title || !badge || !action || !notesBox) return;

  title.textContent = `${stockName} 分析結果`;
  badge.className = "badge watch";
  badge.textContent = "🟡 等待觀察";
  action.textContent = "先不要急著進場，等訊號更明確。";

  if (score >= 5) {
    badge.className = "badge good";
    badge.textContent = "🟢 可觀察進場";
    action.textContent = "可規劃小部位，停損一定要先設好。";
  }

  if (score <= -2) {
    badge.className = "badge bad";
    badge.textContent = "🔴 不建議進場";
    action.textContent = "風險偏高，先避開或等回測重新站穩。";
  }

  notesBox.innerHTML = notes.map((note) => `<div class="note">${note}</div>`).join("");
  updateIndicatorNotes();
  updateWarnings();
  updateMode();
  updatePlan();
}

function updateIndicatorNotes() {
  const box = document.querySelector("#indicatorNotes");
  if (!box) return;
  const notes = [labels[state.ma], labels[state.rsi], labels[state.kd], labels[state.macd]];
  box.innerHTML = notes.map((note) => `<div class="note">${note}</div>`).join("");
}

function updateWarnings() {
  const box = document.querySelector("#warningList");
  if (!box) return;
  const warnings = [];

  if (state.volume === "highNoUp") warnings.push(["爆量不漲", "可能是高檔換手或主力倒貨，短線不追。"]);
  if (state.position === "breakoutFail") warnings.push(["假突破風險", "突破後站不穩，容易套住追價買盤。"]);
  if (state.candle === "upperShadow") warnings.push(["長上影線", "上方賣壓重，先等回測確認。"]);
  if (state.candle === "longBlack") warnings.push(["高檔長黑", "賣壓明顯，優先保護本金。"]);
  if (state.rsi === "rsiHot" && state.position === "chase") warnings.push(["過熱追價", "RSI 偏熱又高檔追價，是新手最容易套牢的位置。"]);
  if (state.macd === "macdShrink") warnings.push(["動能變弱", "MACD 紅柱縮小，代表上漲力道正在降溫。"]);

  if (!warnings.length) warnings.push(["目前無重大警訊", "仍要確認支撐、停損與風險報酬比。"]);

  box.innerHTML = warnings.map(([title, text]) => `<div class="warning-item"><strong>${title}</strong><p>${text}</p></div>`).join("");
}

function updateMode() {
  const zones = document.querySelectorAll(".advanced-zone");
  zones.forEach((zone) => {
    zone.style.display = state.mode === "advanced" ? "block" : "none";
  });
}

function updatePlan() {
  const entry = Number(document.querySelector("#entryPrice")?.value);
  const support = Number(document.querySelector("#supportPrice")?.value);
  const pressure = Number(document.querySelector("#pressurePrice")?.value);

  const stopLogic = document.querySelector("#stopLogic");
  const lossPctEl = document.querySelector("#lossPct");
  const profitPctEl = document.querySelector("#profitPct");
  if (!stopLogic || !lossPctEl || !profitPctEl) return;

  stopLogic.textContent = `跌破 ${support || "支撐"}，代表看錯就退`;
  const lossPct = entry && support ? (((entry - support) / entry) * 100).toFixed(2) : "-";
  const profitPct = entry && pressure ? (((pressure - entry) / entry) * 100).toFixed(2) : "-";
  lossPctEl.textContent = `${lossPct}%`;
  profitPctEl.textContent = `${profitPct}%`;
}

async function fetchQuote() {
  const input = document.querySelector("#stockName");
  const quoteBox = document.querySelector("#quoteResult");
  if (!input || !quoteBox) return;

  const codeMatch = input.value.match(/\d{4,6}/);
  if (!codeMatch) {
    quoteBox.innerHTML = `<div class="quote-error">請先輸入股票代號，例如 2330。</div>`;
    return;
  }

  const code = codeMatch[0];
  quoteBox.innerHTML = `<div class="quote-loading">查詢 ${code} 報價中… Render 免費版第一次可能要等 50 秒。</div>`;

  try {
    const response = await fetch(`${BACKEND_URL}/api/quote?code=${code}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }
    const data = await response.json();
    const changeRate = typeof data.change_rate === "number" ? data.change_rate.toFixed(2) : "-";
    const changePrice = typeof data.change_price === "number" ? data.change_price.toFixed(2) : "-";
    quoteBox.innerHTML = `
      <div class="quote-grid">
        <div><p>股票</p><strong>${data.code} ${data.name || ""}</strong></div>
        <div><p>現價</p><strong>${data.close ?? "-"}</strong></div>
        <div><p>漲跌</p><strong>${changePrice}</strong></div>
        <div><p>漲跌幅</p><strong>${changeRate}%</strong></div>
        <div><p>最高</p><strong>${data.high ?? "-"}</strong></div>
        <div><p>最低</p><strong>${data.low ?? "-"}</strong></div>
        <div><p>成交量</p><strong>${data.volume ?? "-"}</strong></div>
      </div>`;
  } catch (error) {
    quoteBox.innerHTML = `<div class="quote-error">報價查詢失敗：${error.message}</div>`;
  }
}

document.querySelectorAll(".button-group, .mode-switch").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    group.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    state[group.dataset.field] = button.dataset.value;
    updateAnalysis();
  });
});

document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", updateAnalysis);
});

document.querySelector("#fetchQuoteBtn")?.addEventListener("click", fetchQuote);

updateAnalysis();
