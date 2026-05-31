(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);

  function pctText(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }

  function moodClass(score) {
    const n = Number(score || 0);
    if (n >= 85) return 'good hot';
    if (n >= 70) return 'good';
    if (n < 50) return 'bad';
    return '';
  }

  function marketMood(top10) {
    if (!top10.length) return { title: '等待掃描', reason: '尚無市場掃描資料。' };
    const avg = top10.reduce((sum, x) => sum + Number(x.score || 0), 0) / top10.length;
    const strong = top10.filter(x => Number(x.score || 0) >= 75).length;
    if (avg >= 78 && strong >= 5) return { title: '🟢 強多雷達', reason: `TOP10 平均 ${avg.toFixed(1)} 分，強勢股 ${strong} 檔。` };
    if (avg >= 65) return { title: '🟡 偏多觀察', reason: `TOP10 平均 ${avg.toFixed(1)} 分，等待回測不破。` };
    return { title: '🔴 市場轉弱', reason: `TOP10 平均 ${avg.toFixed(1)} 分，暫不追價。` };
  }

  function card(item, index) {
    const score = Number(item.score || 0);
    return `<article class="radar-card ${moodClass(score)}" data-code="${item.code}">
      <div class="radar-rank">#${index + 1}</div>
      <div class="radar-body">
        <div class="radar-top"><strong>${item.code} ${item.name || ''}</strong><b>${score}</b></div>
        <p class="radar-status">${item.mood || '等待'}｜${item.sector || '其他'}｜${pctText(item.change_rate)}</p>
        <div class="radar-tags">
          <span>現價 ${item.close ?? '-'}</span>
          <span>量比 ${item.volume_ratio ?? '-'}</span>
          <span>${score >= 85 ? '強勢攻擊' : score >= 75 ? '強勢觀察' : score >= 65 ? '偏多觀察' : '保守'}</span>
        </div>
      </div>
    </article>`;
  }

  function render(data) {
    const list = $('#radarList');
    if (!list || !data || !data.ok) return;
    const top10 = Array.isArray(data.top5) ? data.top5 : [];
    const mood = marketMood(top10);
    const title = $('#marketRadarTitle');
    const reason = $('#marketRadarReason');
    if (title) title.textContent = mood.title;
    if (reason) reason.textContent = `${mood.reason} 已掃描 ${data.scanned || 0}/${data.universe_size || 0} 檔。`;
    list.innerHTML = top10.length
      ? top10.map(card).join('')
      : '<div class="radar-card"><strong>尚無雷達資料</strong><p>等待市場掃描 API 回應。</p></div>';
  }

  async function runRadarBoard() {
    const list = $('#radarList');
    if (!list) return;
    list.innerHTML = '<div class="quote-loading">雷達 TOP10 掃描中…</div>';
    try {
      const res = await fetch(`${API}/api/market-scan?limit=10&t=${Date.now()}`, { cache: 'no-store' });
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