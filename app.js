const state = {
  trend: "up",
  volume: "breakout",
  position: "pullback",
  risk: "medium",
};

const labels = {
  up: "趨勢偏多：優先找回檔買點。",
  side: "橫盤整理：先等突破或跌破。",
  down: "趨勢偏空：新手不建議亂接。",
  breakout: "放量突破：有資金進場跡象。",
  normal: "成交量普通：訊號沒有特別強。",
  low: "量縮：回檔時是好事，突破時則偏弱。",
  highNoUp: "爆量不漲：小心主力倒貨或高檔換手。",
  pullback: "位置偏好：強勢股回測不破，是較適合新手的買點。",
  support: "接近支撐：要確認有守住，不是跌破。",
  chase: "位置偏高：避免追高，容易買在情緒高點。",
  lowRisk: "風險偏低：但仍要遵守停損。",
  mediumRisk: "風險中等：適合先小部位觀察。",
  highRisk: "風險偏高：降低部位或先不要進場。",
};

function calculateScore() {
  let score = 0;
  const notes = [];

  if (state.trend === "up") score += 2;
  if (state.trend === "side") score += 0;
  if (state.trend === "down") score -= 2;
  notes.push(labels[state.trend]);

  if (state.volume === "breakout") score += 2;
  if (state.volume === "normal") score += 0;
  if (state.volume === "low") score += state.position === "pullback" ? 1 : -1;
  if (state.volume === "highNoUp") score -= 2;
  notes.push(labels[state.volume]);

  if (state.position === "pullback") score += 2;
  if (state.position === "support") score += 1;
  if (state.position === "chase") score -= 2;
  notes.push(labels[state.position]);

  if (state.risk === "low") {
    score += 1;
    notes.push(labels.lowRisk);
  }
  if (state.risk === "medium") {
    notes.push(labels.mediumRisk);
  }
  if (state.risk === "high") {
    score -= 1;
    notes.push(labels.highRisk);
  }

  return { score, notes };
}

function updateAnalysis() {
  const stockName = document.querySelector("#stockName").value || "這檔股票";
  const { score, notes } = calculateScore();
  const title = document.querySelector("#resultTitle");
  const badge = document.querySelector("#resultBadge");
  const action = document.querySelector("#resultAction");
  const notesBox = document.querySelector("#notes");

  title.textContent = `${stockName} 分析結果`;

  badge.className = "badge watch";
  badge.textContent = "觀察";
  action.textContent = "先不要急著進場，等訊號更明確。";

  if (score >= 4) {
    badge.className = "badge good";
    badge.textContent = "可觀察進場";
    action.textContent = "可規劃小部位，停損一定要先設好。";
  }

  if (score <= -2) {
    badge.className = "badge bad";
    badge.textContent = "不建議進場";
    action.textContent = "風險偏高，先避開或等回測重新站穩。";
  }

  notesBox.innerHTML = notes.map((note) => `<div class="note">${note}</div>`).join("");
  updatePlan();
}

function updatePlan() {
  const entry = Number(document.querySelector("#entryPrice").value);
  const support = Number(document.querySelector("#supportPrice").value);
  const pressure = Number(document.querySelector("#pressurePrice").value);

  document.querySelector("#stopLogic").textContent = `跌破 ${support || "支撐"}，代表看錯就退`;

  const lossPct = entry && support ? (((entry - support) / entry) * 100).toFixed(2) : "-";
  const profitPct = entry && pressure ? (((pressure - entry) / entry) * 100).toFixed(2) : "-";

  document.querySelector("#lossPct").textContent = `${lossPct}%`;
  document.querySelector("#profitPct").textContent = `${profitPct}%`;
}

document.querySelectorAll(".button-group").forEach((group) => {
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

updateAnalysis();
