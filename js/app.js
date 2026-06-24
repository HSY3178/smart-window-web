/**
 * 智能温控开窗系统 - Web 控制面板
 * 通过巴法云 MQTT WebSocket 与 STM32 设备通信
 */

const config = loadConfig();

const CONTROL_BUTTON_IDS = [
  'btnOpen', 'btnClose', 'btnHalf', 'btnExtra', 'btnManual', 'btnAuto', 'btnGet',
  'btnRfTx', 'btnRfRx',
  'btnBeepOnce', 'btnBeepThree', 'btnBeepLong',
  'btnBeepHalf', 'btnBeepFull', 'btnBeepFault',
  'btnIrClose', 'btnIrOpen', 'btnIwdgTest',
  'btnApplyThresh', 'btnSaveThresh', 'btnDefaultThresh',
];

const WIRELESS_MODE_MAP = {
  0: '空闲',
  1: 'TX',
  2: 'RX',
};

const REMOTE_KEY_MAP = {
  0: '无',
  22: '键1 · 关窗',
  25: '键2 · 开窗',
  162: '电源',
  98: '上',
  168: '下',
  224: '左',
  194: '右',
};

const els = {
  connBadge: document.getElementById('connBadge'),
  connText: document.getElementById('connText'),
  tempValue: document.getElementById('tempValue'),
  slaveTempValue: document.getElementById('slaveTempValue'),
  windowPane: document.getElementById('windowPane'),
  angleLabel: document.getElementById('angleLabel'),
  angleDesc: document.getElementById('angleDesc'),
  modeTag: document.getElementById('modeTag'),
  faultTag: document.getElementById('faultTag'),
  wifiTag: document.getElementById('wifiTag'),
  slaveOnlineTag: document.getElementById('slaveOnlineTag'),
  wirelessModeTag: document.getElementById('wirelessModeTag'),
  lockTag: document.getElementById('lockTag'),
  lastUpdate: document.getElementById('lastUpdate'),
  logBox: document.getElementById('logBox'),
  btnConnect: document.getElementById('btnConnect'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  inputUid: document.getElementById('inputUid'),
  inputTopic: document.getElementById('inputTopic'),
  inputWsUrl: document.getElementById('inputWsUrl'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),
  refOpen: document.getElementById('refOpen'),
  refClose: document.getElementById('refClose'),
  inputThreshOpen: document.getElementById('inputThreshOpen'),
  inputThreshClose: document.getElementById('inputThreshClose'),
  threshHint: document.getElementById('threshHint'),
  remoteKeyTag: document.getElementById('remoteKeyTag'),
  cloudCmdTag: document.getElementById('cloudCmdTag'),
  iwdgTag: document.getElementById('iwdgTag'),
  iwdgStatusDetail: document.getElementById('iwdgStatusDetail'),
};

CONTROL_BUTTON_IDS.forEach((id) => {
  els[id] = document.getElementById(id);
});

let mqttClient = null;
let connected = false;
/** 用户正在编辑阈值时，不被设备周期上报覆盖 */
let threshDirty = false;

/** 解析设备上报: H:25.3,A:45,M:AUTO,F:OK,W:1,R:0,C:NONE,K:1 */
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

function remoteKeyLabel(code) {
  const n = Number(code);
  if (REMOTE_KEY_MAP[n] !== undefined) {
    return `${REMOTE_KEY_MAP[n]} (${n})`;
  }
  if (n === 0) {
    return '无';
  }
  return `未知键 (${n})`;
}

function formatThresh(val) {
  return `${Number(val).toFixed(1)}°C`;
}

function validateThresholds(openVal, closeVal) {
  const open = Number(openVal);
  const close = Number(closeVal);
  if (Number.isNaN(open) || Number.isNaN(close)) {
    return '请输入有效数字';
  }
  if (open < -10 || open > 85 || close < -10 || close > 85) {
    return '阈值须在 -10 ~ 85°C 范围内';
  }
  if (open <= close) {
    return '开窗阈值必须大于关窗阈值';
  }
  return null;
}

function readThresholdInputs() {
  return {
    open: els.inputThreshOpen.value,
    close: els.inputThreshClose.value,
  };
}

function updateThresholdDisplay(openVal, closeVal) {
  els.refOpen.textContent = formatThresh(openVal);
  els.refClose.textContent = formatThresh(closeVal);
  els.inputThreshOpen.value = Number(openVal).toFixed(1);
  els.inputThreshClose.value = Number(closeVal).toFixed(1);
}

function updateThresholdHint() {
  const { open, close } = readThresholdInputs();
  const err = validateThresholds(open, close);
  els.threshHint.textContent = err || '开窗 > 关窗，-10~85°C';
  els.threshHint.className = 'thresh-hint' + (err ? ' error' : '');
  return !err;
}

function angleToDesc(angle) {
  const a = Number(angle);
  if (a <= 10) return '关闭';
  if (a <= 50) return '半开';
  if (a <= 100) return '全开';
  return '扩展';
}

function remoteKeyShort(code) {
  const n = Number(code);
  if (n === 0) return '无';
  if (n === 22) return '键1关';
  if (n === 25) return '键2开';
  return String(n);
}

function angleToHeight(angle) {
  const a = Math.min(135, Math.max(0, Number(angle) || 0));
  return (a / 135) * 100;
}

function updateIwdgUI(kVal) {
  const ok = kVal === '1';
  const text = ok ? '正常' : '异常';
  els.iwdgTag.textContent = ok ? 'IWDG OK' : 'IWDG !';
  els.iwdgTag.className = 'pill ' + (ok ? 'tag-ok' : 'tag-fault');
  els.iwdgStatusDetail.textContent = text;
  els.iwdgStatusDetail.className = 'pill pill-sm ' + (ok ? 'tag-ok' : 'tag-fault');
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
    els.modeTag.className = 'pill ' + (isAuto ? 'tag-auto' : 'tag-manual');
  }

  if (data.F !== undefined) {
    const ok = data.F.toUpperCase() === 'OK';
    els.faultTag.textContent = ok ? '正常' : '故障';
    els.faultTag.className = 'tag ' + (ok ? 'tag-ok' : 'tag-fault');
  }

  if (data.W !== undefined) {
    const online = data.W === '1';
    els.wifiTag.textContent = online ? 'WiFi 在线' : 'WiFi 离线';
    els.wifiTag.className = 'pill ' + (online ? 'tag-ok' : 'tag-fault');
  }

  if (data.S !== undefined) {
    if (data.So === '0') {
      els.slaveTempValue.textContent = '--';
    } else {
      els.slaveTempValue.textContent = data.S;
    }
  }

  if (data.So !== undefined) {
    const slaveOn = data.So === '1';
    els.slaveOnlineTag.textContent = slaveOn ? '从机在线' : '从机离线';
    els.slaveOnlineTag.className = 'pill ' + (slaveOn ? 'tag-ok' : 'tag-fault');
  }

  if (data.Wm !== undefined) {
    const wm = Number(data.Wm);
    els.wirelessModeTag.textContent = WIRELESS_MODE_MAP[wm] || `模式 ${wm}`;
  }

  if (data.L !== undefined) {
    const lockMs = Number(data.L);
    els.lockTag.textContent = lockMs > 0 ? `${lockMs} ms` : '无锁定';
  }

  if (data.R !== undefined) {
    els.remoteKeyTag.textContent = remoteKeyShort(data.R);
  }

  if (data.C !== undefined) {
    els.cloudCmdTag.textContent = data.C;
  }

  if (data.K !== undefined) {
    updateIwdgUI(data.K);
  }

  if (data.To !== undefined && data.Tc !== undefined) {
    const openVal = Number(data.To);
    const closeVal = Number(data.Tc);
    const matchesLocal =
      Math.abs(openVal - config.tempOpen) < 0.05 &&
      Math.abs(closeVal - config.tempClose) < 0.05;

    if (!threshDirty || matchesLocal) {
      updateThresholdDisplay(openVal, closeVal);
      persistThresholdsToConfig(openVal, closeVal);
      updateThresholdHint();
      if (matchesLocal) {
        threshDirty = false;
      }
    }
  }

  els.lastUpdate.textContent = new Date().toLocaleString('zh-CN');
}

