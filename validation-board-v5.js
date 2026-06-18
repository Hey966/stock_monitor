(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  let latestRows = [];
  let latestPerf = null;
  let latestReplay = null;

  const MODULE_LABELS = {
    radar_final: '雷達最終排名實測',
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
    if (age > 0 && age < 30) return '30分未結算';
    return '30分 -';
  }

  function rowLatestText(x) {
    const r = x.results || {};
    if (Number.isFinite(Number(r.latest_pct))) return `最新 ${pct(r.latest_pct)}`;
    return '最新 -';
  }

  function resultText(x) {
    return x.final_result || x.level || x.action || x.reason || '-';
  }

  function renderModule(testNo, row, label) {
    setText(`#test${testNo}Status`, statusText(row));
    setText(`#test${testNo}Metric`, metricText(row));
    const rows = hasSignals(row) ? (row.latest || []) : [];
    renderList(`#test${testNo}List`, rows, (x, i) => {
      return `<span>${i + 1}. ${x.code} ${x.name || ''}｜${x.score ?? '-'}分｜${resultText(x)}｜${rowLatestText(x)}｜${row30mText(x)}</span>`;
    }, `${label} 尚無績效紀錄`);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
  }

  function returnPct(entry, close) {
    const e = Number(entry);
    const c = Number(close);
    if (!Number.isFinite(e) || !Number.isFinite(c) || e === 0) return '';
    return Number((((c - e) / e) * 100).toFixed(2));
  }

  function validationResult(row) {
    const finalResult = row.final_result || row.finalResult || row.level || row.action || '';
    const ret = returnPct(row.entry_price ?? row.close ?? row.price, row.close_price ?? row.close_result ?? row.results?.close_price);
    if (!/可進場|entry|strong/i.test(String(finalResult))) return '觀察';
    if (ret === '') return '待收盤';
    return Number(ret) > 0 ? '成功' : '失敗';
  }

  function collectRows(perf, replay) {
    const rows = [];
    (perf?.modules || []).forEach(module => {
      (module.latest || []).forEach((x, i) => {
        rows.push({
          source: MODULE_LABELS[module.module] || module.module,
          rank: i + 1,
          code: x.code,
          name: x.name || '',
          analysis_time: x.time || x.created_at || '',
          entry_price: x.entry_price ?? x.close ?? x.price ?? '',
          close_price: x.results?.close_price ?? x.results?.latest_price ?? '',
          high_price: x.results?.high_price ?? '',
          low_price: x.results?.low_price ?? '',
          final_result: x.final_result || x.level || x.action || x.reason || '',
          final_score: x.final_score ?? x.score ?? '',
          rule_score: x.rule_score ?? '',
          pro_score: x.pro_score ?? x.score ?? '',
          group_score: x.group_score ?? x.sector_score ?? '',
          news_score: x.news_score ?? '',
          chip_score: x.chip_score ?? '',
          trap: x.trap ?? x.trap_block ?? '',
          no_chase: x.no_chase ?? x.chase_block ?? '',
          above_vwap: x.above_vwap ?? '',
          pullback_confirmed: x.pullback_confirmed ?? '',
          discord_pushed: x.discord_pushed ?? false,
          return_pct: x.results?.latest_pct ?? x.results?.pct_30m ?? '',
          max_profit_pct: x.results?.max_gain ?? '',
          max_drawdown_pct: x.results?.max_loss ?? '',
          validation_result: validationResult(x)
        });
      });
    });

    (replay?.latest || []).slice().reverse().forEach((x, i) => {
      rows.push({
        source: 'Replay實測',
        rank: i + 1,
        code: x.code,
        name: x.name || '',
        analysis_time: x.time || x.created_at || '',
        entry_price: x.entry_price ?? x.close ?? '',
        close_price: x.results?.close_price ?? x.results?.latest_price ?? '',
        high_price: x.results?.high_price ?? '',
        low_price: x.results?.low_price ?? '',
        final_result: x.final_result || x.level || '',
        final_score: x.final_score ?? x.score ?? '',
        rule_score: x.rule_score ?? '',
        pro_score: x.pro_score ?? x.score ?? '',
        group_score: x.group_score ?? '',
        news_score: x.news_score ?? '',
        chip_score: x.chip_score ?? '',
        trap: x.trap ?? x.trap_block ?? '',
        no_chase: x.no_chase ?? '',
        above_vwap: x.above_vwap ?? '',
        pullback_confirmed: x.pullback_confirmed ?? '',
        discord_pushed: x.discord_pushed ?? false,
        return_pct: x.results?.latest_pct ?? x.results?.pct_30m ?? '',
        max_profit_pct: x.results?.max_gain ?? '',
        max_drawdown_pct: x.results?.max_loss ?? '',
        validation_result: validationResult(x)
      });
    });
    return rows;
  }

  function csvEscape(v) {
    const text = String(v ?? '');
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadCsv() {
    const headers = ['date','source','analysis_time','rank','stock_id','stock_name','entry_price','close_price','high_price','low_price','final_result','final_score','rule_score','pro_score','group_score','news_score','chip_score','trap','no_chase','above_vwap','pullback_confirmed','discord_pushed','return_pct','max_profit_pct','max_drawdown_pct','validation_result'];
    const today = new Date().toISOString().slice(0, 10);
    const body = latestRows.map(row => [today,row.source,row.analysis_time,row.rank,row.code,row.name,row.entry_price,row.close_price,row.high_price,row.low_price,row.final_result,row.final_score,row.rule_score,row.pro_score,row.group_score,row.news_score,row.chip_score,row.trap,row.no_chase,row.above_vwap,row.pullback_confirmed,row.discord_pushed,row.return_pct,row.max_profit_pct,row.max_drawdown_pct,row.validation_result].map(csvEscape).join(','));
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STX_validation_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function ensureDownloadPanel() {
    if ($('#validationDownloadPanel')) return;
    const page = $('#page-validation');
    if (!page) return;
    const panel = document.createElement('section');
    panel.id = 'validationDownloadPanel';
    panel.className = 'analysis-panel terminal-analysis-board';
    panel.innerHTML = `
      <h3>下載當日驗證結果</h3>
      <p id="validationDownloadText">系統會匯出今日即時分析、收盤比對、報酬率與驗證結果。下載後可上傳給 ChatGPT 判斷如何修正模型。</p>
      <div class="watch-input" style="margin-top:12px">
        <input id="validationRowsCount" readonly value="等待資料" />
        <button id="downloadValidationCsv">下載CSV</button>
      </div>
    `;
    page.appendChild(panel);
  }

  async function refreshValidationBoard() {
    const title = $('#validationTitle');
    if (!title) return;
    ensureDownloadPanel();
    setText('#validationTitle', '讀取實測中…');
    setText('#validationSummary', '正在讀取當日即時分析與正式實測績效紀錄。');

    const [perfRes, replayRes] = await Promise.allSettled([
      getJson('/api/performance'),
      getJson('/api/replay-stats')
    ]);

    const perf = perfRes.status === 'fulfilled' ? perfRes.value : null;
    const replay = replayRes.status === 'fulfilled' ? replayRes.value : null;
    latestPerf = perf;
    latestReplay = replay;
    latestRows = collectRows(perf, replay);

    const radar = moduleByName(perf, 'radar_final');
    const breakout = moduleByName(perf, 'breakout');
    const fund = moduleByName(perf, 'fund_flow');
    const total = perf?.total_signals ?? latestRows.length;
    const tracked = perf?.tracked_results ?? latestRows.filter(x => x.validation_result !== '待收盤').length;
    const radarWin = win(realWinRate(radar));
    const fundWin = win(realWinRate(fund));
    const breakoutWin = win(realWinRate(breakout));

    setText('#validationTitle', '實測績效中心');
    setText('#validationSummary', `正式實測 ${total} 筆，已追蹤 ${tracked} 筆。雷達排名 ${radarWin}｜資金流 ${fundWin}｜突破 ${breakoutWin}。可於頁面最下方下載 CSV。`);

    renderModule(1, radar, MODULE_LABELS.radar_final);
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
      'Discord：只推可進場前5',
      '驗證：記錄雷達最終排名前5'
    ], (x) => `<span>${x}</span>`);

    setText('#validationRowsCount', `可下載 ${latestRows.length} 筆`);
  }

  window.STX_VALIDATION_REFRESH = refreshValidationBoard;
  window.STX_DOWNLOAD_VALIDATION_CSV = downloadCsv;
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'downloadValidationCsv') downloadCsv();
  }, true);
  window.addEventListener('load', () => {
    setTimeout(refreshValidationBoard, 1200);
    setInterval(() => {
      if ($('#page-validation')?.classList.contains('active')) refreshValidationBoard();
    }, 30000);
  });
})();