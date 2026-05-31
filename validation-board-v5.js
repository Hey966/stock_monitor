(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${n}%`;
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? '-';
  }

  function status(ok, active, emptyText = '等待資料') {
    if (!ok) return 'API錯誤';
    if (active) return '有資料';
    return emptyText;
  }

  function renderList(id, rows, formatter, empty = '尚無資料') {
    const el = $(id);
    if (!el) return;
    el.innerHTML = rows && rows.length ? rows.map(formatter).join('') : `<span>${empty}</span>`;
  }

  async function getJson(path) {
    const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function refreshValidationBoard() {
    const title = $('#validationTitle');
    if (!title) return;
    setText('#validationTitle', '自測中…');
    setText('#validationSummary', '正在讀取 AI選股池、突破警報、資金流、Replay 與 Discord 監控資料。');

    const [ai, breakout, fund, replay] = await Promise.allSettled([
      getJson('/api/ai-pool?limit=20'),
      getJson('/api/breakout-alerts?limit=20&min_score=70&send=false'),
      getJson('/api/fund-flow?limit=20'),
      getJson('/api/replay-stats')
    ]);

    const aiData = ai.status === 'fulfilled' ? ai.value : null;
    const breakoutData = breakout.status === 'fulfilled' ? breakout.value : null;
    const fundData = fund.status === 'fulfilled' ? fund.value : null;
    const replayData = replay.status === 'fulfilled' ? replay.value : null;

    const aiTop = aiData?.top20 || [];
    const breakouts = breakoutData?.alerts || [];
    const fundAlerts = fundData?.alerts || [];
    const replaySignals = replayData?.total_signals || 0;
    const replayWin = replayData?.win_rate;

    setText('#validationTitle', '訊號驗證中心');
    setText('#validationSummary', `目前追蹤 5 項自測。Replay 訊號 ${replaySignals} 筆，勝率 ${replayWin ?? '-'}%。`);

    setText('#test1Status', status(Boolean(aiData?.ok), aiTop.length > 0));
    setText('#test1Metric', `${aiTop.length} 檔`);
    renderList('#test1List', aiTop.slice(0, 5), (x, i) => `<span>${i + 1}. ${x.code} ${x.name || ''}｜${x.score}分｜${pct(x.change_rate)}</span>`);

    setText('#test2Status', status(Boolean(breakoutData?.ok), breakouts.length > 0, '無突破訊號'));
    setText('#test2Metric', `${breakouts.length} 筆`);
    renderList('#test2List', breakouts.slice(0, 5), (x, i) => `<span>${i + 1}. ${x.code}｜${x.score}分｜${x.alert_type || 'breakout'}</span>`, '目前無突破警報');

    setText('#test3Status', status(Boolean(fundData?.ok), fundAlerts.length > 0, '無籌碼警報'));
    setText('#test3Metric', `${fundAlerts.length} 筆`);
    renderList('#test3List', fundAlerts.slice(0, 5), (x, i) => `<span>${i + 1}. ${x.code}｜${x.alert}｜資金${x.fund_score}｜主力${x.big_player_score}</span>`, '目前無資金流警報');

    setText('#test4Status', status(Boolean(replayData?.ok), replaySignals > 0, '尚無Replay樣本'));
    setText('#test4Metric', `${replayWin ?? '-'}%`);
    renderList('#test4List', replayData?.latest?.slice(-5).reverse() || [], (x, i) => `<span>${i + 1}. ${x.code}｜${x.score}分｜${x.level || '-'}</span>`, '尚無Replay紀錄');

    const autoOk = Boolean(breakoutData?.ok && fundData?.ok);
    setText('#test5Status', autoOk ? '可監控' : '監控異常');
    setText('#test5Metric', autoOk ? '5分鐘排程' : '-');
    renderList('#test5List', [
      `突破警報 API：${breakoutData?.ok ? '正常' : '異常'}`,
      `資金流 API：${fundData?.ok ? '正常' : '異常'}`,
      'Discord Webhook：需用 /api/discord-alert 測試',
      '自動推播：台灣時間 09:00～14:55',
      '判斷：有訊號才會推播'
    ], (x) => `<span>${x}</span>`);
  }

  window.STX_VALIDATION_REFRESH = refreshValidationBoard;
  window.addEventListener('load', () => {
    setTimeout(refreshValidationBoard, 1200);
    setInterval(() => {
      if ($('#page-validation')?.classList.contains('active')) refreshValidationBoard();
    }, 30000);
  });
})();
