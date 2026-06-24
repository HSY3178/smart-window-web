/**
 * 通用通信日志（控制页 / 数据库页共用）
 */
function createLogWriter(boxId, maxEntries = 80) {
  const box = document.getElementById(boxId);

  return function addLog(text, type = '') {
    if (!box) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ' ' + type : '');
    entry.textContent = `[${new Date().toLocaleTimeString('zh-CN')}] ${text}`;
    box.prepend(entry);

    while (box.children.length > maxEntries) {
      box.removeChild(box.lastChild);
    }
  };
}
