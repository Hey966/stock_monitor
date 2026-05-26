(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  let lastCode = '';
  let loading = false;

  function codeNow() {
    const input = ($('#proCode')?.value || '').trim();
    const label = ($('#stockCodeLabel')?.textContent || '').trim();
    return (input.match(/\d{4,6}/) || label.match(/\d{4,6}/) || [''])[0];
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text ?? '-';
  }

  function tagHtml(items) {
    if (!items || !items.length) return '<span>無</span>';
    return items.slice(0, 8).map(x => `<span>${x}</span>`).join('');
  }

  function ensureProPanel() {
    if ($('#proEnginePanel')) return;
    const host = $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'proEnginePanel';
    el.className = 'entry-summary-panel terminal-main-signal';
    el.innerHTML = '<span>STX Pro Engine v2</span><strong id="proEngineTitle">等待後端分析</strong><p id="proEngineReason">搜尋股票後，後端會計算 VWAP、量能、五檔、風險與進出場。</p><div id="proEngineTags" class="analysis-tags"><span>等待資料</span></div>';
    host.parentNode.insertBefore(el, host);
  }

  function render(data) {
    ensureProPanel();
    const score = Number(data.score || 0);
    const title = `${data.action || '等待'}｜${score}`;
    const reason = (data.reasons || []).join('；') || data.message || '後端分析完成。';
    const risks = data.risks || [];

    setText('#proEngineTitle', title);
    setText('#proEngineReason', reason);
    if ($('#proEngineTags')) $('#proEngineTags').innerHTML = tagHtml([...(data.reasons || []), ...risks.map(x => '風險：' + x)]);

    setText('#entrySummaryTitle', title);
    setText('#entrySummaryReason', reason);
    setText('#analysisSummary', `${data.action || '-'}｜分數 ${score}｜${data.message || ''}`);
    if ($('#analysisTags')) $('#analysisTags').innerHTML = tagHtml(data.reasons || []);
    if ($('#riskTags')) $('#riskTags').innerHTML = tagHtml(risks);

    setText('#aiEntry', data.entry_zone || '-');
    setText('#aiEntryText', data.entry ? '符合條件，但仍需等回測不破。' : '尚未達立即進場條件。');
    setText('#aiStop', data.stop || '-');
    setText('#aiStopText', '跌破停損，不凹單。');
    setText('#aiTarget', data.target || '-');
    setText('#aiTargetText', '先看壓力，突破需量能延續。');

    setText('#planEntry', data.entry_zone || '-');
    setText('#planEntryText', data.entry ? '等待回測不破後確認。' : '目前以觀察為主。');
    setText('#planStop', data.stop || '-');
    setText('#planStopText', '跌破就出，不加碼攤平。');
    setText('#planTarget', data.target || '-');
    setText('#planTargetText', '到壓力區先減碼或移動停利。');

    window.STX_PRO_ANALYSIS = data;
    window.dispatchEvent(new CustomEvent('stx-pro-analysis', { detail: data }));
  }

  async function run(force = false) {
    const code = codeNow();
    if (!code) return;
    if (loading) return;
    if (!force && code === lastCode && window.STX_PRO_ANALYSIS) return;
    loading = true;
    lastCode = code;
    ensureProPanel();
    setText('#proEngineTitle', '後端分析中...');
    setText('#proEngineReason', '正在讀取 Shioaji 快照、K 線與 Pro Engine v2。');
    try {
      const res = await fetch(`${API}/api/pro-analysis?code=${encodeURIComponent(code)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data);
    } catch (e) {
      setText('#proEngineTitle', '後端分析失敗');
      setText('#proEngineReason', '請確認 Render 已部署最新版，或稍後再試。');
    } finally {
      loading = false;
    }
  }

  window.STX_RUN_PRO_ENGINE = () => run(true);
  window.addEventListener('load', () => setInterval(() => run(false), 8000));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(() => run(true), 1800);
  }, true);
})();
