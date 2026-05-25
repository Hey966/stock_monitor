(() => {
  const $ = (s) => document.querySelector(s);
  function ensure() {
    if ($('#fusionPanel')) return;
    const host = $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'fusionPanel';
    el.className = 'entry-summary-panel terminal-main-signal';
    el.innerHTML = '<span>多因子總分</span><strong id="fusionTitle">等待整合</strong><p id="fusionReason">技術、新聞、籌碼資料更新後自動計算。</p><div id="fusionGrid" class="sell-cost-grid"></div>';
    host.parentNode.insertBefore(el, host);
  }
  function numText(sel) {
    const t = $(sel)?.textContent || '';
    const m = t.match(/[+-]?\d+/);
    return m ? Number(m[0]) : null;
  }
  function techScore() {
    const text = ($('#entrySummaryReason')?.textContent || '') + ' ' + ($('#analysisSummary')?.textContent || '');
    const m = text.match(/分數\s*(\d{1,3})/);
    return m ? Number(m[1]) : null;
  }
  function newsBoost() {
    const t = ($('#newsSummaryTitle')?.textContent || '') + ' ' + ($('#newsTotalScore')?.textContent || '');
    const m1 = t.match(/新聞修正\s*([+-]?\d+)/);
    if (m1) return Number(m1[1]);
    const m2 = t.match(/新聞[^+-]*([+-]\d+)/);
    return m2 ? Math.max(-12, Math.min(12, Math.round(Number(m2[1]) * 0.4))) : 0;
  }
  function chipBoost() {
    const score = numText('#chipsSummaryTitle');
    return score === null ? 0 : Math.max(-15, Math.min(15, Math.round(score * 0.35)));
  }
  function marketBoost() {
    const score = numText('#marketScore');
    if (score === null) return 0;
    if (score >= 70) return 5;
    if (score <= 45) return -5;
    return 0;
  }
  function render() {
    ensure();
    const tech = techScore();
    const nb = newsBoost();
    const cb = chipBoost();
    const mb = marketBoost();
    if (tech === null) return;
    const total = Math.max(0, Math.min(100, tech + nb + cb + mb));
    let title = '❌ 禁止追價';
    if (total >= 88) title = '🔥 強勢可觀察進場';
    else if (total >= 78) title = '✅ 可觀察進場';
    else if (total >= 68) title = '⚠ 等待回測確認';
    const panel = $('#fusionPanel');
    if (panel) panel.className = 'entry-summary-panel terminal-main-signal ' + (total >= 78 ? 'good' : total < 60 ? 'bad' : '');
    if ($('#fusionTitle')) $('#fusionTitle').textContent = `${title}｜${total}`;
    if ($('#fusionReason')) $('#fusionReason').textContent = `技術為主，新聞與籌碼只做輔助修正；未回測不破不追第一根急拉。`;
    if ($('#fusionGrid')) $('#fusionGrid').innerHTML = `<span>技術<b>${tech}</b></span><span>新聞<b>${nb >= 0 ? '+' : ''}${nb}</b></span><span>籌碼<b>${cb >= 0 ? '+' : ''}${cb}</b></span><span>大盤<b>${mb >= 0 ? '+' : ''}${mb}</b></span>`;
    if ($('#entrySummaryTitle')) $('#entrySummaryTitle').textContent = title;
  }
  window.STX_FUSION_RENDER = render;
  window.addEventListener('load', () => setInterval(render, 1200));
  document.addEventListener('click', e => { if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(render, 2200); }, true);
})();
