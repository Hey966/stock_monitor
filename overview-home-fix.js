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

  function bindOverviewHome() {
    const overviewBtn = document.querySelector('.modern-bottom button[data-page="overview"]');
    if (!overviewBtn) return;
    overviewBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showPage('search');
    }, true);
  }

  window.addEventListener('load', bindOverviewHome);
})();
