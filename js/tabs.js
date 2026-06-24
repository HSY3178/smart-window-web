/**
 * 标签页切换：远程控制 / 历史数据
 */
(function () {
  const tabs = document.querySelectorAll('.page-tab');
  const panels = document.querySelectorAll('.page-panel');

  function activate(name) {
    tabs.forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    panels.forEach((p) => {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (typeof window.syncLogBoxes === 'function') {
      window.syncLogBoxes();
    }
    if (name === 'monitor' && typeof window.initDbMonitor === 'function') {
      window.initDbMonitor();
    }
    history.replaceState(null, '', '#' + name);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab));
  });

  const hash = (location.hash || '#control').replace('#', '');
  activate(hash === 'monitor' ? 'monitor' : 'control');

  window.addEventListener('hashchange', () => {
    const h = (location.hash || '#control').replace('#', '');
    activate(h === 'monitor' ? 'monitor' : 'control');
  });

  /* 后台预加载 Supabase，切换标签时数据已就绪 */
  if (typeof window.initDbMonitor === 'function') {
    window.initDbMonitor();
  }
})();
