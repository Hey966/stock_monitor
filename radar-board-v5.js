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

  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
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
    const change = num(item.change_rate, 0);
    const volumeRatio = num(item.volume_ratio, 0);

    if (trap) return 'Trap風險';
    if (noChase) return '禁止追價';
    if (change < 0) return '反彈觀察';
    if (volumeRatio > 0 && volumeRatio < 1) return '量能不足';
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
    if (num(item.change_rate, 0) < 0) return false;
    if (num(item.volume_ratio, 1) < 1) return false;
    if (bool(item.trap) || bool(item.trap_block) || bool(item.trapBlock)) return false;
    if (bool(item.no_chase) || bool(item.noChase) || bool(item.chase_block)) return false;
    if (num(item.rule_score ?? item.ruleScore ?? item.rule, 70) < 70) return false;
    if (num(item.pro_score ?? item.proScore ?? item.score, 85) < 85) return false;
    if (num(item.group_score ?? item.groupScore ?? item.sector_score, 60) < 60) return false;
    if ((item.above_vwap !== undefined || item.aboveVWAP !== undefined) && !bool(item.above_vwap ?? item.aboveVWAP)) return false;
    if ((item.pullback_confirmed !== undefined || item.pullbackConfirmed !== undefined) && !bool(item.pullback_confirmed ?? item.pullbackConfirmed)) return false;
    return true;
  }

  function resultClass(item) {
    const result = finalResult(item);
    if (result === '可進場') return 'entry';
    if (result === 'Trap風險' || result === '禁止進場' || result === '禁止追價') return 'danger';
    if (result === '反彈觀察' || result === '量能不足') return 'warn';
    return 'watch';
  }

  function moodClass(item) {
    const result = finalResult(item);
    if (result === '可進場') return 'good hot';
    if (result === 'Trap風險' || result === '禁止進場' || result === '禁止追價') return 'bad';
    if (result === '反彈觀察' || result === '量能不足') return 'watch';
    return '';
  }

  function marketMood(rows, total) {
    const entryCount = rows.filter(isEntryCandidate).length;
    const reboundCount = rows.filter(x => finalResult(x) === '反彈觀察').length;
    const blockedCount = rows.filter(x => ['Trap風險', '禁止追價', '禁止進場'].includes(finalResult(x))).length;
    if (entryCount >= 5) return { title: '🟢 可交易雷達', reason: `符合進場條件 ${entryCount} 檔，取前5推播。`, entryCount, reboundCount, blockedCount };
    if (entryCount > 0) return { title: '🟡 精選進場', reason: `符合進場條件 ${entryCount} 檔，其餘多為觀察名單。`, entryCount, reboundCount, blockedCount };
    return { title: '🔴 暫無乾淨進場', reason: `已掃描 ${total || 0} 檔，未出現可進場前5。`, entryCount, reboundCount, blockedCount };
  }

  function meter(label, value) {
    const n = Math.max(0, Math.min(100, num(value, 0)));
    return `<div class="radar-meter"><span>${label}</span><b>${n}</b><i style="width:${n}%"></i></div>`;
  }

  function conditionTag(text, ok) {
    return `<span class="radar-cond ${ok ? 'ok' : 'no'}">${text}</span>`;
  }

  function card(item, index) {
    const score = finalScore(item);
    const result = finalResult(item);
    const ruleScore = item.rule_score ?? item.ruleScore ?? item.rule ?? '-';
    const proScore = item.pro_score ?? item.proScore ?? item.score ?? '-';
    const groupScore = item.group_score ?? item.groupScore ?? item.sector_score ?? '-';
    const pushed = isEntryCandidate(item) && index < 5;
    const reason = item.final_reason || item.pro_action || (item.risks || [])[0] || '等待條件同步。';
    const price = item.close ?? '-';
    const change = pctText(item.change_rate);
    const volumeRatio = item.volume_ratio ?? '-';
    const aboveVwap = bool(item.above_vwap ?? item.aboveVWAP);
    const pullback = bool(item.pullback_confirmed ?? item.pullbackConfirmed);
    const trap = bool(item.trap) || bool(item.trap_block);
    const noChase = bool(item.no_chase);
    const sector = item.sector || '其他';

    return `<article class="radar-card radar-final-card ${moodClass(item)}" data-code="${esc(item.code)}">
      <div class="radar-rank-box">
        <div class="radar-rank">#${index + 1}</div>
        <span class="radar-push ${pushed ? 'on' : 'off'}">${pushed ? 'Discord' : 'Web'}</span>
      </div>
      <div class="radar-body">
        <div class="radar-title-row">
          <div>
            <strong>${esc(item.code)} ${esc(item.name || '')}</strong>
            <small>${esc(sector)}｜現價 ${esc(price)}｜量比 ${esc(volumeRatio)}</small>
          </div>
          <b class="radar-score ${resultClass(item)}">${score}</b>
        </div>
        <div class="radar-result-row">
          <span class="radar-result ${resultClass(item)}">${esc(result)}</span>
          <span class="radar-change ${num(item.change_rate, 0) >= 0 ? 'up' : 'down'}">${change}</span>
        </div>
        <p class="radar-reason">${esc(reason)}</p>
        <div class="radar-meter-grid">
          ${meter('規則', ruleScore)}
          ${meter('Pro', proScore)}
          ${meter('族群', groupScore)}
        </div>
        <div class="radar-cond-row">
          ${conditionTag('VWAP', aboveVwap)}
          ${conditionTag('回測', pullback)}
          ${conditionTag('Trap', !trap)}
          ${conditionTag('追價', !noChase)}
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

  function ensureRadarStyles() {
    if ($('#stxRadarPrettyStyle')) return;
    const style = document.createElement('style');
    style.id = 'stxRadarPrettyStyle';
    style.textContent = `
      #page-radar .terminal-radar-head{background:linear-gradient(145deg,rgba(12,29,58,.98),rgba(5,13,29,.98));}
      .radar-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px;}
      .radar-summary-grid span{display:block;padding:10px 8px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#aebdd4;font-size:11px;font-weight:900;}
      .radar-summary-grid b{display:block;margin-top:4px;color:#fff;font-size:18px;}
      .radar-final-card{grid-template-columns:54px minmax(0,1fr);padding:14px;border-radius:26px;background:linear-gradient(145deg,rgba(10,28,56,.98),rgba(4,12,26,.98));}
      .radar-final-card.good{border-color:rgba(53,243,163,.55);box-shadow:0 18px 42px rgba(0,0,0,.28),0 0 24px rgba(53,243,163,.08) inset;}
      .radar-final-card.watch{border-color:rgba(255,209,102,.34);}
      .radar-rank-box{display:grid;gap:8px;align-content:start;justify-items:center;}
      .radar-push{width:50px;text-align:center;border-radius:999px;padding:5px 4px;font-size:10px;font-weight:1000;border:1px solid rgba(255,255,255,.14);color:#aebdd4;background:rgba(255,255,255,.05);}
      .radar-push.on{color:#04111f;background:linear-gradient(135deg,#35f3a3,#2ee9ff);border:0;}
      .radar-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
      .radar-title-row strong{display:block;font-size:19px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px;}
      .radar-title-row small{display:block;margin-top:5px;color:#9fb1ca;font-size:12px;font-weight:900;line-height:1.35;}
      .radar-score{min-width:52px;text-align:center;border-radius:17px;padding:9px 8px;font-size:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);}
      .radar-score.entry{color:#74ffd1;border-color:rgba(53,243,163,.38);background:rgba(53,243,163,.11);}
      .radar-score.warn{color:#ffe08a;border-color:rgba(255,209,102,.32);background:rgba(255,209,102,.09);}
      .radar-score.danger{color:#ff9aae;border-color:rgba(255,77,104,.38);background:rgba(255,77,104,.1);}
      .radar-result-row{display:flex;align-items:center;gap:8px;margin:10px 0 8px;}
      .radar-result,.radar-change{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000;}
      .radar-result.entry{color:#04111f;background:linear-gradient(135deg,#35f3a3,#2ee9ff);}
      .radar-result.warn{color:#ffd166;border:1px solid rgba(255,209,102,.34);background:rgba(255,209,102,.08);}
      .radar-result.watch{color:#b9d4ff;border:1px solid rgba(148,163,255,.28);background:rgba(148,163,255,.08);}
      .radar-result.danger{color:#ff9aae;border:1px solid rgba(255,77,104,.38);background:rgba(255,77,104,.1);}
      .radar-change.up{color:#78ffd3;background:rgba(53,243,163,.1);}
      .radar-change.down{color:#ff9aae;background:rgba(255,77,104,.1);}
      .radar-reason{margin:0 0 11px!important;color:#c6d4e8!important;font-size:13px!important;line-height:1.45!important;}
      .radar-meter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0;}
      .radar-meter{position:relative;min-height:44px;border-radius:15px;padding:8px;overflow:hidden;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);}
      .radar-meter span,.radar-meter b{position:relative;z-index:1;}
      .radar-meter span{display:block;color:#aebdd4;font-size:11px;font-weight:1000;}
      .radar-meter b{display:block;color:#fff;font-size:15px;margin-top:3px;}
      .radar-meter i{position:absolute;left:0;bottom:0;height:3px;border-radius:999px;background:linear-gradient(90deg,#2ee9ff,#7c3aed,#35f3a3);}
      .radar-cond-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
      .radar-cond{border-radius:999px;padding:6px 8px;font-size:11px;font-weight:1000;border:1px solid rgba(255,255,255,.12);}
      .radar-cond.ok{color:#88ffd6;background:rgba(53,243,163,.08);border-color:rgba(53,243,163,.25);}
      .radar-cond.no{color:#ff9aae;background:rgba(255,77,104,.08);border-color:rgba(255,77,104,.25);}
      @media(max-width:380px){.radar-title-row strong{max-width:190px}.radar-meter-grid{grid-template-columns:1fr}.radar-summary-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function render(data) {
    ensureRadarStyles();
    const list = $('#radarList');
    if (!list || !data || !data.ok) return;
    const rows = normalizeRows(data);
    const eligible = rows.filter(isEntryCandidate);
    const topRows = rows.slice(0, 10);
    const mood = marketMood(rows, data.scanned || data.universe_size || rows.length);
    const title = $('#marketRadarTitle');
    const reason = $('#marketRadarReason');
    if (title) title.textContent = mood.title;
    if (reason) {
      reason.innerHTML = `${mood.reason} 已掃描 ${data.scanned || 0}/${data.universe_size || 0} 檔。Discord 僅推可進場前5。<div class="radar-summary-grid"><span>可進場<b>${mood.entryCount}</b></span><span>反彈觀察<b>${mood.reboundCount}</b></span><span>風險阻擋<b>${mood.blockedCount}</b></span></div>`;
    }
    list.innerHTML = topRows.length
      ? topRows.map(card).join('')
      : '<div class="radar-card bad"><strong>尚無最終排名</strong><p>等待全市場掃描 API 回應。</p></div>';

    window.STX_RADAR_FINAL_ROWS = topRows;
    window.STX_RADAR_DISCORD_TOP5 = eligible.slice(0, 5);
    window.dispatchEvent(new CustomEvent('stx-radar-final-rankings', { detail: { rows: topRows, discordTop5: eligible.slice(0, 5), raw: data } }));
  }

  async function runRadarBoard() {
    ensureRadarStyles();
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