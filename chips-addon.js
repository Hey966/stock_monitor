(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  function codeNow() {
    const label = ($('#stockCodeLabel')?.textContent || '') + ' ' + ($('#proCode')?.value || '');
    return (label.match(/\d{4,6}/) || [''])[0];
  }
  function fmt(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? Math.round(n).toLocaleString('zh-TW') : '-';
  }
  function esc(t) {
    return String(t || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function ensure() {
    if ($('#chipsSummaryPanel')) return;
    const host = $('#newsSummaryPanel') || $('#sellSummaryPanel') || $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'chipsSummaryPanel';
    el.className = 'entry-summary-panel terminal-chips-panel';
    el.innerHTML = '<span>主力籌碼判斷</span><strong id="chipsSummaryTitle">等待籌碼</strong><p id="chipsSummaryReason">搜尋股票後讀取法人籌碼。</p><div id="chipsTags" class="analysis-tags"><span>等待資料</span></div>';
    host.parentNode.insertBefore(el, host.nextSibling);
  }
  function render(data) {
    ensure();
    const score = Number(data.chipScore || 0);
    const p = $('#chipsSummaryPanel');
    if (p) p.className = 'entry-summary-panel terminal-chips-panel ' + (score >= 18 ? 'good' : score <= -18 ? 'bad' : '');
    if ($('#chipsSummaryTitle')) $('#chipsSummaryTitle').textContent = `${data.status || '法人籌碼中性'} ${score >= 0 ? '+' : ''}${score}`;
    if ($('#chipsSummaryReason')) $('#chipsSummaryReason').textContent = `外資 ${fmt(data.foreign)}｜投信 ${fmt(data.investment)}｜自營 ${fmt(data.dealer)}`;
    const tags = [...(data.summary || []), ...(data.risk || [])].slice(0, 8);
    if ($('#chipsTags')) $('#chipsTags').innerHTML = tags.length ? tags.map(x => `<span>${esc(x)}</span>`).join('') : '<span>籌碼中性</span>';
  }
  async function update(force = false) {
    ensure();
    const code = codeNow();
    if (!code) return;
    const key = `stx_chips_${code}`;
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (!force && cached && Date.now() - cached.ts < 300000) return render(cached.data);
    if ($('#chipsSummaryTitle')) $('#chipsSummaryTitle').textContent = '籌碼更新中';
    try {
      const res = await fetch(`${API}/api/chips?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
      render(data);
    } catch (e) {
      if ($('#chipsSummaryTitle')) $('#chipsSummaryTitle').textContent = '籌碼讀取失敗';
      if ($('#chipsSummaryReason')) $('#chipsSummaryReason').textContent = '請確認 Render 已部署完成後再刷新。';
    }
  }
  window.STX_UPDATE_CHIPS = update;
  window.addEventListener('load', () => setTimeout(() => update(false), 1400));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(() => update(true), 1600);
  }, true);
})();
