/** 默认配置，与 User/device_config.h 保持一致 */
const DEFAULT_CONFIG = {
  uid: '45c255a3ffe318013c347e50f7a8fabe',
  topic: 'light004',
  mqttWsUrl: 'wss://bemfa.com:9504/wss',
  /** 温度阈值默认值，与 temp_param / 设备 Flash 一致，网页可远程修改 */
  tempOpen: 31.0,
  tempClose: 29.0,
};

function loadConfig() {
  try {
    const saved = localStorage.getItem('smartWindowConfig');
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (_) {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  localStorage.setItem('smartWindowConfig', JSON.stringify(config));
}
