/**
 * Bemfa getmsg → Supabase sensor_data（支持本地 config.js / 云端环境变量）
 * API: GET https://apis.bemfa.com/va/getmsg?uid=&topic=&type=1&num=1
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const CONFIG_PATH = path.join(__dirname, 'config.js');
const STATE_PATH = path.join(__dirname, '.sync-state.json');
const BEMFA_GETMSG = 'https://apis.bemfa.com/va/getmsg';
const runOnce = process.argv.includes('--once');

let memoryState = null;

function loadConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return {
      bemfa: {
        uid: process.env.BEMFA_UID || '',
        topic: process.env.BEMFA_TOPIC || 'light004',
        type: Number(process.env.BEMFA_TYPE || 1),
        num: Number(process.env.BEMFA_NUM || 1),
      },
      supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        table: process.env.SUPABASE_TABLE || 'sensor_data',
      },
      syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 5000),
    };
  }

  if (fs.existsSync(CONFIG_PATH)) {
    return require(CONFIG_PATH);
  }

  console.error('缺少配置：云端请设置环境变量，本地请复制 config.example.js 为 config.js');
  process.exit(1);
}

function loadState() {
  if (memoryState) {
    return memoryState;
  }
  try {
    if (fs.existsSync(STATE_PATH)) {
      memoryState = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      return memoryState;
    }
  } catch (_) {
    /* ignore */
  }
  memoryState = { lastUnix: 0, lastMsg: '' };
  return memoryState;
}

function saveState(state) {
  memoryState = state;
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (_) {
    /* 云端无持久磁盘时仅内存去重 */
  }
}

function parseField(msg, prefix) {
  const re = new RegExp(`${prefix}:([^,\\r\\n]+)`);
  const m = msg.match(re);
  return m ? m[1].trim() : null;
}

function parseSensorMsg(msg) {
  if (!msg || typeof msg !== 'string') {
    return null;
  }

  const h = parseField(msg, 'H');
  if (h == null) {
    return null;
  }

  const temperature = Number.parseFloat(h);
  if (Number.isNaN(temperature)) {
    return null;
  }

  const aStr = parseField(msg, 'A');
  const angle = aStr != null ? Number.parseInt(aStr, 10) : 0;
  const door_state = !Number.isNaN(angle) && angle >= 90 ? 1 : 0;

  return { temperature, door_state };
}

async function fetchBemfaLatest(cfg) {
  const { uid, topic, type, num } = cfg.bemfa;
  if (!uid) {
    throw new Error('BEMFA_UID 未配置');
  }

  const url = `${BEMFA_GETMSG}?uid=${encodeURIComponent(uid)}&topic=${encodeURIComponent(topic)}&type=${type}&num=${num}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Bemfa HTTP ${res.status}`);
  }

  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`Bemfa code=${body.code} ${body.message || ''}`);
  }

  if (!Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }

  return body.data[0];
}

async function insertSupabase(supabase, table, row) {
  const { error } = await supabase.from(table).insert({
    temperature: row.temperature,
    door_state: row.door_state,
  });

  if (error) {
    throw new Error(`Supabase insert: ${error.message}`);
  }
}

async function syncOnce(cfg, supabase, state) {
  const item = await fetchBemfaLatest(cfg);
  if (!item) {
    console.log('[sync] Bemfa 暂无消息');
    return state;
  }

  const unix = Number(item.unix) || 0;
  const msg = String(item.msg || '').trim();

  if (unix > 0 && unix <= state.lastUnix && msg === state.lastMsg) {
    console.log('[sync] 无新数据，跳过');
    return state;
  }

  const parsed = parseSensorMsg(msg);
  if (!parsed) {
    console.warn('[sync] 无法解析消息:', msg.slice(0, 80));
    return state;
  }

  await insertSupabase(supabase, cfg.supabase.table, parsed);

  const next = {
    lastUnix: unix || state.lastUnix,
    lastMsg: msg,
  };
  saveState(next);

  console.log(
    `[sync] OK temp=${parsed.temperature.toFixed(1)} door=${parsed.door_state} unix=${unix} time=${item.time || '-'}`
  );
  return next;
}

function startHealthServer(port) {
  let lastSync = null;
  let lastError = null;
  let syncCount = 0;

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'greenhouse-sync',
        syncCount,
        lastSync,
        lastError,
      }));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`[health] http://0.0.0.0:${port}/health`);
  });

  return {
    onSyncOk() {
      syncCount += 1;
      lastSync = new Date().toISOString();
      lastError = null;
    },
    onSyncFail(err) {
      lastError = err.message || String(err);
    },
  };
}

async function main() {
  const cfg = loadConfig();
  let state = loadState();

  if (!cfg.supabase.url || !cfg.supabase.anonKey || cfg.supabase.anonKey === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('请配置 SUPABASE_URL 与 SUPABASE_ANON_KEY');
    process.exit(1);
  }
  if (!cfg.bemfa.uid) {
    console.error('请配置 BEMFA_UID');
    process.exit(1);
  }

  const supabase = createClient(cfg.supabase.url, cfg.supabase.anonKey);
  const port = Number(process.env.PORT || 0);
  const health = port > 0 ? startHealthServer(port) : null;

  console.log('Greenhouse sync started');
  console.log(`  Bemfa: uid=${cfg.bemfa.uid.slice(0, 8)}... topic=${cfg.bemfa.topic} type=${cfg.bemfa.type} num=${cfg.bemfa.num}`);
  console.log(`  Supabase: ${cfg.supabase.table}`);
  console.log(`  Interval: ${cfg.syncIntervalMs}ms`);
  console.log(`  Config: ${process.env.SUPABASE_URL ? '环境变量' : 'config.js'}`);

  const tick = async () => {
    try {
      state = await syncOnce(cfg, supabase, state);
      if (health) health.onSyncOk();
    } catch (err) {
      console.error('[sync] fail:', err.message);
      if (health) health.onSyncFail(err);
    }
  };

  await tick();

  if (runOnce) {
    return;
  }

  setInterval(tick, cfg.syncIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
