/**
 * 双页通信日志同步：控制页 logBox + 历史数据页 dbLogBox 显示相同内容
 */
(function () {
  const MAX_ENTRIES = 80;
  const BOX_IDS = ['logBox', 'dbLogBox'];
  const buffer = [];

  function renderEntry(time, text, type) {
    const el = document.createElement('div');
    el.className = 'log-entry' + (type ? ' ' + type : '');
    el.textContent = `[${time}] ${text}`;
    return el;
  }

  function trimBox(box) {
    while (box.children.length > MAX_ENTRIES) {
      box.removeChild(box.lastChild);
    }
  }

  function syncAllBoxesFromBuffer() {
    BOX_IDS.forEach((id) => {
      const box = document.getElementById(id);
      if (!box) return;
      box.innerHTML = '';
      for (let i = buffer.length - 1; i >= 0; i--) {
        const { time, text, type } = buffer[i];
        box.appendChild(renderEntry(time, text, type));
      }
    });
  }

  function addLog(text, type = '') {
    const time = new Date().toLocaleTimeString('zh-CN');
    buffer.unshift({ time, text, type });
    while (buffer.length > MAX_ENTRIES) {
      buffer.pop();
    }

    const entry = renderEntry(time, text, type);
    BOX_IDS.forEach((id) => {
      const box = document.getElementById(id);
      if (!box) return;
      box.prepend(entry.cloneNode(true));
      trimBox(box);
    });
  }

  window.addLog = addLog;
  window.syncLogBoxes = syncAllBoxesFromBuffer;

  /** 兼容旧调用 */
  window.createLogWriter = function () {
    return addLog;
  };
})();
