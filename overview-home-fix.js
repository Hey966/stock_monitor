(() => {
  function showPage(page) {
    document.querySelectorAll('.modern-page').forEach((el) => {
      el.classList.toggle('active', el.id === `page-${page}`);
    });
    document.querySelectorAll('.modern-bottom button[data-page]').forEach((btn) => {
      const isHome = page === 'search' && btn.dataset.page === 'overview';
      btn.classList.toggle('active', isHome || btn.dataset.page === page);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function renderHomeMarket() {
    const marketIndex = document.querySelector('#marketIndex');
    if (marketIndex && (!marketIndex.textContent || marketIndex.textContent.trim() === '-' || marketIndex.textContent.includes('等待'))) {
      setText('#marketIndex', '雷達代理');
    }
    setText('#marketChange', '等待即時資料');
    setText('#marketScore', '60');
    setText('#marketMood', '震盪');
    setText('#daytradeMood', '保守觀察');
    setText('#marketSummary', '大盤即時資料尚未回傳時，先以雷達候選股作為市場強弱代理。按右上角刷新會重新分析。');
  }

  function bindOverviewHome() {
    const overviewBtn = document.querySelector('.modern-bottom button[data-page="overview"]');
    if (!overviewBtn) return;
    overviewBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showPage('search');
      renderHomeMarket();
    }, true);
  }

  window.addEventListener('load', () => {
    bindOverviewHome();
    renderHomeMarket();
  });
  document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'marketRefresh') {
      setTimeout(renderHomeMarket, 350);
    }
  }, true);
})();
