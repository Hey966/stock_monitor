(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  function ensureDashboard() {
    if ($('#stxDashboardV5')) return;
    const host = $('#page-search') || $('.modern-page.active') || document.querySelector('main');
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'stxDashboardV5';
    panel.className = 'entry-summary-panel terminal-main-signal';
    panel.innerHTML = `
      <span>STX Dashboard v5</span>
      <strong id="dashEngineVersion">等待 Pro Engine</strong>
      <p id="dashSummary">整合 Pro Engine、Market Sync、Risk Cap 與 Replay 勝率。</p>
      <div class="quote-detail-grid" style="margin-top:12px">
        <article><span>Replay Signals</span><b id="dashReplaySignals">-</b></article>
        <article><span>Win Rate</span><b id="dashWinRate">-</b></article>
        <article><span>Avg Return</span><b id="dashAvgReturn">-</b></article>
        <article><span>Trap Block</span><b id="dashTrapCount">-</b></article>
        <article><span>Market Sync</span><b id="dashMarketSync">-</b></article>
        <article><span>Risk Cap</span><b id="dashRiskCap">-</b></article>
      </div>
      <div id="dashRecentSignals" class="analysis-tags" style="margin-top:12px"><span>等待 Replay</span></div>
    `;
    host.insertBefore(panel, host.firstChild?.nextSibling || host.firstChild);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text ?? '-';
  }

  function renderPro(data) {
    ensureDashboard();
    if (!data) return;
    setText('#dashEngineVersion', data.message || 'STX Pro Engine v5 Dashboard');
    const ms = data.signals?.market_sync;
    const cap = data.signals?.orderbook_risk_cap;
    setText('#dashMarketSync', ms?.status ? `${ms.status} ${ms.score ?? ''}` : '-');
    setText('#dashRiskCap', cap ? String(cap) : '無');
    const trap = data.signals?.trap_block ? 'Trap Block' : 'No Trap';
    setText('#dashSummary', `${data.name || data.code || ''}｜Score ${data.score ?? '-'}｜${data.action || '-'}｜${trap}`);
  }

  function renderStats(stats) {
    ensureDashboard();
    if (!stats || !stats.ok) return;
    setText('#dashReplaySignals', stats.total_signals ?? 0);
    setText('#dashWinRate', stats.win_rate === null || stats.win_rate === undefined ? '-' : `${stats.win_rate}%`);
    setText('#dashAvgReturn', stats.avg_latest_pct === null || stats.avg_latest_pct === undefined ? '-' : `${stats.avg_latest_pct}%`);
    setText('#dashTrapCount', stats.trap_block_count ?? 0);
    const latest = Array.isArray(stats.latest) ? stats.latest.slice(-6).reverse() : [];
    const box = $('#dashRecentSignals');
    if (box) {
      box.innerHTML = latest.length
        ? latest.map(x => `<span>${x.code}｜${x.score}｜${x.level}${x.results?.latest_pct !== undefined ? `｜${x.results.latest_pct}%` : ''}</span>`).join('')
        : '<span>尚無 Replay 訊號</span>';
    }
  }

  async function fetchStats() {
    ensureDashboard();
    try {
      const res = await fetch(`${API}/api/replay-stats?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      renderStats(await res.json());
    } catch (e) {
      setText('#dashReplaySignals', 'API錯誤');
    }
  }

  window.STX_DASHBOARD_V5_REFRESH = fetchStats;
  window.addEventListener('stx-pro-analysis', e => {
    renderPro(e.detail);
    setTimeout(fetchStats, 400);
  });
  window.addEventListener('load', () => {
    ensureDashboard();
    renderPro(window.STX_PRO_ANALYSIS);
    fetchStats();
    setInterval(fetchStats, 15000);
  });
})();
