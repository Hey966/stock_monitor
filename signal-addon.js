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
    const list = bars.slice(-30);
    const last = list[list.length - 1] || {};
    const prev = list[list.length - 2] || {};
    const close = num(quote.close) || num(last.close);
    const mid = num(quote.average_price) || calcVwap(list) || close;
    const lows = list.slice(-20).map((b) => num(b.low)).filter(Boolean);
    const highs = list.slice(-20).map((b) => num(b.high)).filter(Boolean);
    const support = Math.min(...lows);
    const pressure = Math.max(...highs);
    const volAvg = avg(list.slice(-12, -1).map((b) => num(b.volume)));
    const volNow = num(last.volume) || num(quote.volume);
    const strongVol = volAvg > 0 && volNow > volAvg * 1.6;
    const body = Math.abs(num(last.close) - num(last.open)) || 0.01;
    const range = Math.max(num(last.high) - num(last.low), 0.01);
    const upper = num(last.high) - Math.max(num(last.open), num(last.close));
    let score = 50;
    const good = [], risk = [], pattern = [];
    if (close >= mid) { score += 15; good.push('站上均價'); } else { score -= 18; risk.push('跌破均價'); }
    if (num(quote.buy_volume) > num(quote.sell_volume) * 1.15) { score += 10; good.push('買量較強'); }
    if (num(quote.sell_volume) > num(quote.buy_volume) * 1.15) { score -= 12; risk.push('賣壓較重'); }
    if (support && num(last.low) <= Math.max(mid, support) * 1.004 && close > Math.max(mid, support)) { score += 18; good.push('回測不破'); pattern.push('回測不破'); }
    if (num(last.close) > num(prev.high) && num(last.close) >= num(last.open)) { score += 12; good.push('紅K過前高'); pattern.push('多方續攻'); }
    if (strongVol && num(quote.change_rate) > 0.3 && upper / body < 1.35) { score += 10; good.push('放量推進'); pattern.push('放量推進'); }
    if (strongVol && num(quote.change_rate) <= 0.3) { score -= 18; risk.push('量增價不動'); pattern.push('量價背離'); }
    if (upper > body * 1.35 && upper / range > 0.35 && close >= (pressure || close) * 0.995) { score -= 22; risk.push('長上影靠近壓力'); pattern.push('假突破'); }
    if (num(last.close) < num(prev.low)) { score -= 18; risk.push('跌破前低'); pattern.push('轉弱K'); }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const status = score >= 90 ? '趕緊觀察' : score >= 78 ? '可觀察' : score >= 65 ? '等回測' : score >= 50 ? '先觀察' : '危險，別碰';
    const observe = Math.max(mid, support || mid);
    const riskLine = support || close * 0.985;
    let firstTarget = pressure || close * 1.015;
    if (firstTarget <= observe) firstTarget = observe + Math.max(observe - riskLine, close * 0.006) * 1.5;
    const secondTarget = firstTarget + Math.max(firstTarget - riskLine, close * 0.008) * 0.65;
    const holdRate = score >= 85 ? 70 : score >= 75 ? 55 : score >= 65 ? 35 : score >= 50 ? 20 : 0;
    const action = score >= 85 ? `${holdRate}% 可保留到第二賣點，其餘第一賣點先落袋` : score >= 70 ? `${holdRate}% 可嘗試留到第二賣點，第一賣點先減碼` : score >= 55 ? `只適合短看第一賣點，保留比例約 ${holdRate}%` : '不建議進場，等待下一個回測不破訊號';
    return { score, status, observe, riskLine, firstTarget, secondTarget, holdRate, action, good, risk, pattern };
  }

  function lineBlock(d) {
    return [
      `K線判斷：${d.status}（分數 ${d.score}/100）`,
      `觀察線：${price(d.observe)}，重點是回測不破`,
      `止損點：${price(d.riskLine)}，跌破代表短線轉弱`,
      `第一賣點：${price(d.firstTarget)}，靠近壓力先留意`,
      `第二賣點：${price(d.secondTarget)}，需量價續強才看`,
      `推薦處置：${d.action}`,
      `主要原因：${(d.good[0] || d.pattern[0] || '等待明確型態')}`,
      `風險提醒：${(d.risk[0] || '暫無明顯風險')}`
    ].join('\n');
  }

  function renderDecision(d) {
    const summary = lineBlock(d);
    if ($('#proSignal')) $('#proSignal').textContent = summary;
    if ($('#analysisSummary')) $('#analysisSummary').textContent = summary;
    if ($('#analysisTags')) $('#analysisTags').innerHTML = (d.good.length ? d.good : ['等待回測']).map((x) => `<span>${x}</span>`).join('');
    if ($('#riskTags')) $('#riskTags').innerHTML = (d.risk.length ? d.risk : ['暫無明顯風險']).map((x) => `<span>${x}</span>`).join('');
    if ($('.modern-alerts')) $('.modern-alerts').innerHTML = `<b>⚡ K線判斷</b><span>${d.status}</span><span>止損 ${price(d.riskLine)}</span><span>第一 ${price(d.firstTarget)}</span><span>第二 ${price(d.secondTarget)}</span>`;
    const rows = [['K線判斷', d.status, `分數 ${d.score}/100`], ['止損點', price(d.riskLine), '跌破短線轉弱'], ['第一賣點', price(d.firstTarget), '靠近壓力先留意'], ['第二賣點', price(d.secondTarget), `${d.holdRate}% 觀察保留`]];
    $$('.modern-cards article').forEach((card, i) => { if (!card || !rows[i]) return; card.querySelector('span').textContent = rows[i][0]; card.querySelector('strong').textContent = rows[i][1]; card.querySelector('p').textContent = rows[i][2]; });
    [['aiEntry', price(d.observe)], ['aiStop', price(d.riskLine)], ['aiTarget', price(d.firstTarget)], ['planEntry', price(d.observe)], ['planStop', price(d.riskLine)], ['planTarget', price(d.firstTarget)]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
    [['aiEntryText', `K線判斷：${d.status}`], ['aiStopText', `止損點：${price(d.riskLine)}`], ['aiTargetText', `第一賣點：${price(d.firstTarget)}｜第二賣點：${price(d.secondTarget)}`], ['planEntryText', `觀察線：${price(d.observe)}`], ['planStopText', `止損點：${price(d.riskLine)}`], ['planTargetText', `推薦處置：${d.action}`]].forEach(([id, text]) => { const el = $('#' + id); if (el) el.textContent = text; });
  }

  async function update(code) {
    const [quote, kbars] = await Promise.all([getJSON(`${API}/api/quote?code=${code}`), getJSON(`${API}/api/kbars?code=${code}&days=5`)]);
    renderDecision(analyzeKline(quote, kbars.items || []));
  }

  setInterval(() => {
    const code = ($('#stockCodeLabel')?.textContent || '').match(/\d{4,6}/)?.[0];
    if (!code) return;
    const now = Date.now();
    if (now - lastRun < 5000) return;
    lastRun = now;
    update(code).catch(() => {});
  }, 1200);
})();
