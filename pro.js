(() => {
  const BACKEND = 'https://stock-monitor-b6d6.onrender.com';
  const state = { code: '2330', quote: null, kbars: [], pan: 0, cross: false, crossIndex: null, timer: null };

  const $ = (s) => document.querySelector(s);
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = (v, d = 2) => { const x = Number(v); if (!Number.isFinite(x)) return '-'; return Number.isInteger(x) ? String(x) : x.toFixed(d); };
  const timeText = (ts) => String(ts || '').match(/(\d{2}:\d{2})/)?.[1] || String(ts || '').slice(11, 16) || '-';

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function load(code = state.code) {
    state.code = String(code || '2330').match(/\d{4,6}/)?.[0] || '2330';
    $('#proCode').value = state.code;
    try {
      const [quote, kbars] = await Promise.all([
        getJSON(`${BACKEND}/api/quote?code=${state.code}`),
        getJSON(`${BACKEND}/api/kbars?code=${state.code}&days=5`)
      ]);
      state.quote = quote;
      state.kbars = kbars.items || [];
      renderQuote();
      drawChart();
      updateSignal();
      $('#proStatus').textContent = `更新 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (e) {
      $('#proStatus').textContent = '讀取失敗';
      $('#proSignal').textContent = `讀取失敗：${e.message}`;
    }
  }

  function renderQuote() {
    const q = state.quote || {};
    const up = n(q.change_rate) >= 0;
    $('#proTitle').textContent = `${q.code || state.code} ${q.name || ''}`;
    $('#proPrice').textContent = fmt(q.close);
    $('#proChange').textContent = `${up ? '▲' : '▼'} ${fmt(q.change_price)} (${fmt(q.change_rate)}%)`;
    $('#proChange').className = up ? 'up' : 'down';
    $('#proHigh').textContent = fmt(q.high);
    $('#proLow').textContent = fmt(q.low);
    $('#proAvg').textContent = fmt(q.average_price);
    $('#proVol').textContent = fmt(q.volume, 0);
    $('#proBid').textContent = `${fmt(q.buy_price)} / ${fmt(q.buy_volume, 0)}`;
    $('#proAsk').textContent = `${fmt(q.sell_price)} / ${fmt(q.sell_volume, 0)}`;
  }

  function ma(data, i, len) {
    if (i < len - 1) return null;
    let sum = 0;
    for (let j = i - len + 1; j <= i; j++) sum += n(data[j].close);
    return sum / len;
  }
  function vwap(data) {
    let a = 0, v = 0;
    data.forEach(b => { const vol = n(b.volume); a += ((n(b.high)+n(b.low)+n(b.close))/3) * vol; v += vol; });
    return v ? a / v : null;
  }
  function rsi(data, len = 14) {
    const out = [];
    for (let i = 0; i < data.length; i++) {
      if (i < len) { out.push(null); continue; }
      let gain = 0, loss = 0;
      for (let j = i - len + 1; j <= i; j++) { const diff = n(data[j].close) - n(data[j-1].close); if (diff >= 0) gain += diff; else loss -= diff; }
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
    return out;
  }
  function ema(values, len) {
    const k = 2 / (len + 1); let prev = values[0] || 0;
    return values.map((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); return prev; });
  }
  function macd(data) {
    const closes = data.map(b => n(b.close)); const e12 = ema(closes, 12); const e26 = ema(closes, 26);
    const dif = closes.map((_, i) => e12[i] - e26[i]); const dea = ema(dif, 9);
    return dif.map((d, i) => ({ dif: d, dea: dea[i], hist: d - dea[i] }));
  }

  function drawLine(ctx, arr, yOf, xOf, color, width = 1.4) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); let moved = false;
    arr.forEach((v, i) => { if (v == null || !Number.isFinite(v)) return; const x = xOf(i), y = yOf(v); if (!moved) { ctx.moveTo(x, y); moved = true; } else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.restore();
  }

  function drawChart() {
    const canvas = $('#proCanvas');
    const dataAll = state.kbars || [];
    if (!canvas || dataAll.length < 3) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(360, rect.width || innerWidth);
    const H = Math.max(650, rect.height || 650);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);

    const padL = 48, padR = 48, top = 18, priceH = 285, volTop = top + priceH + 8, volH = 70, rsiTop = volTop + volH + 32, rsiH = 110, macdTop = rsiTop + rsiH + 32, macdH = 115;
    const candleW = 7, gap = 4, step = candleW + gap;
    const visible = Math.max(34, Math.floor((W - padL - padR) / step));
    state.pan = Math.max(0, Math.min(state.pan, Math.max(0, dataAll.length - visible)));
    const start = Math.max(0, dataAll.length - visible - Math.round(state.pan));
    const data = dataAll.slice(start, start + visible);
    const hi = Math.max(...data.map(b => n(b.high))), lo = Math.min(...data.map(b => n(b.low))), range = Math.max(hi - lo, 0.01);
    const maxVol = Math.max(...data.map(b => n(b.volume)), 1);
    const xOf = i => padL + i * step + step / 2;
    const yOf = p => top + ((hi - p) / range) * priceH;

    ctx.fillStyle = '#090d15'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    [0, .25, .5, .75, 1].forEach(t => { const y = top + priceH*t; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W-padR, y); ctx.stroke(); });
    for (let i=0;i<5;i++){ const x=padL+i*(W-padL-padR)/4; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, macdTop+macdH); ctx.stroke(); }

    const vw = vwap(data);
    const res = Math.max(...data.slice(-20).map(b=>n(b.high))), sup = Math.min(...data.slice(-20).map(b=>n(b.low)));
    function level(p, label, color){ const y=yOf(p); ctx.save(); ctx.strokeStyle=color; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.font='700 12px system-ui'; ctx.fillText(`${label} ${fmt(p)}`, padL+4, y-5); ctx.restore(); }
    level(res, '壓力', '#ff4d6d'); level(sup, '支撐', '#23d18b'); if(vw) level(vw, 'VWAP', '#28d7ff');

    data.forEach((b,i)=>{ const x=xOf(i), up=n(b.close)>=n(b.open), c=up?'#ff3b4f':'#1fd982'; ctx.strokeStyle=c; ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(x,yOf(n(b.high))); ctx.lineTo(x,yOf(n(b.low))); ctx.stroke(); const y1=yOf(Math.max(n(b.open),n(b.close))), y2=yOf(Math.min(n(b.open),n(b.close))); ctx.fillRect(x-candleW/2,y1,candleW,Math.max(2,y2-y1)); const vh=n(b.volume)/maxVol*volH; ctx.globalAlpha=.8; ctx.fillRect(x-candleW/2,volTop+volH-vh,candleW,vh); ctx.globalAlpha=1; });
    drawLine(ctx, data.map((_,i)=>ma(data,i,5)), yOf, xOf, '#f4b23d', 1.5);
    drawLine(ctx, data.map((_,i)=>ma(data,i,10)), yOf, xOf, '#1988ff', 1.5);
    drawLine(ctx, data.map((_,i)=>ma(data,i,20)), yOf, xOf, '#d92bd9', 1.3);

    ctx.fillStyle='#f4b23d'; ctx.font='700 13px system-ui'; ctx.fillText('MA5', padL, volTop+volH+18); ctx.fillStyle='#1988ff'; ctx.fillText('MA10', padL+70, volTop+volH+18); ctx.fillStyle='#d92bd9'; ctx.fillText('MA20', padL+145, volTop+volH+18);

    const r = rsi(data); const rY = v => rsiTop + (100 - v)/100*rsiH;
    ctx.strokeStyle='rgba(255,255,255,.08)'; [20,50,80].forEach(v=>{ const y=rY(v); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke(); ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillText(String(v), W-34, y+4); });
    drawLine(ctx, r, rY, xOf, '#f4b23d', 1.4); ctx.fillStyle='rgba(255,255,255,.8)'; ctx.fillText('RSI', 8, rsiTop+16);

    const m = macd(data); const vals = m.flatMap(o=>[o.dif,o.dea,o.hist]); const mh = Math.max(...vals.map(Math.abs), .1); const mY = v => macdTop + macdH/2 - v/mh*(macdH/2-8);
    ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(padL,mY(0)); ctx.lineTo(W-padR,mY(0)); ctx.stroke();
    m.forEach((o,i)=>{ const x=xOf(i); ctx.fillStyle=o.hist>=0?'#ff222d':'#1fd982'; ctx.fillRect(x-3, mY(Math.max(0,o.hist)), 6, Math.max(2, Math.abs(mY(o.hist)-mY(0)))); });
    drawLine(ctx, m.map(o=>o.dif), mY, xOf, '#f4b23d', 1.2); drawLine(ctx, m.map(o=>o.dea), mY, xOf, '#1988ff', 1.2); ctx.fillStyle='rgba(255,255,255,.8)'; ctx.fillText('MACD', 8, macdTop+16);

    ctx.fillStyle='rgba(255,255,255,.75)'; ctx.font='13px system-ui'; ctx.fillText(fmt(hi), W-42, top+10); ctx.fillText(fmt(lo), W-42, top+priceH);

    const idx = state.cross ? (state.crossIndex ?? data.length-1) : null;
    if (idx != null && data[idx]) {
      const b=data[idx], x=xOf(idx), y=yOf(n(b.close));
      ctx.save(); ctx.strokeStyle='#e4b14f'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,macdTop+macdH); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
      ctx.fillStyle='rgba(18,22,30,.96)'; ctx.fillRect(0,0,W,48); ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='700 13px system-ui';
      [['時',timeText(b.ts)],['開',fmt(b.open)],['高',fmt(b.high)],['低',fmt(b.low)],['收',fmt(b.close)],['量',fmt(b.volume,0)]].forEach((r,i)=>{ const x0=10+i*(W-20)/6; ctx.fillStyle='rgba(255,255,255,.75)'; ctx.fillText(r[0],x0,18); ctx.fillStyle=i===3?'#23d18b':(i===2||i===4?'#ff4d6d':'#f4b23d'); ctx.fillText(r[1],x0,39); });
      ctx.fillStyle='rgba(60,60,60,.95)'; ctx.beginPath(); ctx.arc(W-28,30,16,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='900 22px system-ui'; ctx.textAlign='center'; ctx.fillText('×',W-28,37); ctx.textAlign='left';
      ctx.fillStyle='#e4b14f'; ctx.fillRect(x-38, volTop+volH+2, 76, 20); ctx.fillStyle='#111'; ctx.font='700 11px system-ui'; ctx.textAlign='center'; ctx.fillText(timeText(b.ts), x, volTop+volH+16); ctx.textAlign='left'; ctx.restore();
    }
  }

  function updateSignal(){
    const data = state.kbars || []; if(data.length<5) return;
    const last=data[data.length-1], prev=data[data.length-2]; let s='中性整理';
    if(n(last.close)>n(last.open)&&n(last.close)>=Math.max(...data.slice(-8,-1).map(b=>n(b.high)))) s='放量突破觀察，等回測不破較安全';
    if(n(last.close)<n(prev.close)) s='短線轉弱，當沖多單保守';
    $('#proSignal').textContent=s;
  }

  function bind(){
    $('#proSearch')?.addEventListener('click',()=>load($('#proCode').value));
    $('#proRefresh')?.addEventListener('click',()=>load(state.code));
    $('#proCode')?.addEventListener('keydown',e=>{ if(e.key==='Enter') load($('#proCode').value); });
    const canvas=$('#proCanvas');
    let sx=0, sp=0, moved=false, lp=null;
    canvas.addEventListener('pointerdown',e=>{ sx=e.clientX; sp=state.pan; moved=false; lp=setTimeout(()=>{ state.cross=true; setCross(e); drawChart(); },420); });
    canvas.addEventListener('pointermove',e=>{ const dx=e.clientX-sx; if(Math.abs(dx)>5){ moved=true; clearTimeout(lp); } if(state.cross){ setCross(e); } state.pan=Math.max(0, sp+dx/11); drawChart(); });
    canvas.addEventListener('pointerup',e=>{ clearTimeout(lp); const rect=canvas.getBoundingClientRect(); if(state.cross && e.clientX-rect.left>rect.width-58 && e.clientY-rect.top<58){ state.cross=false; state.crossIndex=null; drawChart(); } });
    window.addEventListener('resize', drawChart);
  }
  function setCross(e){ const canvas=$('#proCanvas'), rect=canvas.getBoundingClientRect(); const W=rect.width, padL=48, padR=48, step=11; const visible=Math.max(34,Math.floor((W-padL-padR)/step)); const x=e.clientX-rect.left; state.crossIndex=Math.max(0,Math.min(visible-1,Math.round((x-padL-step/2)/step))); }

  window.addEventListener('load',()=>{ bind(); load('2330'); state.timer=setInterval(()=>load(state.code),15000); });
})();
