(() => {
  const BACKEND = 'https://stock-monitor-b6d6.onrender.com';
  const state = { code: '', quote: null, kbars: [], cross: false, crossIndex: null, pan: 0 };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = (v, d = 2) => { const x = Number(v); if (!Number.isFinite(x)) return '-'; return Number.isInteger(x) ? String(x) : x.toFixed(d); };
  const rules = window.STX_DAYTRADE_SOURCE || { rules: {}, principles: [] };

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function switchPage(page) {
    $$('.modern-page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $$('.modern-bottom button[data-page]').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'overview') setTimeout(drawChart, 80);
  }

  function resetToMarketHome() {
    state.code = '';
    state.quote = null;
    state.kbars = [];
    $('#proTitle').textContent = 'STX 當沖主介面';
    $('#proTitle')?.nextElementSibling && ($('#proTitle').nextElementSibling.textContent = '大盤分析｜搜尋股票');
    $('#proPrice').textContent = '-';
    $('#proChange').textContent = '請先搜尋股票';
    $('#stockCodeLabel').textContent = '搜尋';
    $('#proCode').value = '';
    clearStockPanels();
    switchPage('search');
    refreshMarket();
  }

  function clearStockPanels() {
    ['#proVol','#proAvg','#proHigh','#proLow','#proBid','#proAsk','#qClose','#qChange','#qOpen','#qHigh','#qLow','#qVol','#qBid','#qAsk','#qVolRatio','#aiEntry','#aiStop','#aiTarget','#planEntry','#planStop','#planTarget'].forEach(id => { const el = $(id); if (el) el.textContent = '-'; });
    ['#aiEntryText','#aiStopText','#aiTargetText','#planEntryText','#planStopText','#planTargetText'].forEach(id => { const el = $(id); if (el) el.textContent = '等待資料'; });
    $('#proSignal').textContent = '請先在主介面搜尋股票。';
    $('#analysisSummary').textContent = '請先搜尋股票後產生分析。';
    $('#analysisTags').innerHTML = '<span>等待資料</span>';
    $('#riskTags').innerHTML = '<span>等待資料</span>';
  }

  function refreshMarket() {
    const hour = new Date().getHours();
    const open = hour >= 9 && hour < 14;
    const score = open ? 72 : 60;
    $('#marketScore').textContent = String(score);
    $('#marketMood').textContent = score >= 70 ? '偏多' : score >= 45 ? '震盪' : '偏空';
    $('#daytradeMood').textContent = score >= 70 ? '可操作' : '保守觀察';
    $('#marketSummary').textContent = score >= 70
      ? '大盤環境偏多；依教材規則，個股仍要等量價配合與回測不破，不追第一根急拉。'
      : '大盤不夠強；降低出手頻率，只做勝率門檻高的型態。';
  }

  async function loadStock(code) {
    const clean = String(code || '').match(/\d{4,6}/)?.[0];
    if (!clean) { alert('請輸入股票代號'); return; }
    state.code = clean;
    $('#proStatus').textContent = '讀取中...';
    const [quote, kbars] = await Promise.all([
      getJSON(`${BACKEND}/api/quote?code=${clean}`),
      getJSON(`${BACKEND}/api/kbars?code=${clean}&days=5`)
    ]);
    state.quote = quote;
    state.kbars = kbars.items || [];
    renderAll();
    switchPage('overview');
  }

  function renderAll() {
    renderQuote();
    drawChart();
    renderDecision();
    renderPages();
    $('#proStatus').textContent = `已更新 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  }

  function renderQuote() {
    const q = state.quote || {};
    const up = n(q.change_rate) >= 0;
    $('#proTitle').textContent = `${q.code || state.code} ${q.name || ''}`;
    $('#proTitle')?.nextElementSibling && ($('#proTitle').nextElementSibling.textContent = '個股當沖分析');
    $('#stockCodeLabel').textContent = q.code || state.code;
    $('#proPrice').textContent = fmt(q.close);
    $('#proChange').textContent = `${up ? '▲' : '▼'} ${fmt(q.change_price)} (${fmt(q.change_rate)}%)`;
    $('#proChange').className = up ? 'up' : 'down';
    $('#proVol').textContent = fmt(q.volume, 0);
    $('#proAvg').textContent = fmt(q.average_price);
    $('#proHigh').textContent = fmt(q.high);
    $('#proLow').textContent = fmt(q.low);
    $('#proBid').textContent = `${fmt(q.buy_price)} / ${fmt(q.buy_volume,0)}`;
    $('#proAsk').textContent = `${fmt(q.sell_price)} / ${fmt(q.sell_volume,0)}`;
  }

  function ma(data, i, len) { if (i < len - 1) return null; let s = 0; for (let j = i - len + 1; j <= i; j++) s += n(data[j].close); return s / len; }
  function vwap(data) { let a = 0, v = 0; data.forEach(b => { const vol = n(b.volume); a += ((n(b.high)+n(b.low)+n(b.close))/3)*vol; v += vol; }); return v ? a / v : null; }

  function analyze() {
    const q = state.quote || {}, data = state.kbars || [], last = data.at(-1) || {}, prev = data.at(-2) || {};
    const close = n(q.close) || n(last.close), avg = n(q.average_price) || vwap(data.slice(-30)) || close;
    const change = n(q.change_rate), volRatio = n(q.volume_ratio), buyVol = n(q.buy_volume), sellVol = n(q.sell_volume);
    let score = 50; const good = [], bad = [], tactics = [];
    if (close > avg) { score += 14; good.push('現價站上均價，盤中多方掌控較佳'); } else { score -= 16; bad.push('跌破均價，依教材規則先保守'); }
    if (change > 0) { score += Math.min(change * 6, 16); good.push('價格維持上漲動能'); } else if (change < 0) { score += Math.max(change * 6, -16); bad.push('短線價格轉弱'); }
    if (volRatio >= 1.4 && change > 0.3) { score += 16; good.push('放量上漲，有攻擊意圖'); tactics.push('突破後不追第一根，等回測不破'); }
    if (volRatio >= 1.4 && change <= 0.3) { score -= 20; bad.push('爆量不漲，可能是震盪出貨'); tactics.push('避免追價，觀察是否跌破均價'); }
    if (buyVol > sellVol * 1.15) { score += 12; good.push('五檔買量較強，短線承接較佳'); }
    if (sellVol > buyVol * 1.15) { score -= 12; bad.push('五檔賣壓較重，拉高容易遇壓'); }
    if (n(last.close) < n(prev.close)) { score -= 8; bad.push('最近 K 棒轉弱'); }
    if (n(q.high) && close >= n(q.high) * 0.995 && volRatio < 1.1) { score -= 8; bad.push('貼近高點但量能不足，急拉風險'); }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const recent = data.slice(-30);
    const support = Math.min(...recent.map(b => n(b.low)).filter(Boolean));
    const pressure = Math.max(...recent.map(b => n(b.high)).filter(Boolean));
    const entry = score >= 65 ? Math.max(avg, support || avg) : avg;
    const stop = support || close * 0.985;
    let target = pressure || close * 1.015;
    if (target <= entry) target = entry + (entry - stop) * 1.6;
    const action = score >= 75 ? '高勝率觀察：等回測不破' : score >= 60 ? '可觀察，但不要追第一根' : score >= 45 ? '訊號普通，等待主力表態' : '不適合追價，保守';
    return { score, good, bad, tactics, support, pressure, entry, stop, target, action };
  }

  function renderDecision() {
    const s = analyze();
    $('#proSignal').textContent = `AI 強度 ${s.score}/100｜${s.action}`;
    const cards = $$('.modern-cards article');
    const q = state.quote || {};
    const rows = [
      ['勝率門檻', `${s.score}`, s.score >= 70 ? '達標，等回測' : '未達高勝率'],
      ['主力手法', s.bad.some(x=>x.includes('爆量不漲')) ? '疑似出貨' : '偏承接', s.tactics[0] || '觀察量價'],
      ['五檔強弱', n(q.buy_volume) >= n(q.sell_volume) ? '買盤強' : '賣壓重', `${fmt(q.buy_volume,0)} / ${fmt(q.sell_volume,0)}`],
      ['量價判斷', n(q.volume_ratio) >= 1.4 ? '爆量' : '正常', s.bad.find(x=>x.includes('爆量')) || '量價尚可']
    ];
    cards.forEach((c,i)=>{ if(!c) return; c.querySelector('span').textContent=rows[i][0]; c.querySelector('strong').textContent=rows[i][1]; c.querySelector('p').textContent=rows[i][2]; });
    $('#analysisSummary').textContent = `依《${rules.title || '當沖股票版入門指南'}》：${s.action}。重點不是預測，而是等價量、五檔與主力手法同向。`;
    $('#analysisTags').innerHTML = (s.good.length ? s.good : ['等待多方條件']).map(x=>`<span>${x}</span>`).join('');
    $('#riskTags').innerHTML = (s.bad.length ? s.bad : ['暫無明顯風險']).map(x=>`<span>${x}</span>`).join('');
    $('.modern-alerts').innerHTML = `<b>⚡ 即時提醒</b>${[...s.good.slice(0,2),...s.bad.slice(0,2)].map(x=>`<span>${x}</span>`).join('')}`;
    ['aiEntry','planEntry'].forEach(id=>$('#'+id).textContent=fmt(s.entry));
    ['aiStop','planStop'].forEach(id=>$('#'+id).textContent=fmt(s.stop));
    ['aiTarget','planTarget'].forEach(id=>$('#'+id).textContent=fmt(s.target));
    $('#aiEntryText').textContent = s.score >= 65 ? '等回測均價/支撐不破，不追第一根' : '勝率不足，先等訊號';
    $('#aiStopText').textContent = `跌破 ${fmt(s.stop)} 代表假設失敗`;
    $('#aiTargetText').textContent = `第一壓力 ${fmt(s.target)}`;
    $('#planEntryText').textContent = $('#aiEntryText').textContent;
    $('#planStopText').textContent = $('#aiStopText').textContent;
    $('#planTargetText').textContent = $('#aiTargetText').textContent;
  }

  function renderPages() {
    const q = state.quote || {};
    $('#qClose').textContent = fmt(q.close); $('#qChange').textContent = `${fmt(q.change_price)} / ${fmt(q.change_rate)}%`;
    $('#qOpen').textContent = fmt(q.open); $('#qHigh').textContent = fmt(q.high); $('#qLow').textContent = fmt(q.low);
    $('#qVol').textContent = fmt(q.volume,0); $('#qBid').textContent = `${fmt(q.buy_price)} / ${fmt(q.buy_volume,0)}`; $('#qAsk').textContent = `${fmt(q.sell_price)} / ${fmt(q.sell_volume,0)}`; $('#qVolRatio').textContent = fmt(q.volume_ratio);
  }

  function drawChart() {
    const canvas = $('#proCanvas'), data = state.kbars || []; if (!canvas || data.length < 2) return;
    const dpr = devicePixelRatio || 1, rect = canvas.getBoundingClientRect(), W = Math.max(320, rect.width), H = Math.max(360, rect.height);
    canvas.width = W*dpr; canvas.height = H*dpr; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    const padL=40,padR=40,top=16,priceH=Math.round(H*.58),volTop=top+priceH+8,volH=54,step=11,cw=7;
    const visible=Math.max(24,Math.floor((W-padL-padR)/step)); const slice=data.slice(-visible-Math.round(state.pan), data.length-Math.round(state.pan)||data.length).slice(0,visible);
    const hi=Math.max(...slice.map(b=>n(b.high))), lo=Math.min(...slice.map(b=>n(b.low))), range=Math.max(hi-lo,.01), maxVol=Math.max(...slice.map(b=>n(b.volume)),1);
    const x=i=>padL+i*step+step/2, y=p=>top+(hi-p)/range*priceH;
    ctx.fillStyle='#07101d'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='rgba(255,255,255,.08)';
    [0,.25,.5,.75,1].forEach(t=>{ctx.beginPath();ctx.moveTo(padL,top+priceH*t);ctx.lineTo(W-padR,top+priceH*t);ctx.stroke();});
    const sup=Math.min(...slice.slice(-20).map(b=>n(b.low))), res=Math.max(...slice.slice(-20).map(b=>n(b.high))), vw=vwap(slice);
    [[sup,'支撐','#23d18b'],[res,'壓力','#ff4b65'],[vw,'VWAP','#28d7ff']].forEach(([p,label,c])=>{if(!p)return;ctx.save();ctx.strokeStyle=c;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(padL,y(p));ctx.lineTo(W-padR,y(p));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=c;ctx.font='800 12px system-ui';ctx.fillText(`${label} ${fmt(p)}`,padL+4,y(p)-5);ctx.restore();});
    slice.forEach((b,i)=>{const up=n(b.close)>=n(b.open), c=up?'#ff3b4f':'#1fd982';ctx.strokeStyle=c;ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x(i),y(n(b.high)));ctx.lineTo(x(i),y(n(b.low)));ctx.stroke();const y1=y(Math.max(n(b.open),n(b.close))), y2=y(Math.min(n(b.open),n(b.close)));ctx.fillRect(x(i)-cw/2,y1,cw,Math.max(2,y2-y1));const vh=n(b.volume)/maxVol*volH;ctx.globalAlpha=.75;ctx.fillRect(x(i)-cw/2,volTop+volH-vh,cw,vh);ctx.globalAlpha=1;});
  }

  function bindWatch() {
    const render=()=>{const arr=JSON.parse(localStorage.getItem('stx_watch')||'[]'); $('#watchList').innerHTML=arr.map(code=>`<button class="watch-chip" data-code="${code}">${code}</button>`).join('')||'<p class="empty-watch">尚未新增自選股</p>';};
    $('#watchAdd')?.addEventListener('click',()=>{const code=$('#watchInput').value.match(/\d{4,6}/)?.[0]; if(!code)return; const arr=JSON.parse(localStorage.getItem('stx_watch')||'[]'); localStorage.setItem('stx_watch',JSON.stringify([code,...arr.filter(x=>x!==code)].slice(0,12))); $('#watchInput').value=''; render();});
    $('#watchList')?.addEventListener('click',e=>{const b=e.target.closest('[data-code]'); if(b) loadStock(b.dataset.code);});
    render();
  }

  function bind() {
    $('#openSearchPage')?.addEventListener('click', resetToMarketHome);
    $('#proSearch')?.addEventListener('click',()=>loadStock($('#proCode').value));
    $('#proCode')?.addEventListener('keydown',e=>{ if(e.key==='Enter') loadStock($('#proCode').value); });
    $('#marketRefresh')?.addEventListener('click', refreshMarket);
    $$('.modern-bottom button[data-page]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.page)));
    bindWatch();
    refreshMarket();
    resetToMarketHome();
  }

  window.addEventListener('load', bind);
})();