function setConnStatus(online, text) {
  connected = online;
  els.connBadge.className = 'status-badge ' + (online ? 'online' : 'offline');
  els.connText.textContent = text;
  CONTROL_BUTTON_IDS.forEach((id) => {
    if (els[id]) {
      els[id].disabled = !online;
    }
  });
  els.btnConnect.disabled = online;
  els.btnDisconnect.disabled = !online;
}

function addLog(text, type = '') {
  logWriter(text, type);
}

const logWriter = createLogWriter('logBox', 80);

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

function publishWithConfirm(cmd, message) {
  if (!confirm(message)) {
    return;
  }
  publishCommand(cmd);
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

function persistThresholdsToConfig(openVal, closeVal) {
  config.tempOpen = openVal;
  config.tempClose = closeVal;
  saveConfig(config);
}

function initForm() {
  els.inputUid.value = config.uid;
  els.inputTopic.value = config.topic;
  els.inputWsUrl.value = config.mqttWsUrl;
  updateThresholdDisplay(config.tempOpen, config.tempClose);
  updateThresholdHint();
  /* 有本地保存记录时优先显示本地阈值，避免被设备旧值刷回 */
  threshDirty = !!localStorage.getItem('smartWindowConfig');
}

function applyThresholds() {
  if (!updateThresholdHint()) {
    addLog('阈值校验失败，请检查输入', 'err');
    return;
  }
  const { open, close } = readThresholdInputs();
  const openVal = Number(Number(open).toFixed(1));
  const closeVal = Number(Number(close).toFixed(1));
  publishCommand(`SET_TEMP=${openVal.toFixed(1)},${closeVal.toFixed(1)}`);
  persistThresholdsToConfig(openVal, closeVal);
  threshDirty = true;
  addLog('阈值已应用到设备', 'cmd');
  setTimeout(() => publishCommand('GET'), 400);
}

els.btnOpen.addEventListener('click', () => publishCommand('OPEN'));
els.btnClose.addEventListener('click', () => publishCommand('CLOSE'));
els.btnHalf.addEventListener('click', () => publishCommand('SERVO_HALF'));
els.btnExtra.addEventListener('click', () => publishCommand('SERVO_135'));
els.btnManual.addEventListener('click', () => publishCommand('MANUAL'));
els.btnAuto.addEventListener('click', () => publishCommand('AUTO'));
els.btnGet.addEventListener('click', () => publishCommand('GET'));

els.btnRfTx.addEventListener('click', () => publishCommand('RF_TX'));
els.btnRfRx.addEventListener('click', () => publishCommand('RF_RX'));

els.btnBeepOnce.addEventListener('click', () => publishCommand('BEEP_ONCE'));
els.btnBeepThree.addEventListener('click', () => publishCommand('BEEP_THREE'));
els.btnBeepLong.addEventListener('click', () => publishCommand('BEEP_LONG'));
els.btnBeepHalf.addEventListener('click', () => publishCommand('BEEP_HALF'));
els.btnBeepFull.addEventListener('click', () => publishCommand('BEEP_FULL'));
els.btnBeepFault.addEventListener('click', () => publishCommand('BEEP_FAULT'));

els.btnIrClose.addEventListener('click', () => publishCommand('IR_CLOSE'));
els.btnIrOpen.addEventListener('click', () => publishCommand('IR_OPEN'));

els.btnIwdgTest.addEventListener('click', () => {
  publishWithConfirm(
    'IWDG_TEST',
    '看门狗测试将停止喂狗，设备约 5 秒后复位重启。确定继续？'
  );
});

els.btnApplyThresh.addEventListener('click', applyThresholds);
els.btnSaveThresh.addEventListener('click', () => {
  if (!updateThresholdHint()) {
    addLog('请先修正阈值再保存', 'err');
    return;
  }
  const { open, close } = readThresholdInputs();
  const openVal = Number(Number(open).toFixed(1));
  const closeVal = Number(Number(close).toFixed(1));
  publishCommand(`SET_TEMP=${openVal.toFixed(1)},${closeVal.toFixed(1)}`);
  persistThresholdsToConfig(openVal, closeVal);
  threshDirty = true;
  setTimeout(() => publishCommand('TEMP_SAVE'), 400);
  setTimeout(() => {
    publishCommand('GET');
    addLog('阈值已写入设备 Flash 并保存到本地', 'cmd');
  }, 800);
});
els.btnDefaultThresh.addEventListener('click', () => {
  threshDirty = false;
  publishCommand('TEMP_DEFAULT');
  setTimeout(() => publishCommand('GET'), 400);
});

els.inputThreshOpen.addEventListener('input', () => {
  threshDirty = true;
  updateThresholdHint();
});
els.inputThreshClose.addEventListener('input', () => {
  threshDirty = true;
  updateThresholdHint();
});

els.btnConnect.addEventListener('click', connectMqtt);
els.btnDisconnect.addEventListener('click', disconnectMqtt);

els.btnSaveConfig.addEventListener('click', () => {
  config.uid = els.inputUid.value.trim();
  config.topic = els.inputTopic.value.trim();
  config.mqttWsUrl = els.inputWsUrl.value.trim();
  if (updateThresholdHint()) {
    const { open, close } = readThresholdInputs();
    config.tempOpen = Number(Number(open).toFixed(1));
    config.tempClose = Number(Number(close).toFixed(1));
    threshDirty = true;
  }
  saveConfig(config);
  addLog('配置已保存到浏览器本地');
  disconnectMqtt();
});

initForm();
setConnStatus(false, '未连接');
addLog('控制面板已就绪，点击「连接云端」开始');
