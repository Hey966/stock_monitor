(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const ALERT_THRESHOLD = 85;
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
    const host = $('#proEnginePanel') || $('#fusionPanel') || $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'alertPanel';
    el.className = 'entry-summary-panel terminal-alert-panel';
    el.innerHTML = '<span>Discord 專業警報</span><strong id="alertTitle">等待 Pro Engine</strong><p id="alertReason">只會推播 score > 85 且無 Trap 的訊號。</p><p id="discordPushStatus" style="margin-top:8px;font-weight:800;color:#f8d36b">Discord：等待 Pro Engine</p><div id="alertTags" class="analysis-tags"><span>等待資料</span></div>';
    host.parentNode.insertBefore(el, host.nextSibling);
  }

  function ensureStatusField() {
    const p = $('#alertPanel') || Array.from(document.querySelectorAll('.entry-summary-panel')).find(x => /Discord|盤中警報/.test(x.innerText || ''));
    if (!p || $('#discordPushStatus')) return;
    const status = document.createElement('p');
    status.id = 'discordPushStatus';
    status.style.cssText = 'margin-top:8px;font-weight:800;color:#f8d36b';
    status.textContent = pushStatus || 'Discord：等待 Pro Engine';
    const tags = $('#alertTags') || p.querySelector('.analysis-tags');
    p.insertBefore(status, tags || null);
  }

  function firstNum(text) {
    const m = String(text || '').match(/[+-]?\d+/);
    return m ? Number(m[0]) : null;
  }

  function fallbackScore() {
    const body = document.body?.innerText || '';
    const patterns = [
      /STX Pro Engine v\d+[\s\S]{0,120}(?:｜|\|)\s*(\d{1,3})\b/,
      /多因子總分[\s\S]{0,160}(?:\||｜)\s*(\d{1,3})\b/,
      /強勢可觀察進場\s*(?:\||｜)\s*(\d{1,3})\b/
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m) {
        const value = Number(m[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
      }
    }
    return null;
  }

  function getPro() {
    const pro = window.STX_PRO_ANALYSIS || null;
    if (pro && typeof pro === 'object') return pro;
    const score = fallbackScore();
    if (score === null) return null;
    return { score, level: 'fallback', signals: {}, reasons: [], risks: [], traps: [] };
  }

  function isBlocked(pro) {
    return !!(
      pro?.level === 'blocked' ||
      pro?.signals?.trap_block === true ||
      (Array.isArray(pro?.traps) && pro.traps.length > 0)
    );
  }

  function canPush(pro) {
    if (!pro) return false;
    const score = Number(pro.score || 0);
    return score > ALERT_THRESHOLD && !isBlocked(pro);
  }

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
    const key = `stx_pro_push_v8_${code}_${title}_${score}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 60 * 1000) {
      setStatus('Discord：冷卻中');
      return;
    }

    pushing = true;
    setStatus('Discord：送出中...');
    const messageText = tags.length ? tags.join('｜') : 'Pro Engine v3 高品質訊號';
    const url = `${API}/api/discord-alert?code=${encodeURIComponent(code)}&score=${encodeURIComponent(score)}&title=${encodeURIComponent(title)}&message=${encodeURIComponent(messageText)}&t=${Date.now()}`;

    let sent = false;
    try {
      await fetch(url, { cache: 'no-store', mode: 'no-cors' });
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
    const pro = getPro();
    const score = pro ? Number(pro.score || 0) : null;
    const blocked = pro ? isBlocked(pro) : false;
    const tags = [];

    let level = 'watch';
    let title = '等待 Pro Engine';
    let reason = '尚未取得 Pro Engine v3 後端分析。';

    if (pro) {
      if (blocked) {
        level = 'bad';
        title = '⛔ Trap Block 禁止推播';
        reason = `Pro 分數 ${score}，但偵測到陷阱：${(pro.traps || pro.signals?.trap_reasons || ['blocked']).join('、')}`;
        tags.push('Trap Block', ...(pro.traps || pro.signals?.trap_reasons || []));
        setStatus('Discord：Pro Engine 阻擋');
      } else if (score > ALERT_THRESHOLD) {
        level = 'good';
        title = score >= 88 ? '🔥 Pro 強勢警報' : '✅ Pro 可觀察警報';
        reason = `Pro 分數 ${score} > ${ALERT_THRESHOLD}，且沒有 Trap，符合推播條件。`;
        tags.push('Pro Engine v3', ...(pro.reasons || []).slice(0, 5));
      } else {
        level = score >= 76 ? 'good' : score < 60 ? 'bad' : 'watch';
        title = score >= 76 ? '✅ Pro 可觀察但不推播' : score < 60 ? '❌ Pro 風險警報' : '⚪ Pro 等待訊號';
        reason = `Pro 分數 ${score}，未大於 ${ALERT_THRESHOLD}，不推播 Discord。`;
        tags.push('未達推播門檻');
        if (!pushStatus || /等待|阻擋/.test(pushStatus)) setStatus(`Discord：等待 > ${ALERT_THRESHOLD}`);
      }
    }

    const p = $('#alertPanel');
    if (p) p.className = 'entry-summary-panel terminal-alert-panel ' + (level === 'good' ? 'good' : level === 'bad' ? 'bad' : '');
    if ($('#alertTitle')) $('#alertTitle').textContent = title;
    if ($('#alertReason')) $('#alertReason').textContent = reason;
    if ($('#alertTags')) $('#alertTags').innerHTML = tags.length ? tags.slice(0, 8).map(x => `<span>${x}</span>`).join('') : '<span>等待資料</span>';

    if (canPush(pro)) {
      pushDiscord(codeNow(), score, score >= 88 ? 'STX Pro 強勢警報' : 'STX Pro 可觀察警報', tags);
    }
  }

  window.STX_ALERT_RENDER = render;
  window.STX_TEST_DISCORD = () => {
    const pro = getPro();
    pushDiscord(codeNow(), Number(pro?.score || 99), 'STX手動測試', ['手動測試']);
  };
  window.addEventListener('stx-pro-analysis', () => setTimeout(render, 200));
  window.addEventListener('load', () => setInterval(render, 1200));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(render, 2200);
  }, true);
})();
