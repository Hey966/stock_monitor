(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const price = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2).replace(/\.00$/, '') : '-';
  let lastRun = 0;

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch failed');
    return r.json();
  }

  function avg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }
  function calcVwap(bars) { let pv = 0, vol = 0; bars.forEach((b) => { const v = num(b.volume); pv += ((num(b.high) + num(b.low) + num(b.close)) / 3) * v; vol += v; }); return vol ? pv / vol : null; }
  function tickUnit(p) { if (p < 10) return 0.01; if (p < 50) return 0.05; if (p < 100) return 0.1; if (p < 500) return 0.5; if (p < 1000) return 1; return 5; }
  function roundTick(v, dir = 0) { const t = tickUnit(v); if (dir > 0) return Math.ceil(v / t) * t; if (dir < 0) return Math.floor(v / t) * t; return Math.round(v / t) * t; }
  function zoneText(a, b) { const x = Math.min(a, b), y = Math.max(a, b); return `${price(x)}~${price(y)}`; }
  function isGoldenTime() { const d = new Date(); const m = d.getHours() * 60 + d.getMinutes(); return m >= 540 && m <= 630; }

  function analyzeKline(quote, bars) {
    const list = bars.slice(-45);
    const last = list[list.length - 1] || {};
    const prev = list[list.length - 2] || {};
    const close = num(quote.close) || num(last.close);
    const open = num(quote.open) || num(list[0]?.open) || close;
    const mid = num(quote.average_price) || calcVwap(list) || close;
    const lows = list.slice(-24).map((b) => num(b.low)).filter(Boolean);
    const highs = list.slice(-24).map((b) => num(b.high)).filter(Boolean);
    const support = Math.min(...lows);
    const pressure = Math.max(...highs);
    const volAvg = avg(list.slice(-16, -1).map((b) => num(b.volume)));
    const volNow = num(last.volume) || num(quote.volume);
    const strongVol = volAvg > 0 && volNow > volAvg * 1.6;
    const body = Math.abs(num(last.close) - num(last.open)) || 0.01;
    const range = Math.max(num(last.high) - num(last.low), tickUnit(close));
    const upper = num(last.high) - Math.max(num(last.open), num(last.close));
    const lower = Math.min(num(last.open), num(last.close)) - num(last.low);
    const buyStrong = num(quote.buy_volume) > num(quote.sell_volume) * 1.15;
    const sellStrong = num(quote.sell_volume) > num(quote.buy_volume) * 1.15;
    const tick = tickUnit(close);
    const openMove = open ? Math.abs((close - open) / open * 100) : 0;
    const totalVol = num(quote.volume);

    let score = 50;
    const good = [], risk = [], pattern = [];
    const add = (pts, tag) => { score += pts; good.push(tag); };
    const sub = (pts, tag) => { score -= pts; risk.push(tag); };

    if (openMove >= 5) sub(35, '開盤後漲跌已超過5%，空間不足');
    if (totalVol && totalVol < 1000) sub(18, '成交量未達1000張，流動性不足');
    if (isGoldenTime()) add(6, '位於9:00~10:30黃金時段'); else sub(5, '非黃金時段，降低出手分數');
    if (close >= mid) add(14, '站上均價/VWAP'); else sub(18, '跌破均價/VWAP');
    if (buyStrong) add(10, '五檔買盤較強');
    if (sellStrong) sub(12, '五檔賣壓較重');
    if (support && num(last.low) <= Math.max(mid, support) * 1.004 && close > Math.max(mid, support)) { add(18, '回測不破'); pattern.push('回測不破'); }
    if (num(last.close) > num(prev.high) && num(last.close) >= num(last.open)) { add(12, '紅K突破前高'); pattern.push('多方續攻'); }
    if (strongVol && num(quote.change_rate) > 0.3 && upper / body < 1.35) { add(12, '放量突破'); pattern.push('爆量突破'); }
    if (lower > body * 1.15 && close >= mid) { add(8, '下影承接'); pattern.push('承接轉強'); }
    if (strongVol && num(quote.change_rate) <= 0.3) { sub(18, '爆量不漲'); pattern.push('爆量不漲'); }
    if (upper > body * 1.35 && upper / range > 0.35 && close >= (pressure || close) * 0.995) { sub(24, '長上影靠近壓力'); pattern.push('假突破'); }
    if (num(last.close) < num(prev.low)) { sub(18, '黑K跌破前低'); pattern.push('轉弱K'); }

    score = Math.max(0, Math.min(100, Math.round(score)));
    let regime = '震盪盤';
    if (score >= 75 && close >= mid) regime = '多方盤';
    if (score < 55 || close < mid) regime = '弱勢盤';
    if (risk.includes('爆量不漲') || risk.includes('長上影靠近壓力')) regime = '陷阱盤';

    const status = score >= 85 ? '高勝率觀察' : score >= 75 ? '達出手門檻' : score >= 65 ? '等回測確認' : score >= 55 ? '只觀察不出手' : '不符合規則';
    const base = Math.max(mid, support || mid);
    const buffer = Math.max(tick * 2, close * 0.0015, range * 0.12);
    const entryLow = roundTick(base + tick, 1);
    const entryHigh = roundTick(base + buffer, 1);
    const stopBuffer = Math.max(tick * 2, close * 0.002, range * 0.18);
    const kLowStop = roundTick(num(last.low) - stopBuffer, -1);
    const supportStop = roundTick((support || base) - stopBuffer, -1);
    const riskLine = Math.min(kLowStop, supportStop);
    let firstTarget = roundTick(Math.max(pressure || 0, entryHigh * 1.02), 1);
    if (firstTarget <= entryHigh) firstTarget = roundTick(entryHigh + Math.max(entryHigh - riskLine, close * 0.006) * 1.5, 1);
    const rr = (firstTarget - entryHigh) / Math.max(entryHigh - riskLine, tick);
    const secondTarget = roundTick(firstTarget + Math.max(firstTarget - riskLine, close * 0.008) * 0.65, 1);
    const holdRate = score >= 85 && rr >= 1.8 ? 70 : score >= 75 && rr >= 1.4 ? 55 : score >= 65 ? 25 : 0;
    const action = score >= 85 && rr >= 1.8 ? `${holdRate}% 可保留到第二賣點，其餘第一賣點先落袋` : score >= 75 && rr >= 1.4 ? `${holdRate}% 嘗試留第二賣點，第一賣點先減碼` : score >= 65 ? '未達75分，只等待回測確認，不主動出手' : '規則未達標，等待下一個高勝率位置';
    return { score, status, regime, entryLow, entryHigh, riskLine, firstTarget, secondTarget, rr, holdRate, action, good, risk, pattern };
  }

  function row(label, value, note, type = '') { return `<div class="decision-row ${type}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
  function decisionHTML(d) {
    return `<div class="decision-list expert">
      ${row('市場狀態', d.regime, '依價、量、五檔與K線型態判斷', d.regime === '多方盤' ? 'good' : d.regime === '陷阱盤' || d.regime === '弱勢盤' ? 'bad' : '')}
      ${row('規則判斷', d.status, `分數 ${d.score}/100｜75分才達股票當沖出手門檻`, d.score >= 75 ? 'good' : d.score < 55 ? 'bad' : '')}
      ${row('進場區間', zoneText(d.entryLow, d.entryHigh), '支撐/VWAP上方等回測不破，不追第一根急拉')}
      ${row('停損位置', price(d.riskLine), '取5分K低點與支撐下方，跌破假設失敗', 'bad')}
      ${row('第一賣點', price(d.firstTarget), `以2%目標/壓力區估算｜風報比 ${Number.isFinite(d.rr) ? d.rr.toFixed(2) : '-'}`)}
      ${row('第二賣點', price(d.secondTarget), '需量價續強才看，不強就不等')}
      ${row('推薦處置', d.action, `保留比例參考 ${d.holdRate}%`)}
      ${row('命中規則', d.good[0] || d.pattern[0] || '等待明確型態', '固定位置、轉折訊號、成交量配合')}
      ${row('風險規則', d.risk[0] || '暫無明顯風險', '爆量不漲、長上影、跌破均價、量不足都要保守', d.risk.length ? 'bad' : '')}
    </div>`;
  }

  function renderDecision(d) {
    const html = decisionHTML(d);
    if ($('#proSignal')) $('#proSignal').innerHTML = html;
    if ($('#analysisSummary')) $('#analysisSummary').innerHTML = html;
    if ($('#analysisTags')) $('#analysisTags').innerHTML = (d.good.length ? d.good : ['等待回測']).map((x) => `<span>${x}</span>`).join('');
    if ($('#riskTags')) $('#riskTags').innerHTML = (d.risk.length ? d.risk : ['暫無明顯風險']).map((x) => `<span>${x}</span>`).join('');
    if ($('.modern-alerts')) $('.modern-alerts').innerHTML = `<b>⚡ 規則判斷</b><span>${d.regime}</span><span>${d.status}</span><span>停損 ${price(d.riskLine)}</span><span>第一 ${price(d.firstTarget)}</span>`;
    const rows = [['門檻', d.score >= 75 ? '達標' : '未達', `分數 ${d.score}/100`], ['停損', price(d.riskLine), '跌破失敗'], ['第一賣點', price(d.firstTarget), `RR ${Number.isFinite(d.rr) ? d.rr.toFixed(2) : '-'}`], ['第二賣點', price(d.secondTarget), `${d.holdRate}% 觀察保留`]];
    $$('.modern-cards article').forEach((card, i) => { if (!card || !rows[i]) return; card.querySelector('span').textContent = rows[i][0]; card.querySelector('strong').textContent = rows[i][1]; card.querySelector('p').textContent = rows[i][2]; });
    [['aiEntry', zoneText(d.entryLow, d.entryHigh)], ['aiStop', price(d.riskLine)], ['aiTarget', price(d.firstTarget)], ['planEntry', zoneText(d.entryLow, d.entryHigh)], ['planStop', price(d.riskLine)], ['planTarget', price(d.firstTarget)]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
    [['aiEntryText', `規則判斷：${d.regime}｜${d.status}`], ['aiStopText', `停損位置：${price(d.riskLine)}`], ['aiTargetText', `第一：${price(d.firstTarget)}｜第二：${price(d.secondTarget)}`], ['planEntryText', `進場區間：${zoneText(d.entryLow, d.entryHigh)}`], ['planStopText', `停損位置：${price(d.riskLine)}`], ['planTargetText', `推薦處置：${d.action}`]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
  }

  async function update(code) {
    const [quote, kbars] = await Promise.all([getJSON(`${API}/api/quote?code=${code}`), getJSON(`${API}/api/kbars?code=${code}&days=5`)]);
    renderDecision(analyzeKline(quote, kbars.items || []));
  }

  setInterval(() => {
    const code = ($('#stockCodeLabel')?.textContent || '').match(/\d{4,6}/)?.[0];
    if (!code) return;
    const now = Date.now();
    if (now - lastRun < 3000) return;
    lastRun = now;
    update(code).catch(() => {});
  }, 1000);
})();
