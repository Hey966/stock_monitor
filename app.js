const BACKEND_URL = "https://stock-monitor-b6d6.onrender.com";

const pageTitles = {
  dashboard: "總覽",
  quote: "即時報價",
  watchlist: "自選股",
  analysis: "分析工具",
  plan: "交易計畫",
  learn: "學習筆記",
};

const state = {
  currentQuote: null,
  mode: "basic",
  trend: "up",
  volume: "normal",
  position: "support",
  candle: "normalCandle",
  ma: "maMixed",
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

function switchPage(page) {
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.querySelector(`#page-${page}`)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));
  const title = document.querySelector("#pageTitle");
  if (title) title.textContent = pageTitles[page] || "總覽";
  window.scrollTo(0, 0);
}

function setActiveChoice(field, value) {
  state[field] = value;
  document.querySelectorAll(`[data-field="${field}"] button`).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function syncStateFromQuote(data) {
  const changeRate = Number(data.change_rate || 0);
  const volumeRatio = Number(data.volume_ratio || 0);
  const close = Number(data.close || 0);
  const open = Number(data.open || 0);
  const high = Number(data.high || 0);
  const low = Number(data.low || 0);

  if (changeRate > 1) setActiveChoice("trend", "up");
  else if (changeRate < -1) setActiveChoice("trend", "down");
  else setActiveChoice("trend", "side");

  if (volumeRatio >= 1.5 && changeRate > 0) setActiveChoice("volume", "breakout");
  else if (volumeRatio >= 1.5 && changeRate <= 0.5) setActiveChoice("volume", "highNoUp");
  else if (volumeRatio < 0.8) setActiveChoice("volume", "low");
  else setActiveChoice("volume", "normal");

  if (changeRate >= 3) setActiveChoice("position", "chase");
  else if (close && low && close <= low * 1.01) setActiveChoice("position", "support");
  else if (close && high && close < high * 0.995 && changeRate > 0) setActiveChoice("position", "breakoutFail");
  else setActiveChoice("position", "pullback");

  if (close < open && Math.abs(changeRate) > 1.5) setActiveChoice("candle", "longBlack");
  else if (high && close && high > close * 1.01) setActiveChoice("candle", "upperShadow");
  else if (close > open && changeRate > 1) setActiveChoice("candle", "longRed");
  else setActiveChoice("candle", "normalCandle");
}

function calculateScore() {
  let score = 0;
  const notes = [];
  if (!state.currentQuote) notes.push("尚未查詢股票：請先輸入股票代號，所有功能才會依照同一檔股票更新。");
  if (state.currentQuote) notes.push(`目前分析標的：${state.currentQuote.code} ${state.currentQuote.name || ""}，現價 ${state.currentQuote.close ?? "-"}，漲跌幅 ${state.currentQuote.change_rate ?? "-"}%。`);

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
  return { score, notes };
}

function updateTitles() {
  const q = state.currentQuote;
  const name = q ? `${q.code} ${q.name || ""}` : "請先查詢一檔股票";
  const currentStockTitle = document.querySelector("#currentStockTitle");
  const currentStockDesc = document.querySelector("#currentStockDesc");
  const analysisTitle = document.querySelector("#analysisTitle");
  const planTitle = document.querySelector("#planTitle");
  if (currentStockTitle) currentStockTitle.textContent = q ? `${name} 總覽` : name;
  if (currentStockDesc) currentStockDesc.textContent = q ? `現價 ${q.close ?? "-"}，漲跌 ${q.change_price ?? "-"}，量比 ${q.volume_ratio ?? "-"}。` : "查詢後，總覽、報價、分析、交易計畫都會依照同一檔股票更新。";
  if (analysisTitle) analysisTitle.textContent = q ? `${name} 分析工具` : "分析工具";
  if (planTitle) planTitle.textContent = q ? `${name} 交易計畫` : "交易計畫";
}

function updateAnalysis() {
  const { score, notes } = calculateScore();
  const badge = document.querySelector("#resultBadge");
  const action = document.querySelector("#resultAction");
  if (badge && action) {
    badge.className = "badge watch";
    badge.textContent = state.currentQuote ? "🟡 等待觀察" : "🟡 等待查詢";
    action.textContent = state.currentQuote ? "先不要急著進場，等訊號更明確。" : "請先輸入股票代號並查詢。";
    if (state.currentQuote && score >= 5) { badge.className = "badge good"; badge.textContent = "🟢 可觀察進場"; action.textContent = "可規劃小部位，停損一定要先設好。"; }
    if (state.currentQuote && score <= -2) { badge.className = "badge bad"; badge.textContent = "🔴 不建議進場"; action.textContent = "風險偏高，先避開或等回測重新站穩。"; }
  }
  const notesBox = document.querySelector("#notes");
  if (notesBox) notesBox.innerHTML = notes.map((note) => `<div class="note">${note}</div>`).join("");
  updateIndicatorNotes();
  updateWarnings();
  updateMode();
  updateTitles();
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
  if (!state.currentQuote) warnings.push(["尚未查詢", "先查詢股票後，這裡會依照該股票報價產生提醒。"]);
  if (state.volume === "highNoUp") warnings.push(["爆量不漲", "可能是高檔換手或主力倒貨，短線不追。"]);
  if (state.position === "breakoutFail") warnings.push(["假突破風險", "突破後站不穩，容易套住追價買盤。"]);
  if (state.candle === "upperShadow") warnings.push(["長上影線", "上方賣壓重，先等回測確認。"]);
  if (state.candle === "longBlack") warnings.push(["高檔長黑", "賣壓明顯，優先保護本金。"]);
  if (!warnings.length) warnings.push(["目前無重大警訊", "仍要確認支撐、停損與風險報酬比。"]);
  box.innerHTML = warnings.map(([title, text]) => `<div class="warning-item"><strong>${title}</strong><p>${text}</p></div>`).join("");
}

function updateMode() {
  document.querySelectorAll(".advanced-zone").forEach((zone) => { zone.style.display = state.mode === "advanced" ? "block" : "none"; });
}

function updatePlan(autoFill = false) {
  const q = state.currentQuote;
  if (autoFill && q?.close) {
    const close = Number(q.close);
    document.querySelector("#entryPrice").value = close;
    document.querySelector("#supportPrice").value = Math.round(close * 0.985 * 100) / 100;
    document.querySelector("#pressurePrice").value = Math.round(close * 1.02 * 100) / 100;
  }
  const entry = Number(document.querySelector("#entryPrice")?.value);
  const support = Number(document.querySelector("#supportPrice")?.value);
  const pressure = Number(document.querySelector("#pressurePrice")?.value);
  const stopLogic = document.querySelector("#stopLogic");
  const lossPctEl = document.querySelector("#lossPct");
  const profitPctEl = document.querySelector("#profitPct");
  if (!stopLogic || !lossPctEl || !profitPctEl) return;
  stopLogic.textContent = entry && support ? `跌破 ${support}，代表 ${q?.code || "這檔股票"} 看錯就退` : "請先查詢股票";
  lossPctEl.textContent = entry && support ? `${(((entry - support) / entry) * 100).toFixed(2)}%` : "-";
  profitPctEl.textContent = entry && pressure ? `${(((pressure - entry) / entry) * 100).toFixed(2)}%` : "-";
}

function renderQuote(data) {
  const changeRate = typeof data.change_rate === "number" ? data.change_rate.toFixed(2) : "-";
  const changePrice = typeof data.change_price === "number" ? data.change_price.toFixed(2) : "-";
  return `<div class="quote-grid"><div><p>股票</p><strong>${data.code} ${data.name || ""}</strong></div><div><p>現價</p><strong>${data.close ?? "-"}</strong></div><div><p>漲跌</p><strong>${changePrice}</strong></div><div><p>漲跌幅</p><strong>${changeRate}%</strong></div><div><p>最高</p><strong>${data.high ?? "-"}</strong></div><div><p>最低</p><strong>${data.low ?? "-"}</strong></div><div><p>量比</p><strong>${data.volume_ratio ?? "-"}</strong></div><div><p>成交量</p><strong>${data.volume ?? "-"}</strong></div><div><p>買價 / 買量</p><strong>${data.buy_price ?? "-"} / ${data.buy_volume ?? "-"}</strong></div><div><p>賣價 / 賣量</p><strong>${data.sell_price ?? "-"} / ${data.sell_volume ?? "-"}</strong></div><div><p>均價</p><strong>${data.average_price ?? "-"}</strong></div></div>`;
}

async function fetchQuote() {
  const input = document.querySelector("#stockName");
  const quoteBox = document.querySelector("#quoteResult");
  const quoteSummary = document.querySelector("#quoteSummary");
  const codeMatch = input?.value.match(/\d{4,6}/);
  if (!codeMatch) {
    alert("請先輸入股票代號，例如 2330");
    return;
  }
  const code = codeMatch[0];
  const loading = `<div class="quote-loading">查詢 ${code} 報價中…</div>`;
  if (quoteBox) quoteBox.innerHTML = loading;
  if (quoteSummary) quoteSummary.innerHTML = loading;
  try {
    const response = await fetch(`${BACKEND_URL}/api/quote?code=${code}`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    state.currentQuote = data;
    syncStateFromQuote(data);
    const html = renderQuote(data);
    if (quoteBox) quoteBox.innerHTML = html;
    if (quoteSummary) quoteSummary.innerHTML = html;
    updatePlan(true);
    updateAnalysis();
  } catch (error) {
    const msg = `<div class="quote-error">報價查詢失敗：${error.message}</div>`;
    if (quoteBox) quoteBox.innerHTML = msg;
    if (quoteSummary) quoteSummary.innerHTML = msg;
  }
}

document.querySelectorAll(".nav-item[data-page]").forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.page)));
document.querySelectorAll(".button-group, .mode-switch").forEach((group) => group.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  group.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
  state[group.dataset.field] = button.dataset.value;
  updateAnalysis();
}));
document.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => updatePlan(false)));
document.querySelector("#fetchQuoteBtn")?.addEventListener("click", fetchQuote);
document.querySelector("#refreshAppBtn")?.addEventListener("click", () => location.href = `${location.pathname}?v=${Date.now()}`);

updateAnalysis();
