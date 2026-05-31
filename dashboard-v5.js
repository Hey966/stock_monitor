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

  function pctText(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${n}%`;
  }

  function signalReturn(item) {
    const r = item?.results || {};
    const vals = [r.latest_pct, r.pct_5m, r.pct_10m, r.pct_30m, r.max_gain]
      .map(Number)
      .filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : null;
  }

  function ensureDashboard() {
    if ($('#stxDashboardV5')) return;
    const host = $('#page-search') || $('.modern-page.active') || document.querySelector('main');
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'stxDashboardV5';
    panel.className = 'entry-summary-panel terminal-main-signal';
    panel.innerHTML = `
      <span>STX AI 戰情中心 v5.2</span>
      <strong id="dashEngineVersion">等待 Pro Engine</strong>
      <p id="dashSummary">搜尋股票 → STX AI 戰情中心 → 即時大盤 → 熱門強勢股 TOP5 → Replay 勝率面板 → 雷達掃描。</p>

      <div class="quote-detail-grid" style="margin-top:12px">
        <article><span>今日最佳訊號</span><b id="dashBestSignal">-</b></article>
        <article><span>今日最強族群</span><b id="dashStrongGroup">-</b></article>
        <article><span>成功訊號</span><b id="dashSuccessCount">-</b></article>
        <article><span>熱門強勢股 TOP5</span><b id="dashHotTopCount">-</b></article>
      </div>

      <div id="dashHotTop5" class="analysis-tags" style="margin-top:12px"><span>等待市場掃描</span></div>

      <div class="quote-detail-grid" style="margin-top:12px">
        <article><span>回測訊號數</span><b id="dashReplaySignals">-</b></article>
        <article><span>勝率</span><b id="dashWinRate">-</b></article>
        <article><span>平均報酬</span><b id="dashAvgReturn">-</b></article>
        <article><span>陷阱攔截</span><b id="dashTrapCount">-</b></article>
        <article><span>大盤同步</span><b id="dashMarketSync">-</b></article>
        <article><span>風險封頂</span><b id="dashRiskCap">-</b></article>
      </div>

      <div id="dashRecentSignals" class="analysis-tags" style="margin-top:12px"><span>等待最近5筆成功訊號</span></div>
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
    setText('#dashEngineVersion', data.message || 'STX AI 戰情中心 v5.2');
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

    const latest = Array.isArray(stats.latest) ? stats.latest.slice().reverse() : [];
    const success = latest.filter(x => {
      const ret = signalReturn(x);
      return ret !== null && ret > 0;
    });
    const best = success.slice().sort((a, b) => (signalReturn(b) ?? -999) - (signalReturn(a) ?? -999))[0];

    setText('#dashReplaySignals', stats.total_signals ?? 0);
    setText('#dashWinRate', stats.win_rate === null || stats.win_rate === undefined ? '-' : `${stats.win_rate}%`);
    setText('#dashAvgReturn', stats.avg_latest_pct === null || stats.avg_latest_pct === undefined ? '-' : `${stats.avg_latest_pct}%`);
    setText('#dashTrapCount', stats.trap_block_count ?? 0);
    setText('#dashBestSignal', best ? `${best.code}｜${pctText(signalReturn(best))}` : '-');
    setText('#dashSuccessCount', success.length);

    const recent5 = success.slice(0, 5);
    const box = $('#dashRecentSignals');
    if (box) {
      box.innerHTML = recent5.length
        ? recent5.map(x => `<span>${x.code}｜${x.score}分｜${levelText(x.level)}｜${pctText(signalReturn(x))}</span>`).join('')
        : '<span>尚無最近5筆成功訊號</span>';
    }
  }

  function renderMarketScan(data) {
    ensureDashboard();
    if (!data || !data.ok) return;

    const top5 = Array.isArray(data.top5) ? data.top5 : [];
    const strongest = data.strongest_sector;

    setText('#dashHotTopCount', top5.length);
    setText('#dashStrongGroup', strongest ? `${strongest.sector}｜${strongest.avg_score}分` : '-');

    const hotBox = $('#dashHotTop5');
    if (hotBox) {
      hotBox.innerHTML = top5.length
        ? top5.map((x, i) => `<span>TOP${i + 1} ${x.code} ${x.name || ''}｜${x.sector || '其他'}｜${x.score}分｜${pctText(x.change_rate)}</span>`).join('')
        : '<span>尚無即時強勢股</span>';
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

  async function fetchMarketScan() {
    ensureDashboard();
    try {
      const res = await fetch(`${API}/api/market-scan?limit=5&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      renderMarketScan(await res.json());
    } catch (e) {
      setText('#dashHotTopCount', '掃描錯誤');
      const hotBox = $('#dashHotTop5');
      if (hotBox) hotBox.innerHTML = '<span>市場掃描 API 尚未回應</span>';
    }
  }

  async function refreshAll() {
    await Promise.allSettled([fetchStats(), fetchMarketScan()]);
  }

  window.STX_DASHBOARD_V5_REFRESH = refreshAll;
  window.addEventListener('stx-pro-analysis', e => {
    renderPro(e.detail);
    setTimeout(refreshAll, 400);
  });
  window.addEventListener('load', () => {
    ensureDashboard();
    renderPro(window.STX_PRO_ANALYSIS);
    refreshAll();
    setInterval(fetchStats, 15000);
    setInterval(fetchMarketScan, 30000);
  });
})();