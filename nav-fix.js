(() => {
  const $ = (s) => document.querySelector(s);

  function switchModernPage(page) {
    document.querySelectorAll('.modern-page').forEach((el) => {
      el.classList.toggle('active', el.id === `page-${page}`);
    });
    document.querySelectorAll('.modern-bottom button[data-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'overview') {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    }
  }

  function syncCodeLabel() {
    const title = $('#proTitle')?.textContent || '';
    const inputCode = $('#proCode')?.value || '';
    const code = title.match(/\d{4,6}/)?.[0] || inputCode.match(/\d{4,6}/)?.[0] || '2330';
    const label = $('#stockCodeLabel');
    if (label) label.textContent = code;
  }

  function bindSearchHome() {
    $('#openSearchPage')?.addEventListener('click', (event) => {
      event.preventDefault();
      switchModernPage('search');
      setTimeout(() => $('#proCode')?.focus(), 180);
    });

    $('#proSearch')?.addEventListener('click', () => {
      setTimeout(() => {
        syncCodeLabel();
        switchModernPage('overview');
      }, 650);
    });

    $('#proCode')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        setTimeout(() => {
          syncCodeLabel();
          switchModernPage('overview');
        }, 650);
      }
    });

    document.querySelectorAll('.modern-bottom button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => switchModernPage(btn.dataset.page));
    });

    const title = $('#proTitle');
    if (title) {
      new MutationObserver(syncCodeLabel).observe(title, { childList: true, subtree: true, characterData: true });
    }
    syncCodeLabel();
  }

  window.addEventListener('load', bindSearchHome);
})();
