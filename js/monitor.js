/**
 * Supabase 历史数据监控（与远程控制面板同页）
 */
(function () {
  const MAX_POINTS = 100;
  const dbLog = createLogWriter('dbLogBox', 80);

  const els = {
    dbTempValue: document.getElementById('dbTempValue'),
    dbDoorValue: document.getElementById('dbDoorValue'),
    dbDoorCard: document.getElementById('dbDoorCard'),
    dbLastUpdate: document.getElementById('dbLastUpdate'),
    dbLiveBadge: document.getElementById('dbLiveBadge'),
    dbLiveText: document.getElementById('dbLiveText'),
    dbErrorBox: document.getElementById('dbErrorBox'),
  };

  let chart = null;
  let labels = [];
  let temps = [];
  let supabaseClient = null;
  let pollTimer = null;
  let monitorStarted = false;

  function cfg() {
    return typeof loadConfig === 'function' ? loadConfig() : {};
  }

  function showError(msg) {
    if (!els.dbErrorBox) return;
    els.dbErrorBox.textContent = msg;
    els.dbErrorBox.classList.add('show');
    dbLog(msg, 'err');
  }

  function clearError() {
    if (!els.dbErrorBox) return;
    els.dbErrorBox.textContent = '';
    els.dbErrorBox.classList.remove('show');
  }

  function setLiveStatus(online, text) {
    if (!els.dbLiveBadge) return;
    els.dbLiveBadge.className = 'status-badge ' + (online ? 'online' : 'offline');
    if (els.dbLiveText) els.dbLiveText.textContent = text;
  }

  function formatTime(iso) {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  function updateDoorUI(doorState) {
    if (!els.dbDoorValue || !els.dbDoorCard) return;
    const isOpen = Number(doorState) === 1;
    els.dbDoorValue.textContent = isOpen ? '开门' : '关门';
    els.dbDoorCard.className = 'monitor-stat ' + (isOpen ? 'door-open' : 'door-closed');
  }

  function updateLatestUI(row) {
    if (row.temperature != null && els.dbTempValue) {
      els.dbTempValue.textContent = Number(row.temperature).toFixed(1);
    }
    if (row.door_state != null) {
      updateDoorUI(row.door_state);
    }
    if (row.created_at && els.dbLastUpdate) {
      els.dbLastUpdate.textContent = '最后更新：' + formatTime(row.created_at);
    }
  }

  function rowSortKey(row) {
    if (row.created_at) return new Date(row.created_at).getTime();
    return Number(row.id) || 0;
  }

  function loadHistoryToChart(rows) {
    const sorted = [...rows].sort((a, b) => rowSortKey(a) - rowSortKey(b));
    labels = sorted.map((r) =>
      r.created_at ? formatTime(r.created_at) : `#${r.id ?? '?'}`
    );
    temps = sorted.map((r) =>
      r.temperature != null ? Number(r.temperature) : null
    );
  }

  function initChart() {
    const canvas = document.getElementById('dbTempChart');
    if (!canvas || typeof Chart === 'undefined') return;

    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '温度 (°C)',
          data: temps,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.12)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                return ` ${ctx.parsed.y.toFixed(1)} °C`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, maxRotation: 0, color: '#7d8da6', font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: {
              callback(v) { return v + '°C'; },
              color: '#7d8da6',
              font: { size: 10 },
            },
            grid: { color: 'rgba(42, 53, 68, 0.8)' },
          },
        },
      },
    });
  }

  function pushChartPoint(row) {
    const label = row.created_at ? formatTime(row.created_at) : `#${row.id ?? '?'}`;
    const temp = row.temperature != null ? Number(row.temperature) : null;

    labels.push(label);
    temps.push(temp);
    if (labels.length > MAX_POINTS) {
      labels.shift();
      temps.shift();
    }
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = temps;
      chart.update('none');
    }
  }

  function applyHistoryRows(rows) {
    if (!rows || rows.length === 0) {
      if (els.dbLastUpdate) els.dbLastUpdate.textContent = '最后更新：暂无数据';
      return;
    }
    updateLatestUI(rows[0]);
    loadHistoryToChart(rows);
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = temps;
      chart.update('none');
    }
  }

  async function fetchHistory(supabase, table) {
    const { data, error } = await supabase
      .from(table)
      .select('id, temperature, door_state, created_at')
      .order('id', { ascending: false })
      .limit(MAX_POINTS);
    if (error) throw error;
    return data || [];
  }

  async function refreshHistory(showEmptyHint) {
    if (!supabaseClient) return;
    const c = cfg();
    try {
      const rows = await fetchHistory(supabaseClient, c.supabaseTable || 'sensor_data');
      applyHistoryRows(rows);
      if (rows.length > 0) {
        const latest = rows[0];
        dbLog(
          `轮询刷新: ${rows.length} 条, 最新 temp=${Number(latest.temperature).toFixed(1)}°C door=${latest.door_state}`,
          'recv'
        );
      } else {
        dbLog('轮询刷新: 暂无记录', 'recv');
      }
      if (showEmptyHint && rows.length === 0) {
        showError('数据库暂无记录。请运行 sync-server 或确认设备已上报。');
      } else if (rows.length > 0) {
        clearError();
      }
    } catch (err) {
      console.error(err);
      showError('刷新失败：' + (err.message || String(err)));
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshHistory(false), 10000);
    dbLog('已启动轮询，间隔 10s', 'recv');
  }

  function subscribeRealtime(supabase, table) {
    const tableName = table || 'sensor_data';
    dbLog(`订阅 Realtime: ${tableName} INSERT`, 'cmd');

    return supabase
      .channel('sensor_data_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName },
        (payload) => {
          const row = payload.new;
          updateLatestUI(row);
          pushChartPoint(row);
          clearError();
          dbLog(
            `Realtime 新记录 id=${row.id} temp=${Number(row.temperature).toFixed(1)}°C door=${row.door_state}`,
            'recv'
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLiveStatus(true, 'Realtime 已连接');
          dbLog('Realtime 订阅成功', 'recv');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLiveStatus(false, 'Realtime 断开');
          showError('Realtime 订阅失败，请检查 Supabase Realtime 是否已开启。');
          dbLog('Realtime 订阅失败: ' + status, 'err');
        } else if (status === 'CLOSED') {
          setLiveStatus(false, '已关闭');
          dbLog('Realtime 通道已关闭', 'err');
        }
      });
  }

  async function initMonitor() {
    if (monitorStarted) return;
    monitorStarted = true;

    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey || c.supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
      showError('请在 js/config.js 中配置 supabaseUrl 与 supabaseAnonKey');
      setLiveStatus(false, '未配置');
      return;
    }
    if (typeof window.supabase === 'undefined') {
      showError('Supabase 库加载失败');
      return;
    }

    dbLog('数据库监控初始化...', 'cmd');
    dbLog(`连接 ${c.supabaseUrl}`, 'cmd');

    supabaseClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);

    try {
      setLiveStatus(false, '加载中...');
      initChart();
      dbLog(`查询表 ${c.supabaseTable || 'sensor_data'} 最近 ${MAX_POINTS} 条`, 'cmd');

      const rows = await fetchHistory(supabaseClient, c.supabaseTable);
      applyHistoryRows(rows);

      if (rows.length > 0) {
        const latest = rows[0];
        dbLog(
          `历史加载完成: ${rows.length} 条, 最新 id=${latest.id} temp=${Number(latest.temperature).toFixed(1)}°C`,
          'recv'
        );
        clearError();
      } else {
        dbLog('历史加载完成: 暂无记录', 'recv');
        showError('数据库暂无记录。可运行 greenhouse-web/sync-server.js 从巴法云同步。');
      }

      subscribeRealtime(supabaseClient, c.supabaseTable);
      startPolling();
    } catch (err) {
      console.error(err);
      setLiveStatus(false, '加载失败');
      showError('数据加载失败：' + (err.message || String(err)));
    }
  }

  window.initDbMonitor = initMonitor;
})();
