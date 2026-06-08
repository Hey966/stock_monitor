(() => {
  const BUILD = 'build-016';
  const KEY = 'stx_active_build';
  const FLAG = 'stx_reloaded_for_' + BUILD;

  async function clearOldCaches() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
  }

  async function unregisterOldServiceWorkers() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(async reg => {
        try {
          await reg.update();
          if (reg.active && !String(reg.active.scriptURL || '').includes(BUILD)) {
            await reg.unregister();
          }
        } catch (e) {}
      }));
    } catch (e) {}
  }

  async function notifyServiceWorkerToClear() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.active) reg.active.postMessage({ type: 'CLEAR_STX_CACHE', build: BUILD });
    } catch (e) {}
  }

  async function hardReloadIfNeeded() {
    const current = localStorage.getItem(KEY);
    if (current === BUILD) return;

    localStorage.setItem(KEY, BUILD);
    await clearOldCaches();
    await unregisterOldServiceWorkers();
    await notifyServiceWorkerToClear();

    if (!sessionStorage.getItem(FLAG)) {
      sessionStorage.setItem(FLAG, '1');
      const url = new URL(location.href);
      url.searchParams.set('v', BUILD + '-' + Date.now());
      location.replace(url.toString());
    }
  }

  window.STX_FORCE_UPDATE = async () => {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(FLAG);
    await clearOldCaches();
    await unregisterOldServiceWorkers();
    await notifyServiceWorkerToClear();
    const url = new URL(location.href);
    url.searchParams.set('v', BUILD + '-manual-' + Date.now());
    location.replace(url.toString());
  };

  window.addEventListener('load', () => {
    setTimeout(hardReloadIfNeeded, 300);
  });
})();