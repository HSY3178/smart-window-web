/**
 * 智能温控开窗系统 - Web 控制面板
 * 通过巴法云 MQTT WebSocket 与 STM32 设备通信
 */

const config = loadConfig();

const els = {
  connBadge: document.getElementById('connBadge'),
  connText: document.getElementById('connText'),
  tempValue: document.getElementById('tempValue'),
  windowPane: document.getElementById('windowPane'),
  angleLabel: document.getElementById('angleLabel'),
  angleDesc: document.getElementById('angleDesc'),
  modeTag: document.getElementById('modeTag'),
  faultTag: document.getElementById('faultTag'),
  wifiTag: document.getElementById('wifiTag'),
  lastUpdate: document.getElementById('lastUpdate'),
  logBox: document.getElementById('logBox'),
  btnOpen: document.getElementById('btnOpen'),
  btnClose: document.getElementById('btnClose'),
  btnAuto: document.getElementById('btnAuto'),
  btnGet: document.getElementById('btnGet'),
  btnConnect: document.getElementById('btnConnect'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  inputUid: document.getElementById('inputUid'),
  inputTopic: document.getElementById('inputTopic'),
  inputWsUrl: document.getElementById('inputWsUrl'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),
  refOpen: document.getElementById('refOpen'),
  refClose: document.getElementById('refClose'),
};

let mqttClient = null;
let connected = false;

/** 解析设备上报: H:25.3,A:45,M:AUTO,F:OK,W:1 */
function parseStatus(msg) {
  const data = {};
  const parts = msg.replace(/\r?\n/g, '').split(',');
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      data[key] = val;
    }
  }
  return data;
}

function angleToDesc(angle) {
  const a = Number(angle);
  if (a <= 10) return '完全关闭 (0°)';
  if (a <= 50) return '半开 (45°)';
  if (a <= 100) return '完全打开 (90°)';
  return '扩展角度 (135°)';
}

function angleToHeight(angle) {
  const a = Math.min(135, Math.max(0, Number(angle) || 0));
  return (a / 135) * 100;
}

function updateUI(data) {
  if (data.H !== undefined) {
    els.tempValue.textContent = data.H;
  }

  if (data.A !== undefined) {
    const angle = data.A;
    els.angleLabel.textContent = `${angle}°`;
    els.angleDesc.textContent = angleToDesc(angle);
    els.windowPane.style.height = `${angleToHeight(angle)}%`;
  }

  if (data.M !== undefined) {
    const isAuto = data.M.toUpperCase() === 'AUTO';
    els.modeTag.textContent = isAuto ? '自动' : '手动';
    els.modeTag.className = 'tag ' + (isAuto ? 'tag-auto' : 'tag-manual');
  }

  if (data.F !== undefined) {
    const ok = data.F.toUpperCase() === 'OK';
    els.faultTag.textContent = ok ? '正常' : '故障';
    els.faultTag.className = 'tag ' + (ok ? 'tag-ok' : 'tag-fault');
  }

  if (data.W !== undefined) {
    const online = data.W === '1';
    els.wifiTag.textContent = online ? '已连接' : '未连接';
    els.wifiTag.className = 'tag ' + (online ? 'tag-ok' : 'tag-fault');
  }

  els.lastUpdate.textContent = new Date().toLocaleString('zh-CN');
}

function setConnStatus(online, text) {
  connected = online;
  els.connBadge.className = 'status-badge ' + (online ? 'online' : 'offline');
  els.connText.textContent = text;
  const btns = [els.btnOpen, els.btnClose, els.btnAuto, els.btnGet];
  btns.forEach((b) => (b.disabled = !online));
  els.btnConnect.disabled = online;
  els.btnDisconnect.disabled = !online;
}

function addLog(text, type = '') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = `[${new Date().toLocaleTimeString('zh-CN')}] ${text}`;
  els.logBox.prepend(entry);
  while (els.logBox.children.length > 80) {
    els.logBox.removeChild(els.logBox.lastChild);
  }
}

function publishCommand(cmd) {
  if (!mqttClient || !connected) {
    addLog('未连接云端，无法发送指令', 'err');
    return;
  }
  const topic = config.topic;
  mqttClient.publish(topic, cmd, { qos: 0 }, (err) => {
    if (err) {
      addLog(`发送失败: ${cmd} - ${err.message}`, 'err');
    } else {
      addLog(`已发送指令: ${cmd}`, 'cmd');
    }
  });
}

function connectMqtt() {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }

  const uid = config.uid.trim();
  const topic = config.topic.trim();
  const wsUrl = config.mqttWsUrl.trim();

  if (!uid || !topic) {
    addLog('UID 和主题不能为空', 'err');
    return;
  }

  setConnStatus(false, '连接中...');
  addLog(`正在连接 ${wsUrl}，主题: ${topic}`);

  mqttClient = mqtt.connect(wsUrl, {
    clientId: uid,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 5000,
    keepalive: 60,
  });

  mqttClient.on('connect', () => {
    setConnStatus(true, '云端已连接');
    addLog('MQTT 连接成功', 'recv');

    mqttClient.subscribe(topic, { qos: 0 }, (err) => {
      if (err) {
        addLog(`订阅失败: ${err.message}`, 'err');
      } else {
        addLog(`已订阅主题: ${topic}`, 'recv');
        publishCommand('GET');
      }
    });
  });

  mqttClient.on('message', (recvTopic, payload) => {
    const msg = payload.toString();
    if (!msg.startsWith('H:')) {
      return;
    }
    addLog(`收到状态: ${msg.trim()}`, 'recv');
    updateUI(parseStatus(msg));
  });

  mqttClient.on('error', (err) => {
    addLog(`MQTT 错误: ${err.message}`, 'err');
  });

  mqttClient.on('close', () => {
    if (connected) {
      setConnStatus(false, '连接已断开');
      addLog('MQTT 连接关闭', 'err');
    }
  });

  mqttClient.on('reconnect', () => {
    setConnStatus(false, '重新连接中...');
    addLog('正在重新连接...');
  });
}

function disconnectMqtt() {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }
  setConnStatus(false, '未连接');
  addLog('已断开连接');
}

function initForm() {
  els.inputUid.value = config.uid;
  els.inputTopic.value = config.topic;
  els.inputWsUrl.value = config.mqttWsUrl;
  els.refOpen.textContent = `${config.tempOpen}°C`;
  els.refClose.textContent = `${config.tempClose}°C`;
}

els.btnOpen.addEventListener('click', () => publishCommand('OPEN'));
els.btnClose.addEventListener('click', () => publishCommand('CLOSE'));
els.btnAuto.addEventListener('click', () => publishCommand('AUTO'));
els.btnGet.addEventListener('click', () => publishCommand('GET'));
els.btnConnect.addEventListener('click', connectMqtt);
els.btnDisconnect.addEventListener('click', disconnectMqtt);

els.btnSaveConfig.addEventListener('click', () => {
  config.uid = els.inputUid.value.trim();
  config.topic = els.inputTopic.value.trim();
  config.mqttWsUrl = els.inputWsUrl.value.trim();
  saveConfig(config);
  els.refOpen.textContent = `${config.tempOpen}°C`;
  els.refClose.textContent = `${config.tempClose}°C`;
  addLog('配置已保存到浏览器本地');
  disconnectMqtt();
});

initForm();
setConnStatus(false, '未连接');
addLog('控制面板已就绪，点击「连接云端」开始');
