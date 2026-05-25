(() => {
  const API = 'https://stock-monitor-b6d6.onrender.com';
  const $ = (s) => document.querySelector(s);
  const nameMap = {
    '2330': '台積電', '2317': '鴻海', '2454': '聯發科', '2308': '台達電',
    '2382': '廣達', '3231': '緯創', '3661': '世芯-KY', '6215': '和椿',
    '2357': '華碩', '2603': '長榮', '2618': '長榮航', '2881': '富邦金',
    '2882': '國泰金', '2891': '中信金', '3037': '欣興', '3017': '奇鋐',
    '2368': '金像電', '4966': '譜瑞-KY'
  };
  const symbolMap = { '2330': 'TSM', '2308': '2308.TW', '2454': '2454.TW', '2317': '2317.TW' };

  function ensureNewsPanel() {
    if ($('#newsSummaryPanel')) return;
    const host = $('#sellSummaryPanel') || $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const panel = document.createElement('section');
    panel.id = 'newsSummaryPanel';
    panel.className = 'entry-summary-panel terminal-news-panel';
    panel.innerHTML = `
      <span>即時新聞判斷</span>
      <strong id="newsSummaryTitle">等待新聞</strong>
      <p id="newsSummaryReason">搜尋股票後，會抓取即時新聞並計算新聞分數。</p>
      <div id="newsList" class="analysis-tags news-tags"><span>等待資料</span></div>
    `;
    host.parentNode.insertBefore(panel, host.nextSibling);
  }

  function getCurrentStock() {
    const label = ($('#stockCodeLabel')?.textContent || '').trim();
    let code = (label.match(/\d{4,6}/) || [])[0];
    if (!code) code = ($('#proCode')?.value || '').match(/\d{4,6}/)?.[0] || '';
    const title = ($('#proTitle')?.textContent || '').trim();
    let name = nameMap[code] || '';
    if (title && code && title.includes(code)) {
      name = title.replace(code, '').trim() || name;
    }
    return { code, name };
  }

  function scoreText(score) {
    if (score >= 10) return { title: `新聞偏多 +${score}`, type: 'good' };
    if (score <= -10) return { title: `新聞偏空 ${score}`, type: 'bad' };
    return { title: `新聞中性 ${score >= 0 ? '+' : ''}${score}`, type: '' };
  }

  function renderLoading() {
    ensureNewsPanel();
    const panel = $('#newsSummaryPanel');
    if (panel) panel.className = 'entry-summary-panel terminal-news-panel';
    if ($('#newsSummaryTitle')) $('#newsSummaryTitle').textContent = '新聞更新中';
    if ($('#newsSummaryReason')) $('#newsSummaryReason').textContent = '正在讀取即時新聞來源。';
    if ($('#newsList')) $('#newsList').innerHTML = '<span>讀取中</span>';
  }

  function renderNews(data) {
    ensureNewsPanel();
    const score = Number(data.newsScore || 0);
    const st = scoreText(score);
    const panel = $('#newsSummaryPanel');
    if (panel) panel.className = `entry-summary-panel terminal-news-panel ${st.type}`;
    if ($('#newsSummaryTitle')) $('#newsSummaryTitle').textContent = st.title;
    if ($('#newsSummaryReason')) $('#newsSummaryReason').textContent = data.summary || '新聞資料已更新。';
    const items = Array.isArray(data.items) ? data.items.slice(0, 5) : [];
    if ($('#newsList')) {
      $('#newsList').innerHTML = items.length
        ? items.map(item => `<span title="${escapeHtml(item.title || '')}">${escapeHtml((item.title || '').slice(0, 28))}</span>`).join('')
        : '<span>暫無新聞</span>';
    }
  }

  function renderError(message) {
    ensureNewsPanel();
    const panel = $('#newsSummaryPanel');
    if (panel) panel.className = 'entry-summary-panel terminal-news-panel bad';
    if ($('#newsSummaryTitle')) $('#newsSummaryTitle').textContent = '新聞讀取失敗';
    if ($('#newsSummaryReason')) $('#newsSummaryReason').textContent = message || '稍後請按右上角刷新。';
    if ($('#newsList')) $('#newsList').innerHTML = '<span>等待重試</span>';
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  async function updateNews(force = false) {
    ensureNewsPanel();
    const { code, name } = getCurrentStock();
    if (!code || !name) {
      if ($('#newsSummaryTitle')) $('#newsSummaryTitle').textContent = '等待股票';
      if ($('#newsSummaryReason')) $('#newsSummaryReason').textContent = '搜尋股票後才會抓取即時新聞。';
      return;
    }
    const cacheKey = `stx_news_${code}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (!force && cached && Date.now() - cached.ts < 120000) {
      renderNews(cached.data);
      return;
    }
    renderLoading();
    try {
      const symbol = symbolMap[code] || '';
      const url = `${API}/api/news?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('news api failed');
      const data = await res.json();
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
      renderNews(data);
    } catch (err) {
      renderError('新聞 API 尚未回應或 Render 正在部署。');
    }
  }

  window.STX_UPDATE_NEWS = updateNews;
  window.addEventListener('load', () => setTimeout(() => updateNews(false), 900));
  document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) {
      setTimeout(() => updateNews(true), 1200);
    }
  }, true);
  setInterval(() => updateNews(false), 120000);
})();
