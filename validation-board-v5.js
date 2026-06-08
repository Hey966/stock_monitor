(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  const MODULE_LABELS = {
    ai_pool: '選股池實測',
    breakout: '突破實測',
    fund_flow: '資金流實測',
    replay: 'Replay實測',
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

  function hasSignals(row) {
    return Boolean(row && Number(row.signals || 0) > 0);
  }

  function realWinRate(row) {
    if (!hasSignals(row)) return null;
    return row.win_rate_30m ?? null;
  }

  function settledCountFromLatest(row) {
    return (row?.latest || []).filter(x => Number.isFinite(Number((x.results || {}).pct_30m))).length;
  }

  function metricText(row) {
    if (!hasSignals(row)) return '-';
    const rate = realWinRate(row);
    const tracked = row.tracked ?? row.signals ?? 0;
    const settledHint = row.tracked_30m ?? row.settled_30m ?? null;
    const sampleText = Number.isFinite(Number(settledHint)) ? `30分樣本 ${settledHint}筆` : `追蹤 ${tracked}筆`;
    if (rate === null || rate === undefined) return `30分尚無結算｜${sampleText}`;
    return `30分勝率 ${rate}%｜${sampleText}`;
  }

  function statusText(row) {
    if (!hasSignals(row)) return '尚無紀錄';
    if ((row.tracked || 0) > 0) return '已追蹤';
    return '待驗證';
  }

  function row30mText(x) {
    const r = x.results || {};
    if (Number.isFinite(Number(r.pct_30m))) return `30分 ${pct(r.pct_30m)}`;
    const age = Number(x.age_minutes || 0);
    if (age > 0 && age < 30) return `30分未結算`;
    return `30分 -`;
  }

  function rowLatestText(x) {
    const r = x.results || {};
    if (Number.isFinite(Number(r.latest_pct))) return `最新 ${pct(r.latest_pct)}`;
    return '最新 -';
  }

  function renderModule(testNo, row, label) {
    setText(`#test${testNo}Status`, statusText(row));
    setText(`#test${testNo}Metric`, metricText(row));
    const rows = hasSignals(row) ? (row.latest || []) : [];
    renderList(`#test${testNo}List`, rows, (x, i) => {
      return `<span>${i + 1}. ${x.code} ${x.name || ''}｜${x.score ?? '-'}分｜${rowLatestText(x)}｜${row30mText(x)}</span>`;
    }, `${label} 尚無績效紀錄`);
  }

  async function refreshValidationBoard() {
    const title = $('#validationTitle');
    if (!title) return;
    setText('#validationTitle', '讀取實測中…');
    setText('#validationSummary', '正在讀取正式實測績效紀錄。');

    const [perfRes, replayRes] = await Promise.allSettled([
      getJson('/api/performance'),
      getJson('/api/replay-stats')
    ]);

    const perf = perfRes.status === 'fulfilled' ? perfRes.value : null;
    const replay = replayRes.status === 'fulfilled' ? replayRes.value : null;

    const pool = moduleByName(perf, 'ai_pool');
    const breakout = moduleByName(perf, 'breakout');
    const fund = moduleByName(perf, 'fund_flow');
    const total = perf?.total_signals ?? 0;
    const tracked = perf?.tracked_results ?? 0;
    const poolWin = win(realWinRate(pool));
    const fundWin = win(realWinRate(fund));
    const breakoutWin = win(realWinRate(breakout));

    setText('#validationTitle', '實測績效中心');
    setText('#validationSummary', `正式實測 ${total} 筆，已追蹤 ${tracked} 筆。選股池 ${poolWin}｜資金流 ${fundWin}｜突破 ${breakoutWin}。`);

    renderModule(1, pool, MODULE_LABELS.ai_pool);
    renderModule(2, breakout, MODULE_LABELS.breakout);
    renderModule(3, fund, MODULE_LABELS.fund_flow);

    const replayCount = replay?.total_signals || 0;
    setText('#test4Status', replay?.ok ? (replayCount > 0 ? '已追蹤' : '尚未啟用') : 'API錯誤');
    setText('#test4Metric', replayCount > 0 ? (replay?.win_rate === null || replay?.win_rate === undefined ? `樣本 ${replayCount}筆` : `勝率 ${replay.win_rate}%｜樣本 ${replayCount}筆`) : '-');
    renderList('#test4List', replayCount > 0 ? (replay?.latest?.slice(-5).reverse() || []) : [], (x, i) => `<span>${i + 1}. ${x.code}｜${x.score}分｜${x.level || '-'}｜最新 ${pct((x.results || {}).latest_pct)}</span>`, 'Replay 尚未啟用');

    const perfOk = Boolean(perf?.ok);
    const replayOk = Boolean(replay?.ok);
    setText('#test5Status', perfOk && replayOk ? '可監控' : '監控異常');
    setText('#test5Metric', '5分鐘排程');
    renderList('#test5List', [
      `正式實測 API：${perfOk ? '正常' : '異常'}`,
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
