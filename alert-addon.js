(() => {
  const $ = (s) => document.querySelector(s);

  function setStatus(text) {
    const el = $('#discordPushStatus');
    if (el) el.textContent = text;
  }

  function ensure() {
    if ($('#alertPanel')) return;
    const host = $('#proEnginePanel') || $('#fusionPanel') || $('#entrySummaryPanel');
    if (!host || !host.parentNode) return;
    const el = document.createElement('section');
    el.id = 'alertPanel';
    el.className = 'entry-summary-panel terminal-alert-panel';
    el.innerHTML = `
      <span>Discord 推播狀態</span>
      <strong id="alertTitle">單股查詢不推播</strong>
      <p id="alertReason">Discord 只接收雷達頁全市場掃描後的前 5 名。單股搜尋與分析頁只顯示判斷，不會送出推播。</p>
      <p id="discordPushStatus" style="margin-top:8px;font-weight:800;color:#f8d36b">Discord：雷達前5專用</p>
      <div id="alertTags" class="analysis-tags">
        <span>單股查詢不推播</span>
        <span>雷達頁前5才推播</span>
        <span>規則分析優先</span>
      </div>
    `;
    host.parentNode.insertBefore(el, host.nextSibling);
  }

  function render() {
    ensure();
    const p = $('#alertPanel');
    if (p) p.className = 'entry-summary-panel terminal-alert-panel';
    if ($('#alertTitle')) $('#alertTitle').textContent = '單股查詢不推播';
    if ($('#alertReason')) $('#alertReason').textContent = '目前為單股查詢模式。Discord 推播來源只能是雷達頁全市場掃描後的前 5 名。';
    if ($('#alertTags')) {
      $('#alertTags').innerHTML = '<span>Single Stock：不推播</span><span>Radar TOP5：才推播</span><span>Final Result 優先</span>';
    }
    setStatus('Discord：雷達前5專用');
  }

  window.STX_ALERT_RENDER = render;
  window.STX_TEST_DISCORD = () => setStatus('Discord：手動測試已停用，請使用雷達頁前5推播流程。');
  window.addEventListener('stx-pro-analysis', () => setTimeout(render, 200));
  window.addEventListener('load', () => setInterval(render, 1500));
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'proSearch' || e.target.id === 'marketRefresh')) setTimeout(render, 800);
  }, true);
})();