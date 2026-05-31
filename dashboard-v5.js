(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  function marketText(status) {
    if (status === 'bull') return '多頭同步';
    if (status === 'bear') return '空頭同步';
    if (status === 'neutral') return '中性盤';
    return '尚無資料';
  }

  function levelText(level) {
    const map = {
      strong: '強勢可進',
      strong_watch: '強勢觀察',
      watch: '觀察中',
      neutral: '中性等待',
      risk: '風險偏高',
      blocked: '禁止進場'
    };
    return map[level] || level || '-';
  }

  function capText(cap) {
    if (!cap) return '無封頂';
    if (Number(cap) <= 75) return `${cap}｜五檔賣壓極強`;
    if (Number(cap) <= 80) return `${cap}｜五檔賣壓明顯`;
    if (Number(cap) <= 88) return `${cap}｜五檔賣壓偏重`;
    return String(cap);
  }

  function ensureDashboard() {
    if ($('#stxDashboardV5')) return;
    const host = $('#page-search') || $('.modern-page.active') || document.querySelector('main');
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'stxDashboardV5';
    panel.className = 'entry-summary-panel terminal-main-signal';
    panel.innerHTML = `
      <span>STX 智能戰情中心 v5.1</span>
      <strong id="dashEngineVersion">等待 Pro Engine</strong>
      <p id="dashSummary">整合專業分析、大盤同步、五檔風險封頂與回測勝率。</p>
      <div class="quote-detail-grid" style="margin-top:12px">
        <article><span>回測訊號數</span><b id="dashReplaySignals">-</b></article>
        <article><span>勝率</span><b id="dashWinRate">-</b></article>
        <article><span>平均報酬</span><b id="dashAvgReturn">-</b></article>
        <article><span>陷阱攔截</span><b id="dashTrapCount">-</b></article>
        <article><span>大盤同步</span><b id="dashMarketSync">-</b></article>
        <article><span>風險封頂</span><b id="dashRiskCap">-</b></article>
      </div>
      <div id="dashRecentSignals" class="analysis-tags" style="margin-top:12px"><span>等待回測資料</span></div>
    `;
    const searchPanel = host.querySelector('.search-panel');
    if (searchPanel) {
      searchPanel.insertAdjacentElement('afterend', panel);
    } else {
      host.insertBefore(panel, host.firstChild?.nextSibling || host.firstChild);
    }
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text ?? '-';
  }

  function renderPro(data) {
    ensureDashboard();
    if (!data) return;
    setText('#dashEngineVersion', data.message || 'STX 智能戰情中心 v5.1');
    const ms = data.signals?.market_sync;
    const cap = data.signals?.orderbook_risk_cap;
    setText('#dashMarketSync', ms?.status ? `${marketText(ms.status)} ${ms.score ?? ''}` : '尚無資料');
    setText('#dashRiskCap', capText(cap));
    const trap = data.signals?.trap_block ? '🔴 已攔截風險' : '🟢 無陷阱';
    const level = levelText(data.level);
    setText('#dashSummary', `${data.name || data.code || ''}｜分數 ${data.score ?? '-'}｜${level}｜${trap}`);
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
        ? latest.map(x => `<span>${x.code}｜${x.score}分｜${levelText(x.level)}${x.results?.latest_pct !== undefined ? `｜${x.results.latest_pct}%` : ''}</span>`).join('')
        : '<span>尚無回測訊號</span>';
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
