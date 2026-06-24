# 巴法云 → Supabase 同步服务

本目录部署到 [Render](https://render.com)，与仓库根目录的 **GitHub Pages 网页** 分离运行。

- **网页**：仓库根目录 → GitHub Pages（`index.html`）
- **同步**：本目录 `sync/` → Render Web Service

## Render 配置要点

| 项 | 值 |
|----|-----|
| 仓库 | [HSY3178/smart-window-web](https://github.com/HSY3178/smart-window-web) |
| Root Directory | **`sync`** |
| Build | `npm install` |
| Start | `npm start` |

环境变量见仓库根目录 `DEPLOY-SYNC.md`。
