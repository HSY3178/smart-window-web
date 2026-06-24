# 云端同步部署（smart-window-web 仓库）

仓库：[https://github.com/HSY3178/smart-window-web](https://github.com/HSY3178/smart-window-web)

| 部分 | 部署位置 | 作用 |
|------|----------|------|
| 网页 `index.html` 等 | **GitHub Pages** | 远程控制 + 历史数据 |
| `sync/` 目录 | **Render** | 巴法云 → Supabase 自动同步 |

部署后 **本地无需再运行** `npm start`。

---

## 一、推送代码到 GitHub

```powershell
cd "d:\下载\A73\A72\A1\web"
git add .
git commit -m "Add sync service for Render cloud deploy"
git push origin main
```

---

## 二、GitHub Pages（网页，若尚未开启）

1. 仓库 **Settings → Pages**
2. Source：`main` 分支，`/ (root)`
3. 访问：`https://HSY3178.github.io/smart-window-web/`

---

## 三、Render 部署 sync 服务

1. 登录 [render.com](https://render.com) → **New → Web Service**
2. 连接 GitHub 仓库 **`HSY3178/smart-window-web`**
3. 填写：

| 配置项 | 值 |
|--------|-----|
| Name | `greenhouse-sync` |
| Root Directory | **`sync`** ← 重要 |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

4. **Environment Variables**：

| Key | Value |
|-----|--------|
| `BEMFA_UID` | `45c255a3ffe318013c347e50f7a8fabe` |
| `BEMFA_TOPIC` | `light004` |
| `BEMFA_TYPE` | `1` |
| `BEMFA_NUM` | `1` |
| `SUPABASE_URL` | `https://xfitwixmrobeswdqjssd.supabase.co` |
| `SUPABASE_ANON_KEY` | 你的 Supabase anon key |
| `SUPABASE_TABLE` | `sensor_data` |
| `SYNC_INTERVAL_MS` | `5000` |

5. **Create Web Service**

6. 验证：打开 `https://greenhouse-sync.onrender.com/health`（名称以 Render 为准）

---

## 四、可选：Blueprint 一键创建

仓库根目录已有 `render.yaml`，在 Render 选 **New → Blueprint**，选本仓库，按提示填环境变量。

---

## 五、免费实例保活

Render 免费版约 15 分钟无访问会休眠。用 [UptimeRobot](https://uptimerobot.com) 每 5 分钟访问 `/health`。

---

## 六、Supabase 表结构

若 INSERT 失败，在 Supabase SQL Editor 执行 `sync/supabase_setup.sql`。
