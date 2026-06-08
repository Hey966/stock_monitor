(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  function pctText(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  function finalResult(item) {
    if (item.final_result) return item.final_result;
    if (item.finalResult) return item.finalResult;
    if (item.entry_result) return item.entry_result;
    if (item.action) return item.action;

    const ruleScore = num(item.rule_score ?? item.ruleScore ?? item.rule, 0);
    const proScore = num(item.pro_score ?? item.proScore ?? item.score, 0);
    const groupScore = num(item.group_score ?? item.groupScore ?? item.sector_score, 0);
    const trap = bool(item.trap) || bool(item.trap_block) || bool(item.trapBlock);
    const noChase = bool(item.no_chase) || bool(item.noChase) || bool(item.chase_block);
    const aboveVwap = item.above_vwap === undefined && item.aboveVWAP === undefined ? true : bool(item.above_vwap ?? item.aboveVWAP);
    const pullback = item.pullback_confirmed === undefined && item.pullbackConfirmed === undefined ? true : bool(item.pullback_confirmed ?? item.pullbackConfirmed);

    if (trap) return 'Trap風險';
    if (noChase) return '禁止追價';
    if (ruleScore < 60) return '禁止進場';
    if (ruleScore < 70) return '觀察';
    if (ruleScore >= 70 && proScore >= 85 && groupScore >= 60 && aboveVwap && pullback) return '可進場';
    return '等待';
  }

  function finalScore(item) {
    if (item.final_score !== undefined) return num(item.final_score);
    if (item.finalScore !== undefined) return num(item.finalScore);
    const ruleScore = num(item.rule_score ?? item.ruleScore ?? item.rule, num(item.score, 0));
    const proScore = num(item.pro_score ?? item.proScore ?? item.score, 0);
    const groupScore = num(item.group_score ?? item.groupScore ?? item.sector_score, 0);
    const newsScore = num(item.news_score ?? item.newsScore, 0);
    const chipScore = num(item.chip_score ?? item.chipScore, 0);
    return Math.round(ruleScore * 0.5 + proScore * 0.25 + groupScore * 0.15 + (newsScore + chipScore) * 0.1);
  }

  function isEntryCandidate(item) {
    const result = finalResult(item);
    if (result !== '可進場') return false;
    if (bool(item.trap) || bool(item.trap_block) || bool(item.trapBlock)) return false;
    if (bool(item.no_chase) || bool(item.noChase) || bool(item.chase_block)) return false;
    if (num(item.rule_score ?? item.ruleScore ?? item.rule, 70) < 70) return false;
    if (num(item.pro_score ?? item.proScore ?? item.score, 85) < 85) return false;
    if (num(item.group_score ?? item.groupScore ?? item.sector_score, 60) < 60) return false;
    if ((item.above_vwap !== undefined || item.aboveVWAP !== undefined) && !bool(item.above_vwap ?? item.aboveVWAP)) return false;
    if ((item.pullback_confirmed !== undefined || item.pullbackConfirmed !== undefined) && !bool(item.pullback_confirmed ?? item.pullbackConfirmed)) return false;
    return true;
  }

  function moodClass(item) {
    const result = finalResult(item);
    const score = finalScore(item);
    if (result === '可進場') return 'good hot';
    if (result === 'Trap風險' || result === '禁止進場' || result === '禁止追價') return 'bad';
    if (score >= 70) return 'good';
    return '';
  }

  function marketMood(rows, total) {
    if (!rows.length) return { title: '等待掃描', reason: '尚無符合進場條件的最終排名。' };
    const avg = rows.reduce((sum, x) => sum + finalScore(x), 0) / rows.length;
    const entryCount = rows.filter(isEntryCandidate).length;
    if (entryCount >= 5) return { title: '🟢 可交易雷達', reason: `符合進場條件 ${entryCount} 檔，TOP 平均 ${avg.toFixed(1)} 分。` };
    if (entryCount > 0) return { title: '🟡 精選觀察', reason: `符合進場條件 ${entryCount} 檔，未滿 5 檔需保守。` };
    return { title: '🔴 暫無進場名單', reason: `已掃描 ${total || 0} 檔，但規則條件未通過。` };
  }

  function card(item, index) {
    const score = finalScore(item);
    const result = finalResult(item);
    const ruleScore = item.rule_score ?? item.ruleScore ?? item.rule ?? '-';
    const proScore = item.pro_score ?? item.proScore ?? item.score ?? '-';
    const groupScore = item.group_score ?? item.groupScore ?? item.sector_score ?? '-';
    const pushed = index < 5 && isEntryCandidate(item) ? 'Discord 前5' : '網頁排名';
    return `<article class="radar-card ${moodClass(item)}" data-code="${item.code}">
      <div class="radar-rank">#${index + 1}</div>
      <div class="radar-body">
        <div class="radar-top"><strong>${item.code} ${item.name || ''}</strong><b>${score}</b></div>
        <p class="radar-status">${result}｜${item.sector || '其他'}｜${pctText(item.change_rate)}</p>
        <div class="radar-tags">
          <span>現價 ${item.close ?? '-'}</span>
          <span>規則 ${ruleScore}</span>
          <span>Pro ${proScore}</span>
          <span>族群 ${groupScore}</span>
          <span>${pushed}</span>
        </div>
      </div>
    </article>`;
  }

  function normalizeRows(data) {
    const raw = Array.isArray(data.final_rankings) ? data.final_rankings
      : Array.isArray(data.rankings) ? data.rankings
      : Array.isArray(data.top) ? data.top
      : Array.isArray(data.top10) ? data.top10
      : Array.isArray(data.top5) ? data.top5
      : [];
    return raw.slice().sort((a, b) => finalScore(b) - finalScore(a));
  }

  function render(data) {
    const list = $('#radarList');
    if (!list || !data || !data.ok) return;
    const rows = normalizeRows(data);
    const eligible = rows.filter(isEntryCandidate);
    const displayRows = eligible.length ? eligible : rows;
    const topRows = displayRows.slice(0, 10);
    const mood = marketMood(eligible, data.scanned || data.universe_size || rows.length);
    const title = $('#marketRadarTitle');
    const reason = $('#marketRadarReason');
    if (title) title.textContent = mood.title;
    if (reason) reason.textContent = `${mood.reason} 已掃描 ${data.scanned || 0}/${data.universe_size || 0} 檔。Discord 僅推雷達前5。`;
    list.innerHTML = topRows.length
      ? topRows.map(card).join('')
      : '<div class="radar-card"><strong>尚無最終排名</strong><p>等待全市場掃描 API 回應。</p></div>';

    window.STX_RADAR_FINAL_ROWS = topRows;
    window.STX_RADAR_DISCORD_TOP5 = eligible.slice(0, 5);
    window.dispatchEvent(new CustomEvent('stx-radar-final-rankings', { detail: { rows: topRows, discordTop5: eligible.slice(0, 5), raw: data } }));
  }

  async function runRadarBoard() {
    const list = $('#radarList');
    if (!list) return;
    list.innerHTML = '<div class="quote-loading">全台股最終排名掃描中…</div>';
    try {
      const res = await fetch(`${API}/api/market-scan?limit=50&final=1&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch (e) {
      const title = $('#marketRadarTitle');
      const reason = $('#marketRadarReason');
      if (title) title.textContent = '掃描失敗';
      if (reason) reason.textContent = '市場掃描 API 尚未回應。';
      list.innerHTML = '<div class="radar-card bad"><strong>雷達讀取失敗</strong><p>請稍後重新整理。</p></div>';
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'marketRefresh') {
      setTimeout(runRadarBoard, 250);
    }
    const cardEl = event.target.closest?.('.radar-card[data-code]');
    if (cardEl) {
      const input = $('#proCode');
      if (input) input.value = cardEl.dataset.code;
      $('#proSearch')?.click();
      document.querySelector('.modern-bottom button[data-page="overview"]')?.click();
    }
  }, true);

  window.STX_RADAR_BOARD_REFRESH = runRadarBoard;
  window.addEventListener('load', () => {
    setTimeout(runRadarBoard, 900);
    setInterval(() => {
      if ($('#page-radar')?.classList.contains('active')) runRadarBoard();
    }, 30000);
  });
})();