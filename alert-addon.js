(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  let pushStatus = '';
  let pushing = false;

  function codeNow() {
    const label = ($('#stockCodeLabel')?.textContent || '') + ' ' + ($('#proCode')?.value || '');
    return (label.match(/\d{4,6}/) || [''])[0] || 'STX';
  }

  function ensure() {
    if ($('#alertPanel')) return;
    const host = $('#fusionPanel') || $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'alertPanel';
    el.className = 'entry-summary-panel terminal-alert-panel';
    el.innerHTML = '<span>盤中警報</span><strong id="alertTitle">等待訊號</strong><p id="alertReason">搜尋股票後，系統會監控多因子變化。</p><p id="discordPushStatus" style="margin-top:8px;font-weight:800;color:#f8d36b">Discord：等待觸發</p><div id="alertTags" class="analysis-tags"><span>等待資料</span></div>';
    host.parentNode.insertBefore(el, host.nextSibling);
  }

  function ensureStatusField() {
    const p = $('#alertPanel');
    if (!p || $('#discordPushStatus')) return;
    const status = document.createElement('p');
    status.id = 'discordPushStatus';
    status.style.cssText = 'margin-top:8px;font-weight:800;color:#f8d36b';
    status.textContent = 'Discord：等待觸發';
    const tags = $('#alertTags');
    p.insertBefore(status, tags || null);
  }

  function firstNum(text) {
    const m = String(text || '').match(/[+-]?\d+/);
    return m ? Number(m[0]) : null;
  }

  function fusionScore() { return firstNum($('#fusionTitle')?.textContent || ''); }
  function chipScore() { return firstNum($('#chipsSummaryTitle')?.textContent || ''); }
  function newsScore() { return firstNum($('#newsSummaryTitle')?.textContent || ''); }
  function signalText() { return (($('#proSignal')?.textContent || '') + ' ' + ($('#entrySummaryReason')?.textContent || '')).trim(); }

  async function pushDiscord(code, score, title, tags) {
    if (pushing) return;
    const key = `stx_push_v3_${code}_${title}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 60 * 1000) {
      pushStatus = 'Discord：冷卻中';
      return;
    }

    pushing = true;
    pushStatus = 'Discord：送出中...';
    const messageText = tags.length ? tags.join('｜') : '盤中訊號';
    const url = `${API}/api/discord-alert?code=${encodeURIComponent(code)}&score=${encodeURIComponent(score)}&title=${encodeURIComponent(title)}&message=${encodeURIComponent(messageText)}&t=${Date.now()}`;

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      localStorage.setItem(key, String(Date.now()));
      pushStatus = 'Discord：已送出';
    } catch (e) {
      pushStatus = 'Discord：送出失敗';
    } finally {
      pushing = false;
    }
  }

  function render() {
    ensure();
    ensureStatusField();
    const f = fusionScore();
    const c = chipScore();
    const n = newsScore();
    const sig = signalText();
    const tags = [];
    let level = 'watch';
    let title = '等待確認';
    let reason = '尚未出現明確盤中警報。';

    if (f !== null && f >= 88) { title = '🔥 強勢警報'; reason = '多因子總分進入強勢區，仍需確認回測不破。'; level = 'good'; tags.push('總分強勢'); }
    else if (f !== null && f >= 78) { title = '✅ 可觀察警報'; reason = '多因子分數偏多，可等待低風險進場點。'; level = 'good'; tags.push('可觀察'); }
    else if (f !== null && f < 60) { title = '❌ 風險警報'; reason = '多因子分數不足，避免追價與硬做。'; level = 'bad'; tags.push('分數不足'); }

    if (c !== null && c >= 18) tags.push('法人偏多');
    if (c !== null && c <= -18) { tags.push('法人偏空'); level = 'bad'; }
    if (n !== null && n >= 10) tags.push('新聞利多');
    if (n !== null && n <= -10) { tags.push('新聞利空'); level = 'bad'; }
    if (/停損|危險|禁止|跌破/.test(sig)) { tags.push('技術風險'); level = 'bad'; }
    if (/回測不破|突破|VWAP|量增|技術轉強/.test(sig)) tags.push('技術轉強');

    const p = $('#alertPanel');
    if (p) p.className = 'entry-summary-panel terminal-alert-panel ' + (level === 'good' ? 'good' : level === 'bad' ? 'bad' : '');
    if ($('#alertTitle')) $('#alertTitle').textContent = title;
    if ($('#alertReason')) $('#alertReason').textContent = reason;
    if ($('#discordPushStatus')) $('#discordPushStatus').textContent = pushStatus || 'Discord：等待觸發';
    if ($('#alertTags')) $('#alertTags').innerHTML = tags.length ? tags.slice(0, 8).map(x => `<span>${x}</span>`).join('') : '<span>等待資料</span>';

    if (f !== null && f >= 78 && level === 'good') {
      pushDiscord(codeNow(), f, f >= 88 ? 'STX強勢警報' : 'STX可觀察警報', tags);
    }
  }

  window.STX_ALERT_RENDER = render;
  window.addEventListener('load', () => setInterval(render, 1500));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(render, 2600);
  }, true);
})();
