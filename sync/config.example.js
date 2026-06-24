/** 本地开发：复制为 config.js。云端部署请用环境变量，见 DEPLOY.md */
module.exports = {
  bemfa: {
    uid: '45c255a3ffe318013c347e50f7a8fabe',
    topic: 'light004',
    type: 1, /* MQTT */
    num: 1,  /* 只取最新 1 条 */
  },
  supabase: {
    url: 'https://xfitwixmrobeswdqjssd.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmaXR3aXhtcm9iZXN3ZHFqc3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzMyNjEsImV4cCI6MjA5NzgwOTI2MX0.03bGO6uBIhd4UswXlojOBCbSMfo2i9BzwLIpKagCc5g',
    table: 'sensor_data',
  },
  syncIntervalMs: 5000,
};
