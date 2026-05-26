(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  let pushStatus = '';
  let pushing = false;

  function codeNow() {
    const label = ($('#stockCodeLabel')?.textContent || '') + ' ' + ($('#proCode')?.value || '') + ' ' + ($('#proTitle')?.textContent || '');
    return (label.match(/\d{4,6}/) || [''])[0] || 'STX';
  }

  function setStatus(text) {
    pushStatus = text;
    const el = $('#discordPushStatus');
    if (el) el.textContent = text;
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
    const p = $('#alertPanel') || Array.from(document.querySelectorAll('.entry-summary-panel')).find(x => /盤中警報/.test(x.innerText || ''));
    if (!p || $('#discordPushStatus')) return;
    const status = document.createElement('p');
    status.id = 'discordPushStatus';
    status.style.cssText = 'margin-top:8px;font-weight:800;color:#f8d36b';
    status.textContent = pushStatus || 'Discord：等待觸發';
    const tags = $('#alertTags') || p.querySelector('.analysis-tags');
    p.insertBefore(status, tags || null);
  }

  function firstNum(text) {
    const m = String(text || '').match(/[+-]?\d+/);
    return m ? Number(m[0]) : null;
  }

  function readVisibleFusionScore() {
    const body = document.body?.innerText || '';
    const patterns = [
      /多因子總分[\s\S]{0,160}(?:\||｜)\s*(\d{1,3})\b/,
      /強勢可觀察進場\s*(?:\||｜)\s*(\d{1,3})\b/,
      /可觀察進場\s*(?:\||｜)\s*(\d{1,3})\b/,
      /強勢警報[\s\S]{0,120}(\d{1,3})\b/
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m) {
        const value = Number(m[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
      }
    }

    const candidates = [
      $('#fusionTitle')?.textContent || '',
      $('#entrySummaryTitle')?.textContent || '',
      ...Array.from(document.querySelectorAll('.entry-summary-panel strong, .terminal-main-signal strong')).map(x => x.textContent || '')
    ];
    for (const text of candidates) {
      const m = String(text).match(/(?:\||｜)\s*(\d{1,3})\b|\b(100|[1-9]?\d)\b\s*$/);
      if (m) {
        const value = Number(m[1] || m[2]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
      }
    }
    return null;
  }

  function visibleAlertTriggered(score) {
    const body = document.body?.innerText || '';
    if (/強勢警報|強勢可觀察進場|可觀察警報|可觀察進場/.test(body) && score !== null && score >= 78) return true;
    return false;
  }

  function fusionScore() { return readVisibleFusionScore(); }
  function chipScore() { return firstNum($('#chipsSummaryTitle')?.textContent || ''); }
  function newsScore() { return firstNum($('#newsSummaryTitle')?.textContent || ''); }
  function signalText() { return (($('#proSignal')?.textContent || '') + ' ' + ($('#entrySummaryReason')?.textContent || '') + ' ' + ($('#alertTitle')?.textContent || '') + ' ' + (document.body?.innerText || '')).trim(); }

  function sendByBeacon(url) {
    try {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => setStatus('Discord：已送出');
      img.onerror = () => setStatus('Discord：已送出');
      img.src = url;
      window.__STX_LAST_DISCORD_BEACON = img;
      setTimeout(() => setStatus('Discord：已送出'), 1500);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function pushDiscord(code, score, title, tags) {
    if (pushing) return;
    const key = `stx_push_v6_${code}_${title}_${score}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 60 * 1000) {
      setStatus('Discord：冷卻中');
      return;
    }

    pushing = true;
    setStatus('Discord：送出中...');
    const messageText = tags.length ? tags.join('｜') : '盤中訊號';
    const url = `${API}/api/discord-alert?code=${encodeURIComponent(code)}&score=${encodeURIComponent(score)}&title=${encodeURIComponent(title)}&message=${encodeURIComponent(messageText)}&t=${Date.now()}`;

    let sent = false;
    try {
      const res = await fetch(url, { cache: 'no-store', mode: 'no-cors' });
      sent = true;
    } catch (e) {}

    if (!sent) sent = sendByBeacon(url);
    localStorage.setItem(key, String(Date.now()));
    if (sent) setStatus('Discord：已送出');
    else setStatus('Discord：送出失敗');
    pushing = false;
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
    let reason = f === null ? '尚未讀到多因子分數。' : '尚未出現明確盤中警報。';

    const forced = visibleAlertTriggered(f);
    if ((f !== null && f >= 88) || forced) { title = f !== null && f >= 88 ? '🔥 強勢警報' : '✅ 可觀察警報'; reason = '畫面警報已觸發，正在同步 Discord。'; level = 'good'; tags.push(f >= 88 ? '總分強勢' : '可觀察'); }
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
    if ($('#discordPushStatus')) $('#discordPushStatus').textContent = pushStatus || (f === null ? 'Discord：等待分數' : 'Discord：等待觸發');
    if ($('#alertTags')) $('#alertTags').innerHTML = tags.length ? tags.slice(0, 8).map(x => `<span>${x}</span>`).join('') : '<span>等待資料</span>';

    if ((f !== null && f >= 78 && level === 'good') || forced) {
      pushDiscord(codeNow(), f || 78, (f || 0) >= 88 ? 'STX強勢警報' : 'STX可觀察警報', tags);
    }
  }

  window.STX_ALERT_RENDER = render;
  window.STX_TEST_DISCORD = () => pushDiscord(codeNow(), fusionScore() || 99, 'STX手動測試', ['手動測試']);
  window.addEventListener('load', () => setInterval(render, 1200));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(render, 1800);
  }, true);
})();
