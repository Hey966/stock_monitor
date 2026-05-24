(() => {
  const BACKEND = 'https://stock-monitor-b6d6.onrender.com';
  const state = { code: '2330', quote: null, kbars: [], pan: 0, cross: false, crossIndex: null, timer: null };
  const $ = (s) => document.querySelector(s);
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = (v, d = 2) => { const x = Number(v); if (!Number.isFinite(x)) return '-'; return Number.isInteger(x) ? String(x) : x.toFixed(d); };
  const timeText = (ts) => String(ts || '').match(/(\d{2}:\d{2})/)?.[1] || String(ts || '').slice(11, 16) || '-';

  async function getJSON(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(await r.text()); return r.json(); }

  async function load(code = state.code) {
    state.code = String(code || '2330').match(/\d{4,6}/)?.[0] || '2330';
    $('#proCode').value = state.code;
    try {
      const [quote, kbars] = await Promise.all([getJSON(`${BACKEND}/api/quote?code=${state.code}`), getJSON(`${BACKEND}/api/kbars?code=${state.code}&days=5`)]);
      state.quote = quote; state.kbars = kbars.items || [];
      renderQuote(); drawChart(); updateSignal(); updateSmartCards(); updateTradePoints();
      $('#proStatus').textContent = `已更新 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (e) { $('#proStatus').textContent = '讀取失敗'; $('#proSignal').textContent = `讀取失敗：${e.message}`; }
  }

  function renderQuote() {
    const q = state.quote || {}; const up = n(q.change_rate) >= 0;
    $('#proTitle').textContent = `${q.code || state.code} ${q.name || ''}`;
    $('#proPrice').textContent = fmt(q.close);
    $('#proChange').textContent = `${up ? '▲' : '▼'} ${fmt(q.change_price)} (${fmt(q.change_rate)}%)`;
    $('#proChange').className = up ? 'up' : 'down';
    $('#proHigh').textContent = fmt(q.high); $('#proLow').textContent = fmt(q.low); $('#proAvg').textContent = fmt(q.average_price); $('#proVol').textContent = fmt(q.volume, 0);
    $('#proBid').textContent = `${fmt(q.buy_price)} / ${fmt(q.buy_volume, 0)}`; $('#proAsk').textContent = `${fmt(q.sell_price)} / ${fmt(q.sell_volume, 0)}`;
  }

  function ma(data, i, len) { if (i < len - 1) return null; let sum = 0; for (let j = i - len + 1; j <= i; j++) sum += n(data[j].close); return sum / len; }
  function vwap(data) { let a = 0, v = 0; data.forEach(b => { const vol = n(b.volume); a += ((n(b.high)+n(b.low)+n(b.close))/3) * vol; v += vol; }); return v ? a / v : null; }
  function rsi(data, len = 14) { const out=[]; for(let i=0;i<data.length;i++){ if(i<len){out.push(null);continue;} let gain=0,loss=0; for(let j=i-len+1;j<=i;j++){const diff=n(data[j].close)-n(data[j-1].close); if(diff>=0) gain+=diff; else loss-=diff;} out.push(loss===0?100:100-100/(1+gain/loss)); } return out; }
  function ema(values, len) { const k=2/(len+1); let prev=values[0]||0; return values.map((v,i)=>{prev=i===0?v:v*k+prev*(1-k); return prev;}); }
  function macd(data) { const closes=data.map(b=>n(b.close)); const e12=ema(closes,12), e26=ema(closes,26); const dif=closes.map((_,i)=>e12[i]-e26[i]); const dea=ema(dif,9); return dif.map((d,i)=>({dif:d,dea:dea[i],hist:d-dea[i]})); }
  function drawLine(ctx, arr, yOf, xOf, color, width=1.4) { ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); let moved=false; arr.forEach((v,i)=>{ if(v==null||!Number.isFinite(v)) return; const x=xOf(i), y=yOf(v); if(!moved){ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y); }); ctx.stroke(); ctx.restore(); }

  function drawChart() {
    const canvas=$('#proCanvas'), dataAll=state.kbars||[]; if(!canvas||dataAll.length<3) return;
    const dpr=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect(); const W=Math.max(320,rect.width||innerWidth), H=Math.max(430,rect.height||430);
    canvas.width=W*dpr; canvas.height=H*dpr; const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    const padL=42,padR=42,top=18,priceH=Math.round(H*.55),volTop=top+priceH+8,volH=58,rsiTop=volTop+volH+24,rsiH=80,macdTop=rsiTop+rsiH+22,macdH=Math.max(70,H-macdTop-20);
    const candleW=7,gap=4,step=candleW+gap,visible=Math.max(24,Math.floor((W-padL-padR)/step));
    state.pan=Math.max(0,Math.min(state.pan,Math.max(0,dataAll.length-visible))); const start=Math.max(0,dataAll.length-visible-Math.round(state.pan)); const data=dataAll.slice(start,start+visible);
    const hi=Math.max(...data.map(b=>n(b.high))),lo=Math.min(...data.map(b=>n(b.low))),range=Math.max(hi-lo,.01),maxVol=Math.max(...data.map(b=>n(b.volume)),1);
    const xOf=i=>padL+i*step+step/2, yOf=p=>top+((hi-p)/range)*priceH;
    ctx.fillStyle='#07101d'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1;
    [0,.25,.5,.75,1].forEach(t=>{const y=top+priceH*t; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();});
    for(let i=0;i<4;i++){const x=padL+i*(W-padL-padR)/3; ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,H-18); ctx.stroke();}
    const vw=vwap(data),res=Math.max(...data.slice(-20).map(b=>n(b.high))),sup=Math.min(...data.slice(-20).map(b=>n(b.low)));
    function level(p,label,color){const y=yOf(p); ctx.save(); ctx.strokeStyle=color; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.font='800 12px system-ui'; ctx.fillText(`${label} ${fmt(p)}`,padL+4,y-6); ctx.restore();}
    level(res,'壓力','#ff4d6d'); level(sup,'支撐','#23d18b'); if(vw) level(vw,'VWAP','#28d7ff');
    data.forEach((b,i)=>{const x=xOf(i),up=n(b.close)>=n(b.open),c=up?'#ff3b4f':'#1fd982'; ctx.strokeStyle=c; ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(x,yOf(n(b.high))); ctx.lineTo(x,yOf(n(b.low))); ctx.stroke(); const y1=yOf(Math.max(n(b.open),n(b.close))),y2=yOf(Math.min(n(b.open),n(b.close))); ctx.fillRect(x-candleW/2,y1,candleW,Math.max(2,y2-y1)); const vh=n(b.volume)/maxVol*volH; ctx.globalAlpha=.78; ctx.fillRect(x-candleW/2,volTop+volH-vh,candleW,vh); ctx.globalAlpha=1;});
    drawLine(ctx,data.map((_,i)=>ma(data,i,5)),yOf,xOf,'#ffd166',1.6); drawLine(ctx,data.map((_,i)=>ma(data,i,10)),yOf,xOf,'#4f8cff',1.5); drawLine(ctx,data.map((_,i)=>ma(data,i,20)),yOf,xOf,'#d92bd9',1.3);
    const r=rsi(data), rY=v=>rsiTop+(100-v)/100*rsiH; ctx.strokeStyle='rgba(255,255,255,.08)'; [20,50,80].forEach(v=>{const y=rY(v);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();}); drawLine(ctx,r,rY,xOf,'#ffd166',1.3); ctx.fillStyle='rgba(255,255,255,.65)'; ctx.font='700 12px system-ui'; ctx.fillText('RSI',8,rsiTop+14);
    const m=macd(data), vals=m.flatMap(o=>[o.dif,o.dea,o.hist]), mh=Math.max(...vals.map(Math.abs),.1), mY=v=>macdTop+macdH/2-v/mh*(macdH/2-8); ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(padL,mY(0)); ctx.lineTo(W-padR,mY(0)); ctx.stroke(); m.forEach((o,i)=>{const x=xOf(i);ctx.fillStyle=o.hist>=0?'#ff222d':'#1fd982';ctx.fillRect(x-3,mY(Math.max(0,o.hist)),6,Math.max(2,Math.abs(mY(o.hist)-mY(0))));}); drawLine(ctx,m.map(o=>o.dif),mY,xOf,'#ffd166',1.2); drawLine(ctx,m.map(o=>o.dea),mY,xOf,'#4f8cff',1.2); ctx.fillStyle='rgba(255,255,255,.65)'; ctx.fillText('MACD',8,macdTop+14);
    ctx.fillStyle='rgba(255,255,255,.7)'; ctx.fillText(fmt(hi),W-40,top+10); ctx.fillText(fmt(lo),W-40,top+priceH);
    const idx=state.cross?(state.crossIndex??data.length-1):null; if(idx!=null&&data[idx]){const b=data[idx],x=xOf(idx),y=yOf(n(b.close)); ctx.save(); ctx.strokeStyle='rgba(255,255,255,.68)'; ctx.setLineDash([5,5]); ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,H-20); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke(); ctx.setLineDash([]); const bx=x>W/2?14:W-154,by=Math.min(Math.max(y-62,18),H-150); ctx.fillStyle='rgba(10,15,25,.92)'; ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(bx,by,140,126,14); ctx.fill(); ctx.stroke(); ctx.font='800 12px system-ui'; [['時',timeText(b.ts)],['開',fmt(b.open)],['高',fmt(b.high)],['低',fmt(b.low)],['收',fmt(b.close)],['量',fmt(b.volume,0)]].forEach((r,i)=>{ctx.fillStyle=i===3?'#23d18b':(i===2||i===4?'#ff4d6d':'rgba(255,255,255,.82)'); ctx.fillText(`${r[0]} ${r[1]}`,bx+12,by+20+i*17);}); ctx.restore();}
  }

  function computeSignal(){
    const q=state.quote||{}, data=state.kbars||[], last=data[data.length-1]||{}, prev=data[data.length-2]||{}; let score=50; const tags=[]; const warnings=[];
    const change=n(q.change_rate), volRatio=n(q.volume_ratio), close=n(q.close), avg=n(q.average_price), high=n(q.high), open=n(q.open);
    if(change>0){score+=Math.min(change*8,18); tags.push('上漲動能');} else if(change<0){score+=Math.max(change*8,-18); warnings.push('短線轉弱');}
    if(avg&&close>avg){score+=12; tags.push('站上均價');} else if(avg&&close<avg){score-=12; warnings.push('跌破均價');}
    if(volRatio>=1.4&&change>0){score+=15; tags.push('爆量');} else if(volRatio>=1.4){score-=10; warnings.push('爆量不漲');}
    if(open&&close>open){score+=7; tags.push('站上開盤');}
    if(high&&close>=high*.995){score+=8; tags.push('貼近高點');}
    if(n(last.close)<n(prev.close)){score-=8; warnings.push('K線偏弱');}
    score=Math.max(0,Math.min(100,Math.round(score)));
    return {score,tags,warnings,bull:score,bear:100-score,trend:score>=75?'多頭排列':score>=55?'偏多整理':score>=40?'震盪觀望':'空方偏強',action:score>=75?'回測不破可觀察':score>=55?'等待突破確認':score>=40?'先等方向':'避免追價'};
  }

  function calcTradePoints(){
    const q=state.quote||{}, data=state.kbars||[], recent=data.slice(-30); if(!recent.length) return null;
    const close=n(q.close)||n(recent.at(-1)?.close), avg=n(q.average_price)||vwap(recent)||close;
    const support=Math.min(...recent.slice(-20).map(b=>n(b.low)).filter(Boolean));
    const pressure=Math.max(...recent.slice(-20).map(b=>n(b.high)).filter(Boolean));
    const score=computeSignal().score;
    let entry=score>=65 ? Math.max(avg,support) : avg;
    let stop=support || close*0.985;
    let target=pressure || close*1.015;
    if(target<=entry) target=entry+(entry-stop)*1.6;
    return {entry,stop,target,score,rr:(target-entry)/Math.max(entry-stop,.01)};
  }

  function updateTradePoints(){
    const p=calcTradePoints(); if(!p) return;
    $('#aiEntry').textContent=fmt(p.entry);
    $('#aiStop').textContent=fmt(p.stop);
    $('#aiTarget').textContent=fmt(p.target);
    $('#aiEntryText').textContent=p.score>=65?'偏強：等回測均價/支撐':'分數不足：先觀察';
    $('#aiStopText').textContent=`跌破 ${fmt(p.stop)} 代表假設失敗`;
    $('#aiTargetText').textContent=p.rr>=1.2?'風報比可觀察':'空間偏小，避免追價';
  }

  function updateSmartCards(){
    const s=computeSignal(), q=state.quote||{};
    const cards=document.querySelectorAll('.modern-cards article');
    const data=[['多空力道',String(s.score),s.score>=60?'多方強勢':'偏弱觀察'],['主力動向',n(q.buy_volume)>=n(q.sell_volume)?'買盤較強':'賣壓較重',`買賣量 ${fmt(q.buy_volume,0)} / ${fmt(q.sell_volume,0)}`],['量能狀態',n(q.volume_ratio)>=1.4?'爆量':'正常',`量比 ${fmt(q.volume_ratio)}`],['趨勢判斷',s.trend,s.action]];
    cards.forEach((c,i)=>{ if(!c||!data[i]) return; c.querySelector('span').textContent=data[i][0]; c.querySelector('strong').textContent=data[i][1]; c.querySelector('p').textContent=data[i][2]; });
    const box=document.querySelector('.modern-alerts'); if(box){ const items=[...s.tags,...s.warnings].slice(0,4); box.innerHTML=`<b>⚡ 即時提醒</b>${items.map(t=>`<span>${t}</span>`).join('') || '<span>等待訊號</span>'}`; }
  }

  function updateSignal(){ const data=state.kbars||[]; if(data.length<5) return; const s=computeSignal(); $('#proSignal').textContent=`AI 強度 ${s.score}/100｜${s.action}`; }
  function bind(){ $('#proSearch')?.addEventListener('click',()=>load($('#proCode').value)); $('#proRefresh')?.addEventListener('click',()=>load(state.code)); $('#proCode')?.addEventListener('keydown',e=>{if(e.key==='Enter')load($('#proCode').value);}); const canvas=$('#proCanvas'); let sx=0,sp=0,lp=null; canvas.addEventListener('pointerdown',e=>{sx=e.clientX;sp=state.pan;lp=setTimeout(()=>{state.cross=true;setCross(e);drawChart();},420);}); canvas.addEventListener('pointermove',e=>{const dx=e.clientX-sx;if(Math.abs(dx)>5)clearTimeout(lp); if(state.cross)setCross(e); state.pan=Math.max(0,sp+dx/11); drawChart();}); canvas.addEventListener('pointerup',()=>clearTimeout(lp)); window.addEventListener('resize',drawChart); }
  function setCross(e){const canvas=$('#proCanvas'),rect=canvas.getBoundingClientRect(),W=rect.width,padL=42,padR=42,step=11,visible=Math.max(24,Math.floor((W-padL-padR)/step)),x=e.clientX-rect.left;state.crossIndex=Math.max(0,Math.min(visible-1,Math.round((x-padL-step/2)/step)));}
  window.addEventListener('load',()=>{bind();load('2330');state.timer=setInterval(()=>load(state.code),15000);});
})();
