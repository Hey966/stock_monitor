(() => {
  const BACKEND = window.BACKEND_URL || 'https://stock-monitor-b6d6.onrender.com';
  const DEFAULT_CODES = ['2330', '2317', '2454', '6215', '3017', '3324'];
  let radarTimer = null;

  function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function fmt(v, d = 2) { const x = Number(v); if (!Number.isFinite(x)) return '-'; return Number.isInteger(x) ? String(x) : x.toFixed(d); }

  function scoreQuote(q) {
    let score = 50;
    const tags = [];
    const warnings = [];
    const change = n(q.change_rate);
    const volRatio = n(q.volume_ratio);
    const close = n(q.close);
    const open = n(q.open);
    const high = n(q.high);
    const low = n(q.low);
    const avg = n(q.average_price);

    if (change > 0) { score += Math.min(change * 6, 18); tags.push('上漲動能'); }
    if (change < 0) { score += Math.max(change * 6, -18); warnings.push('短線轉弱'); }
    if (volRatio >= 1.5 && change > 0) { score += 16; tags.push('量增攻擊'); }
    if (volRatio >= 1.5 && change <= 0.3) { score -= 16; warnings.push('爆量不漲'); }
    if (avg && close > avg) { score += 10; tags.push('站上均價'); }
    if (avg && close < avg) { score -= 10; warnings.push('跌破均價'); }
    if (open && close > open) { score += 8; tags.push('站上開盤'); }
    if (open && close < open) { score -= 8; warnings.push('跌破開盤'); }
    if (high && close >= high * 0.995 && change > 0) { score += 8; tags.push('貼近高點'); }
    if (high && close < high * 0.985 && change > 1) { score -= 8; warnings.push('沖高拉回'); }
    if (low && close <= low * 1.01) { score -= 5; warnings.push('靠近低點'); }
    if (change >= 3) { score -= 8; warnings.push('追價風險'); }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const mood = score >= 80 ? '強勢偏多' : score >= 65 ? '偏多觀察' : score >= 45 ? '中性等待' : '風險偏高';
    const action = score >= 80 ? '等回測不破再進' : score >= 65 ? '可觀察突破或回測' : score >= 45 ? '先等方向明確' : '避免追價';
    return { score, tags, warnings, mood, action, bull: score, bear: 100 - score };
  }

  async function fetchQuote(code) {
    const res = await fetch(`${BACKEND}/api/quote?code=${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function radarCard(item, rank) {
    const q = item.quote;
    const s = item.signal;
    const up = n(q.change_rate) >= 0;
    const tags = s.tags.slice(0, 3).map(t => `<span>${t}</span>`).join('');
    const warnings = s.warnings.slice(0, 2).map(t => `<em>⚠ ${t}</em>`).join('');
    return `<article class="radar-card ${s.score >= 80 ? 'hot' : s.score < 45 ? 'cold' : ''}" data-code="${q.code}">
      <div class="radar-rank">#${rank}</div>
      <div class="radar-main">
        <div><strong>${q.code} ${q.name || ''}</strong><p>${s.mood}｜${s.action}</p></div>
        <div class="radar-score">${s.score}</div>
      </div>
      <div class="radar-price"><span>${q.close ?? '-'}</span><b class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmt(q.change_rate)}%</b></div>
      <div class="power-row"><span>多</span><div><i style="width:${s.bull}%"></i></div><span>${s.bull}</span></div>
      <div class="power-row bear"><span>空</span><div><i style="width:${s.bear}%"></i></div><span>${s.bear}</span></div>
      <div class="radar-tags">${tags || '<span>等待訊號</span>'}</div>
      <div class="radar-warnings">${warnings}</div>
    </article>`;
  }

  function setStatus(text) {
    const el = document.querySelector('#radarStatus');
    if (el) el.textContent = text;
  }

  function getCodes() {
    const raw = localStorage.getItem('stx_radar_codes');
    if (!raw) return DEFAULT_CODES;
    try { return JSON.parse(raw).filter(Boolean).slice(0, 12); } catch { return DEFAULT_CODES; }
  }

  function saveCodes(codes) {
    localStorage.setItem('stx_radar_codes', JSON.stringify([...new Set(codes)].slice(0, 12)));
  }

  async function runRadar() {
    const list = document.querySelector('#radarList');
    if (!list) return;
    const codes = getCodes();
    setStatus('掃描中...');
    list.innerHTML = '<div class="quote-loading">AI 雷達掃描中…</div>';
    const results = [];
    for (const code of codes) {
      try {
        const quote = await fetchQuote(code);
        results.push({ quote, signal: scoreQuote(quote) });
      } catch (err) {
        results.push({ error: true, code, message: err.message });
      }
    }
    const ok = results.filter(x => !x.error).sort((a, b) => b.signal.score - a.signal.score);
    const fail = results.filter(x => x.error);
    list.innerHTML = ok.map((item, i) => radarCard(item, i + 1)).join('') + fail.map(x => `<div class="quote-error">${x.code} 讀取失敗</div>`).join('');
    setStatus(`已更新 ${new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`);
  }

  function bindRadar() {
    document.querySelector('#runRadarBtn')?.addEventListener('click', runRadar);
    document.querySelector('#addRadarBtn')?.addEventListener('click', () => {
      const input = document.querySelector('#radarCode');
      const code = input?.value.match(/\d{4,6}/)?.[0];
      if (!code) return alert('請輸入股票代號，例如 2330');
      const codes = getCodes();
      saveCodes([code, ...codes]);
      input.value = '';
      runRadar();
    });
    document.querySelector('#radarList')?.addEventListener('click', (e) => {
      const card = e.target.closest('.radar-card');
      if (!card) return;
      const input = document.querySelector('#stockName');
      if (input) input.value = card.dataset.code;
      document.querySelector('#fetchQuoteBtn')?.click();
      document.querySelector('.nav-item[data-page="dashboard"]')?.click();
    });
    if (radarTimer) clearInterval(radarTimer);
    radarTimer = setInterval(() => {
      if (document.querySelector('#page-radar')?.classList.contains('active')) runRadar();
    }, 30000);
  }

  window.addEventListener('load', () => {
    bindRadar();
    setTimeout(runRadar, 800);
  });
})();
