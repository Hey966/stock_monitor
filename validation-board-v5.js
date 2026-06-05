(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  const MODULE_LABELS = {
    ai_pool: 'AI選股池',
    breakout: '突破警報',
    fund_flow: '資金流向',
    replay: 'Replay勝率',
    monitor: '自動監控'
  };

  function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${n}%`;
  }

  function win(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n}%`;
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? '-';
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

  function moduleByName(perf, name) {
    return (perf?.modules || []).find(x => x.module === name) || null;
  }

  function bestWinRate(row) {
    if (!row) return null;
    return row.win_rate_30m ?? row.win_rate_10m ?? row.win_rate_5m ?? row.win_rate_latest;
  }

  function metricText(row) {
    if (!row) return '-';
    const rate = bestWinRate(row);
    const samples = row.tracked ?? row.signals ?? 0;
    if (rate === null || rate === undefined) return `樣本 ${samples}筆`;
    return `勝率 ${rate}%｜樣本 ${samples}筆`;
  }

  function statusText(row) {
    if (!row) return '尚無紀錄';
    if ((row.tracked || 0) > 0) return '已追蹤';
    if ((row.signals || 0) > 0) return '待驗證';
    return '尚無訊號';
  }

  function renderModule(testNo, row, label) {
    setText(`#test${testNo}Status`, statusText(row));
    setText(`#test${testNo}Metric`, metricText(row));
    renderList(`#test${testNo}List`, row?.latest || [], (x, i) => {
      const r = x.results || {};
      return `<span>${i + 1}. ${x.code} ${x.name || ''}｜${x.score ?? '-'}分｜最新 ${pct(r.latest_pct)}｜30分 ${pct(r.pct_30m)}</span>`;
    }, `${label} 尚無績效紀錄`);
  }

  async function refreshValidationBoard() {
    const title = $('#validationTitle');
    if (!title) return;
    setText('#validationTitle', '讀取績效中…');
    setText('#validationSummary', '正在讀取正式模組績效紀錄。');

    const [perfRes, replayRes] = await Promise.allSettled([
      getJson('/api/performance'),
      getJson('/api/replay-stats')
    ]);

    const perf = perfRes.status === 'fulfilled' ? perfRes.value : null;
    const replay = replayRes.status === 'fulfilled' ? replayRes.value : null;

    const ai = moduleByName(perf, 'ai_pool');
    const breakout = moduleByName(perf, 'breakout');
    const fund = moduleByName(perf, 'fund_flow');
    const total = perf?.total_signals ?? 0;
    const tracked = perf?.tracked_results ?? 0;
    const aiWin = win(bestWinRate(ai));
    const fundWin = win(bestWinRate(fund));
    const breakoutWin = win(bestWinRate(breakout));

    setText('#validationTitle', '訊號驗證中心');
    setText('#validationSummary', `正式績效 ${total} 筆，已追蹤 ${tracked} 筆。AI ${aiWin}｜資金流 ${fundWin}｜突破 ${breakoutWin}。`);

    renderModule(1, ai, MODULE_LABELS.ai_pool);
    renderModule(2, breakout, MODULE_LABELS.breakout);
    renderModule(3, fund, MODULE_LABELS.fund_flow);

    setText('#test4Status', replay?.ok ? ((replay.total_signals || 0) > 0 ? '已追蹤' : '尚無Replay樣本') : 'API錯誤');
    setText('#test4Metric', replay?.win_rate === null || replay?.win_rate === undefined ? `樣本 ${replay?.total_signals || 0}筆` : `勝率 ${replay.win_rate}%｜樣本 ${replay?.total_signals || 0}筆`);
    renderList('#test4List', replay?.latest?.slice(-5).reverse() || [], (x, i) => `<span>${i + 1}. ${x.code}｜${x.score}分｜${x.level || '-'}｜最新 ${pct((x.results || {}).latest_pct)}</span>`, '尚無Replay紀錄');

    const perfOk = Boolean(perf?.ok);
    const replayOk = Boolean(replay?.ok);
    setText('#test5Status', perfOk && replayOk ? '可監控' : '監控異常');
    setText('#test5Metric', '5分鐘排程');
    renderList('#test5List', [
      `正式績效 API：${perfOk ? '正常' : '異常'}`,
      `Replay API：${replayOk ? '正常' : '異常'}`,
      `績效儲存：${perf?.github_enabled ? 'GitHub JSON' : '本機暫存'}`,
      `今日路徑：${perf?.github_path || '-'}`,
      '自動推播：台灣時間 09:00～14:55'
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
