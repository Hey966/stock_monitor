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

  function analyzeKline(quote, bars) {
    const list = bars.slice(-45);
    const last = list[list.length - 1] || {};
    const prev = list[list.length - 2] || {};
    const close = num(quote.close) || num(last.close);
    const mid = num(quote.average_price) || calcVwap(list) || close;
    const lows = list.slice(-24).map((b) => num(b.low)).filter(Boolean);
    const highs = list.slice(-24).map((b) => num(b.high)).filter(Boolean);
    const support = Math.min(...lows);
    const pressure = Math.max(...highs);
    const volAvg = avg(list.slice(-16, -1).map((b) => num(b.volume)));
    const volNow = num(last.volume) || num(quote.volume);
    const strongVol = volAvg > 0 && volNow > volAvg * 1.6;
    const body = Math.abs(num(last.close) - num(last.open)) || 0.01;
    const range = Math.max(num(last.high) - num(last.low), 0.01);
    const upper = num(last.high) - Math.max(num(last.open), num(last.close));
    const lower = Math.min(num(last.open), num(last.close)) - num(last.low);
    const buyStrong = num(quote.buy_volume) > num(quote.sell_volume) * 1.15;
    const sellStrong = num(quote.sell_volume) > num(quote.buy_volume) * 1.15;

    let score = 50;
    const good = [], risk = [], pattern = [];
    const add = (pts, tag, arr = good) => { score += pts; arr.push(tag); };
    const sub = (pts, tag) => { score -= pts; risk.push(tag); };

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
    if (score >= 78 && close >= mid) regime = '多方盤';
    if (score < 50 || close < mid) regime = '弱勢盤';
    if (risk.includes('爆量不漲') || risk.includes('長上影靠近壓力')) regime = '陷阱盤';

    const status = score >= 90 ? '強勢可觀察' : score >= 78 ? '可觀察' : score >= 65 ? '等回測' : score >= 50 ? '先觀察' : '危險，別碰';
    const observe = Math.max(mid, support || mid);
    const riskLine = support || close * 0.985;
    let firstTarget = pressure || close * 1.015;
    if (firstTarget <= observe) firstTarget = observe + Math.max(observe - riskLine, close * 0.006) * 1.5;
    const rr = (firstTarget - observe) / Math.max(observe - riskLine, close * 0.003);
    const secondTarget = firstTarget + Math.max(firstTarget - riskLine, close * 0.008) * 0.65;
    const holdRate = score >= 85 && rr >= 1.8 ? 70 : score >= 75 && rr >= 1.4 ? 55 : score >= 65 ? 35 : score >= 50 ? 20 : 0;
    const action = score >= 85 && rr >= 1.8 ? `${holdRate}% 可保留到第二賣點，其餘第一賣點先落袋` : score >= 70 ? `${holdRate}% 可嘗試留到第二賣點，第一賣點先減碼` : score >= 55 ? `只短看第一賣點，保留比例約 ${holdRate}%` : '等待下一個回測不破訊號';
    return { score, status, regime, observe, riskLine, firstTarget, secondTarget, rr, holdRate, action, good, risk, pattern };
  }

  function row(label, value, note, type = '') {
    return `<div class="decision-row ${type}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  }

  function decisionHTML(d) {
    return `<div class="decision-list expert">
      ${row('市場狀態', d.regime, `依價量、VWAP、五檔與K線型態判斷`, d.regime === '多方盤' ? 'good' : d.regime === '陷阱盤' || d.regime === '弱勢盤' ? 'bad' : '')}
      ${row('K線判斷', d.status, `分數 ${d.score}/100｜${d.pattern.join(' / ') || '等待型態'}`, d.score >= 78 ? 'good' : d.score < 50 ? 'bad' : '')}
      ${row('進場條件', price(d.observe), '只看回測不破，不追第一根急拉')}
      ${row('停損位置', price(d.riskLine), '跌破代表短線假設失敗，當沖不凹單', 'bad')}
      ${row('第一賣點', price(d.firstTarget), `風報比 ${Number.isFinite(d.rr) ? d.rr.toFixed(2) : '-'}`)}
      ${row('第二賣點', price(d.secondTarget), '需量價續強才看，不強就不等')}
      ${row('推薦處置', d.action, `保留比例參考 ${d.holdRate}%`)}
      ${row('主力/量價', d.good[0] || d.pattern[0] || '等待明確型態', '規則來源：K線教材邏輯')}
      ${row('危險訊號', d.risk[0] || '暫無明顯風險', '爆量不漲、長上影、跌破均價都要保守', d.risk.length ? 'bad' : '')}
    </div>`;
  }

  function renderDecision(d) {
    const html = decisionHTML(d);
    if ($('#proSignal')) $('#proSignal').innerHTML = html;
    if ($('#analysisSummary')) $('#analysisSummary').innerHTML = html;
    if ($('#analysisTags')) $('#analysisTags').innerHTML = (d.good.length ? d.good : ['等待回測']).map((x) => `<span>${x}</span>`).join('');
    if ($('#riskTags')) $('#riskTags').innerHTML = (d.risk.length ? d.risk : ['暫無明顯風險']).map((x) => `<span>${x}</span>`).join('');
    if ($('.modern-alerts')) $('.modern-alerts').innerHTML = `<b>⚡ 專家規則</b><span>${d.regime}</span><span>${d.status}</span><span>停損 ${price(d.riskLine)}</span><span>第一 ${price(d.firstTarget)}</span>`;
    const rows = [['盤型', d.regime, `分數 ${d.score}/100`], ['停損', price(d.riskLine), '跌破失敗'], ['第一賣點', price(d.firstTarget), `RR ${Number.isFinite(d.rr) ? d.rr.toFixed(2) : '-'}`], ['第二賣點', price(d.secondTarget), `${d.holdRate}% 觀察保留`]];
    $$('.modern-cards article').forEach((card, i) => { if (!card || !rows[i]) return; card.querySelector('span').textContent = rows[i][0]; card.querySelector('strong').textContent = rows[i][1]; card.querySelector('p').textContent = rows[i][2]; });
    [['aiEntry', price(d.observe)], ['aiStop', price(d.riskLine)], ['aiTarget', price(d.firstTarget)], ['planEntry', price(d.observe)], ['planStop', price(d.riskLine)], ['planTarget', price(d.firstTarget)]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
    [['aiEntryText', `盤型：${d.regime}｜${d.status}`], ['aiStopText', `停損位置：${price(d.riskLine)}`], ['aiTargetText', `第一：${price(d.firstTarget)}｜第二：${price(d.secondTarget)}`], ['planEntryText', `進場條件：回測 ${price(d.observe)} 不破`], ['planStopText', `停損位置：${price(d.riskLine)}`], ['planTargetText', `推薦處置：${d.action}`]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
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
