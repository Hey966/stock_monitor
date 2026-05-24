(() => {
  let pan = 0;
  let startX = 0;
  let startPan = 0;
  let dragging = false;
  let lastItems = [];
  let hoverIndex = null;
  let lastView = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fmt(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, "");
  }

  function fmtTime(ts) {
    if (!ts) return "-";
    const text = String(ts);
    const m = text.match(/(\d{2}:\d{2})/);
    if (m) return m[1];
    return text.slice(11, 16) || text;
  }

  function drawMA(ctx, data, period, xOf, yOf, color) {
    if (data.length < period) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    data.forEach((bar, index) => {
      if (index < period - 1) return;
      const avg = data.slice(index - period + 1, index + 1).reduce((sum, item) => sum + Number(item.close || 0), 0) / period;
      const x = xOf(index);
      const y = yOf(avg);
      if (index === period - 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawCrosshair(ctx, data, index, xOf, yOf, width, height, padL, padR, padT, priceH) {
    if (index == null || !data[index]) return;
    const bar = data[index];
    const x = xOf(index);
    const y = yOf(bar.close);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.38)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, height - 24);
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(8,11,18,.92)";
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    const boxW = Math.min(width - 24, 268);
    const boxH = 62;
    const boxX = x > width / 2 ? 10 : width - boxW - 10;
    const boxY = 10;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    const up = bar.close >= bar.open;
    ctx.fillStyle = up ? "#ff4d6d" : "#23d18b";
    ctx.font = "700 12px -apple-system,BlinkMacSystemFont,Segoe UI";
    ctx.fillText(`${fmtTime(bar.ts)}  ${up ? "紅K" : "黑K"}`, boxX + 10, boxY + 18);
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI";
    ctx.fillText(`開 ${fmt(bar.open)}  高 ${fmt(bar.high)}  低 ${fmt(bar.low)}  收 ${fmt(bar.close)}`, boxX + 10, boxY + 38);
    ctx.fillStyle = "rgba(255,255,255,.58)";
    ctx.fillText(`量 ${fmt(bar.volume)}`, boxX + 10, boxY + 56);

    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillRect(width - 58, y - 11, 52, 22);
    ctx.fillStyle = "#070a12";
    ctx.font = "700 11px -apple-system,BlinkMacSystemFont,Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(fmt(bar.close), width - 32, y + 4);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawScrollableKline(items) {
    const canvas = document.querySelector("#klineCanvas");
    if (!canvas || !items?.length) return;
    lastItems = items;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width || 320, 320);
    const height = 260;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padL = 38;
    const padR = 12;
    const padT = 18;
    const priceH = 176;
    const volTop = 204;
    const volH = 38;
    const candleGap = 3;
    const candleW = 7;
    const step = candleW + candleGap;
    const visible = Math.max(18, Math.floor((width - padL - padR) / step));
    const maxPan = Math.max(0, items.length - visible);
    pan = clamp(pan, 0, maxPan);

    const start = Math.max(0, items.length - visible - Math.round(pan));
    const data = items.slice(start, start + visible);
    const high = Math.max(...data.map((item) => Number(item.high || 0)));
    const low = Math.min(...data.map((item) => Number(item.low || 0)));
    const maxVol = Math.max(...data.map((item) => Number(item.volume || 0)), 1);
    const range = Math.max(high - low, 0.01);
    hoverIndex = hoverIndex == null ? null : clamp(hoverIndex, 0, data.length - 1);
    lastView = { data, padL, padR, padT, priceH, step, candleW, width, height };

    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = padT + (priceH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(width - padR, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(padL, volTop);
    ctx.lineTo(width - padR, volTop);
    ctx.stroke();

    const yOf = (price) => padT + ((high - price) / range) * priceH;
    const xOf = (index) => padL + index * step + step / 2;

    data.forEach((bar, index) => {
      const x = xOf(index);
      const up = Number(bar.close) >= Number(bar.open);
      const color = up ? "#ff4d6d" : "#23d18b";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yOf(bar.high));
      ctx.lineTo(x, yOf(bar.low));
      ctx.stroke();
      const top = yOf(Math.max(bar.open, bar.close));
      const bottom = yOf(Math.min(bar.open, bar.close));
      ctx.fillRect(x - candleW / 2, top, candleW, Math.max(bottom - top, 2));
      const vh = (Number(bar.volume || 0) / maxVol) * volH;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x - candleW / 2, volTop + volH - vh, candleW, vh);
      ctx.globalAlpha = 1;
    });

    drawMA(ctx, data, 5, xOf, yOf, "#ffd166");
    drawMA(ctx, data, 10, xOf, yOf, "#4f8cff");
    drawCrosshair(ctx, data, hoverIndex, xOf, yOf, width, height, padL, padR, padT, priceH);

    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI";
    ctx.fillText(fmt(high), 6, padT + 8);
    ctx.fillText(fmt(low), 6, padT + priceH);

    ctx.fillStyle = "rgba(255,255,255,.44)";
    ctx.fillText("MA5", padL, height - 8);
    ctx.fillStyle = "#ffd166";
    ctx.fillText("—", padL + 32, height - 8);
    ctx.fillStyle = "rgba(255,255,255,.44)";
    ctx.fillText("MA10", padL + 58, height - 8);
    ctx.fillStyle = "#4f8cff";
    ctx.fillText("—", padL + 98, height - 8);

    const hint = maxPan > 0 ? (pan === 0 ? "最新" : `往前 ${Math.round(pan)} 根`) : "資料較少";
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.textAlign = "right";
    ctx.fillText(hint, width - padR, height - 8);
    ctx.textAlign = "left";
  }

  window.drawKline = function patchedDrawKline(items) {
    drawScrollableKline(items);
  };

  function bind() {
    const canvas = document.querySelector("#klineCanvas");
    if (!canvas || canvas.dataset.panReady === "1") return;
    canvas.dataset.panReady = "1";

    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startPan = pan;
      canvas.setPointerCapture?.(event.pointerId);
      updateHover(event);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!lastItems.length) return;
      updateHover(event);
      if (dragging) {
        const dx = event.clientX - startX;
        pan = Math.max(0, startPan + dx / 10);
      }
      drawScrollableKline(lastItems);
    });

    function updateHover(event) {
      if (!lastView) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      hoverIndex = clamp(Math.round((x - lastView.padL - lastView.step / 2) / lastView.step), 0, lastView.data.length - 1);
    }

    const end = () => { dragging = false; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { dragging = false; hoverIndex = null; if (lastItems.length) drawScrollableKline(lastItems); });
  }

  window.addEventListener("load", bind);
  setTimeout(bind, 500);
  window.addEventListener("resize", () => {
    if (lastItems.length) drawScrollableKline(lastItems);
  });
})();
