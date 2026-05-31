(() => {
  const $ = (s) => document.querySelector(s);

  function goPage(name) {
    const btn = document.querySelector(`[data-page="${name}"]`);
    if (btn) btn.click();
  }

  function ensureMenu() {
    if ($('#stxHeaderMenu')) return $('#stxHeaderMenu');
    const menu = document.createElement('div');
    menu.id = 'stxHeaderMenu';
    menu.style.cssText = `
      position: fixed;
      top: 78px;
      right: 18px;
      z-index: 9999;
      display: none;
      min-width: 170px;
      padding: 10px;
      border-radius: 18px;
      border: 1px solid rgba(87, 220, 255, .28);
      background: rgba(7, 18, 38, .96);
      box-shadow: 0 18px 40px rgba(0,0,0,.35);
      backdrop-filter: blur(14px);
    `;
    menu.innerHTML = `
      <button data-act="refresh">重新整理資料</button>
      <button data-act="search">回到搜尋</button>
      <button data-act="replay">查看回測</button>
      <button data-act="clear">清除快取</button>
    `;
    menu.querySelectorAll('button').forEach(btn => {
      btn.style.cssText = `
        width: 100%;
        display: block;
        margin: 4px 0;
        padding: 12px 14px;
        border: 0;
        border-radius: 14px;
        color: #eaf7ff;
        font-weight: 800;
        text-align: left;
        background: rgba(255,255,255,.08);
      `;
    });
    document.body.appendChild(menu);
    return menu;
  }

  function closeMenu() {
    const menu = $('#stxHeaderMenu');
    if (menu) menu.style.display = 'none';
  }

  function bind() {
    const more = $('.modern-more');
    const refresh = $('#marketRefresh');
    const input = $('#proCode');
    const codeLabel = $('#stockCodeLabel');
    const change = $('#proChange');

    if (codeLabel && codeLabel.textContent.trim() === '搜尋') codeLabel.textContent = '輸入代號';
    if (change && change.textContent.includes('請先搜尋')) change.textContent = '輸入股票代號開始分析';
    if (input) input.placeholder = '輸入股票代號，例如 2330';

    if (refresh && !refresh.dataset.stxBound) {
      refresh.dataset.stxBound = '1';
      refresh.addEventListener('click', () => {
        window.STX_DASHBOARD_V5_REFRESH?.();
        document.querySelector('#proSearch')?.click();
      });
    }

    if (more && !more.dataset.stxBound) {
      more.dataset.stxBound = '1';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = ensureMenu();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      });
    }

    const menu = ensureMenu();
    if (!menu.dataset.stxBound) {
      menu.dataset.stxBound = '1';
      menu.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        closeMenu();
        if (act === 'refresh') {
          window.STX_DASHBOARD_V5_REFRESH?.();
          document.querySelector('#proSearch')?.click();
        }
        if (act === 'search') {
          goPage('overview');
          setTimeout(() => $('#proCode')?.focus(), 120);
        }
        if (act === 'replay') {
          goPage('analysis');
          window.STX_DASHBOARD_V5_REFRESH?.();
        }
        if (act === 'clear') {
          try {
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
            localStorage.clear();
            sessionStorage.clear();
          } catch (_) {}
          location.reload();
        }
      });
    }

    document.addEventListener('click', closeMenu, { once: true });
  }

  window.addEventListener('load', bind);
})();
