(() => {
  let pan = 0, startX = 0, startPan = 0, dragging = false;
  let lastItems = [], hoverIndex = null, lastView = null;
  let inspectMode = false, longPressTimer = null;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function fmt(value) { const n = Number(value); if (!Number.isFinite(n)) return "-"; return n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, ""); }
  function fmtTime(ts) { if (!ts) return "-"; const text = String(ts); const m = text.match(/(\d{2}:\d{2})/); return m ? m[1] : (text.slice(11, 16) || text); }

  function ensureInspectButton() {
    const block = document.querySelector('#klineCanvas')?.closest('.section-block');
    if (!block) return null;
    let btn = block.querySelector('.kline-exit-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'kline-exit-btn';
      btn.type = 'button';
      btn.textContent = '×';
      btn.setAttribute('aria-label', '退出十字線觀看');
      block.appendChild(btn);
      btn.addEventListener('click', exitInspectMode);
    }
    return btn;
  }

  function enterInspectMode(event) {
    if (!lastItems.length || inspectMode) return;
    inspectMode = true;
    const block = document.querySelector('#klineCanvas')?.closest('.section-block');
    block?.classList.add('kline-inspect-mode');
    document.body.classList.add('kline-locked');
    ensureInspectButton();
    if (event) updateHover(event);
    setTimeout(() => drawScrollableKline(lastItems), 40);
  }

  function exitInspectMode() {
    inspectMode = false;
    hoverIndex = null;
    document.querySelector('#klineCanvas')?.closest('.section-block')?.classList.remove('kline-inspect-mode');
    document.body.classList.remove('kline-locked');
    if (lastItems.length) drawScrollableKline(lastItems);
  }

  function drawMA(ctx, data, period, xOf, yOf, color) {
    if (data.length < period) return;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    data.forEach((bar, index) => {
      if (index < period - 1) return;
      const avg = data.slice(index - period + 1, index + 1).reduce((sum, item) => sum + Number(item.close || 0), 0) / period;
      const x = xOf(index), y = yOf(avg);
      if (index === period - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function getVWAP(data) { let amount = 0, volume = 0; data.forEach((bar) => { const typical = (Number(bar.high || 0) + Number(bar.low || 0) + Number(bar.close || 0)) / 3; const vol = Number(bar.volume || 0); amount += typical * vol; volume += vol; }); return volume ? amount / volume : null; }
  function avgVolume(data, index, period = 8) { const slice = data.slice(Math.max(0, index - period), index); if (!slice.length) return 0; return slice.reduce((sum, item) => sum + Number(item.volume || 0), 0) / slice.length; }
  function isBreakout(data, index) { if (index < 3) return false; const prevHigh = Math.max(...data.slice(Math.max(0, index - 8), index).map((item) => Number(item.high || 0))); return Number(data[index].close || 0) > prevHigh; }

  function drawLevel(ctx, y, label, price, color, width, padL, padR) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.1; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke(); ctx.setLineDash([]);
    const text = `${label} ${fmt(price)}`; ctx.font = "700 11px -apple-system,BlinkMacSystemFont,Segoe UI"; const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = "rgba(8,11,18,.82)"; ctx.fillRect(width - padR - tw, y - 10, tw, 18); ctx.fillStyle = color; ctx.fillText(text, width - padR - tw + 6, y + 4); ctx.restore();
  }

  function drawTag(ctx, x, y, text, color) {
    if (inspectMode) return;
    ctx.save(); ctx.font = "700 10px -apple-system,BlinkMacSystemFont,Segoe UI"; const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = "rgba(8,11,18,.88)"; ctx.strokeStyle = color; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 18, w, 16, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, x, y - 6); ctx.textAlign = "left"; ctx.restore();
  }
  function drawArrow(ctx, x, y, color) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 6, y - 2); ctx.lineTo(x + 6, y - 2); ctx.closePath(); ctx.fill(); ctx.restore(); }

  function drawCrosshair(ctx, data, index, xOf, yOf, width, height, padL, padR, padT, volTop) {
    if (index == null || !data[index]) return;
    const bar = data[index], x = xOf(index), y = yOf(bar.close);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.58)"; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, height - 28); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke(); ctx.setLineDash([]);
    const up = Number(bar.close) >= Number(bar.open);
    const boxW = Math.min(width - 26, inspectMode ? 166 : 268), boxH = inspectMode ? 142 : 62;
    const boxX = x > width / 2 ? 12 : width - boxW - 12;
    const boxY = inspectMode ? Math.min(Math.max(y - 70, 12), height - boxH - 18) : 10;
    ctx.fillStyle = "rgba(8,11,18,.93)"; ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = up ? "#ff4d6d" : "#23d18b"; ctx.font = "800 13px -apple-system,BlinkMacSystemFont,Segoe UI"; ctx.fillText(`${fmtTime(bar.ts)} ${up ? '紅K' : '黑K'}`, boxX + 12, boxY + 22);
    ctx.fillStyle = "rgba(255,255,255,.84)"; ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI";
    if (inspectMode) {
      const rows = [['開', bar.open], ['高', bar.high], ['低', bar.low], ['收', bar.close], ['量', bar.volume]];
      rows.forEach((r, i) => { ctx.fillStyle = i === 2 ? '#23d18b' : i === 3 || i === 1 ? '#ff4d6d' : 'rgba(255,255,255,.74)'; ctx.fillText(`${r[0]}  ${fmt(r[1])}`, boxX + 12, boxY + 46 + i * 18); });
    } else {
      ctx.fillText(`開 ${fmt(bar.open)}  高 ${fmt(bar.high)}  低 ${fmt(bar.low)}  收 ${fmt(bar.close)}`, boxX + 10, boxY + 38);
      ctx.fillStyle = "rgba(255,255,255,.58)"; ctx.fillText(`量 ${fmt(bar.volume)}`, boxX + 10, boxY + 56);
    }
    ctx.fillStyle = up ? '#ff4d6d' : '#23d18b'; ctx.beginPath(); ctx.roundRect(width - 62, y - 13, 56, 26, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 12px -apple-system,BlinkMacSystemFont,Segoe UI"; ctx.textAlign = "center"; ctx.fillText(fmt(bar.close), width - 34, y + 4); ctx.textAlign = "left";
    if (inspectMode) { ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI"; ctx.textAlign = "center"; ctx.fillText(fmtTime(bar.ts), x, height - 10); ctx.textAlign = "left"; }
    ctx.restore();
  }

  function drawScrollableKline(items) {
    const canvas = document.querySelector("#klineCanvas"); if (!canvas || !items?.length) return; lastItems = items;
    const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect(), width = Math.max(rect.width || 320, 320), height = inspectMode ? Math.max(rect.height || 520, 480) : 260;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const padL = 40, padR = 12, padT = inspectMode ? 66 : 18, volH = inspectMode ? 78 : 38, volTop = height - volH - 34, priceH = volTop - padT - 14;
    const candleGap = inspectMode ? 4 : 3, candleW = inspectMode ? 8 : 7, step = candleW + candleGap;
    const visible = Math.max(inspectMode ? 28 : 18, Math.floor((width - padL - padR) / step)), maxPan = Math.max(0, items.length - visible); pan = clamp(pan, 0, maxPan);
    const start = Math.max(0, items.length - visible - Math.round(pan)), data = items.slice(start, start + visible);
    const high = Math.max(...data.map((item) => Number(item.high || 0))), low = Math.min(...data.map((item) => Number(item.low || 0))), maxVol = Math.max(...data.map((item) => Number(item.volume || 0)), 1), range = Math.max(high - low, 0.01);
    const resistance = Math.max(...data.slice(-20).map((item) => Number(item.high || 0))), support = Math.min(...data.slice(-20).map((item) => Number(item.low || 0))), vwap = getVWAP(data);
    hoverIndex = hoverIndex == null ? (inspectMode ? data.length - 1 : null) : clamp(hoverIndex, 0, data.length - 1); lastView = { data, padL, padR, padT, step, width, height };
    ctx.fillStyle = inspectMode ? "rgba(2,8,18,.96)" : "rgba(255,255,255,0.025)"; ctx.fillRect(0, 0, width, height);
    if (inspectMode) { ctx.fillStyle = '#fff'; ctx.font = '900 20px -apple-system,BlinkMacSystemFont,Segoe UI'; ctx.fillText('K線走勢', 18, 32); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '12px -apple-system,BlinkMacSystemFont,Segoe UI'; ctx.fillText('長按模式｜左右滑動切換K棒', 18, 52); }
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const y = padT + (priceH / 3) * i; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(padL, volTop); ctx.lineTo(width - padR, volTop); ctx.stroke();
    const yOf = (price) => padT + ((high - price) / range) * priceH, xOf = (index) => padL + index * step + step / 2;
    if (Number.isFinite(vwap)) drawLevel(ctx, yOf(vwap), "VWAP", vwap, "rgba(40,215,255,.9)", width, padL, padR); drawLevel(ctx, yOf(resistance), "壓力", resistance, "rgba(255,77,109,.92)", width, padL, padR); drawLevel(ctx, yOf(support), "支撐", support, "rgba(35,209,139,.92)", width, padL, padR);
    data.forEach((bar, index) => { const x = xOf(index), up = Number(bar.close) >= Number(bar.open), color = up ? "#ff4d6d" : "#23d18b"; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, yOf(bar.high)); ctx.lineTo(x, yOf(bar.low)); ctx.stroke(); const top = yOf(Math.max(bar.open, bar.close)), bottom = yOf(Math.min(bar.open, bar.close)); ctx.fillRect(x - candleW / 2, top, candleW, Math.max(bottom - top, 2)); const vh = (Number(bar.volume || 0) / maxVol) * volH; ctx.globalAlpha = 0.55; ctx.fillRect(x - candleW / 2, volTop + volH - vh, candleW, vh); ctx.globalAlpha = 1; const avgv = avgVolume(data, index); if (!inspectMode && avgv && Number(bar.volume || 0) > avgv * 1.6) drawTag(ctx, x, volTop + volH - vh - 4, "爆量", "#ffd166"); if (!inspectMode && isBreakout(data, index) && up) { drawArrow(ctx, x, yOf(bar.high), "#ff4d6d"); drawTag(ctx, x, yOf(bar.high) - 12, "突破", "#ff4d6d"); } });
    drawMA(ctx, data, 5, xOf, yOf, "#ffd166"); drawMA(ctx, data, 10, xOf, yOf, "#4f8cff"); drawCrosshair(ctx, data, hoverIndex, xOf, yOf, width, height, padL, padR, padT, volTop);
    ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI"; ctx.fillText(fmt(high), 6, padT + 8); ctx.fillText(fmt(low), 6, padT + priceH);
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("MA5", padL, height - 12); ctx.fillStyle = "#ffd166"; ctx.fillText("—", padL + 32, height - 12); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("MA10", padL + 58, height - 12); ctx.fillStyle = "#4f8cff"; ctx.fillText("—", padL + 98, height - 12); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("VWAP", padL + 124, height - 12); ctx.fillStyle = "#28d7ff"; ctx.fillText("—", padL + 166, height - 12);
  }

  window.drawKline = function patchedDrawKline(items) { drawScrollableKline(items); };
  function updateHover(event) { if (!lastView) return; const rect = document.querySelector('#klineCanvas').getBoundingClientRect(); const x = event.clientX - rect.left; hoverIndex = clamp(Math.round((x - lastView.padL - lastView.step / 2) / lastView.step), 0, lastView.data.length - 1); }
  function bind() { const canvas = document.querySelector("#klineCanvas"); if (!canvas || canvas.dataset.panReady === "1") return; canvas.dataset.panReady = "1"; ensureInspectButton(); canvas.addEventListener("pointerdown", (event) => { dragging = true; startX = event.clientX; startPan = pan; canvas.setPointerCapture?.(event.pointerId); updateHover(event); clearTimeout(longPressTimer); longPressTimer = setTimeout(() => enterInspectMode(event), 420); }); canvas.addEventListener("pointermove", (event) => { if (!lastItems.length) return; updateHover(event); const dx = event.clientX - startX; if (Math.abs(dx) > 8) clearTimeout(longPressTimer); if (dragging) { pan = Math.max(0, startPan + dx / 10); } drawScrollableKline(lastItems); }); const end = () => { dragging = false; clearTimeout(longPressTimer); }; canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", () => { if (!inspectMode) hoverIndex = null; dragging = false; clearTimeout(longPressTimer); if (lastItems.length) drawScrollableKline(lastItems); }); }
  window.addEventListener("load", bind); setTimeout(bind, 500); window.addEventListener("resize", () => { if (lastItems.length) drawScrollableKline(lastItems); });
})();
