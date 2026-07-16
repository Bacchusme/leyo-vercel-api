# Leyo MVP

乐遇 H5 MVP 全栈项目。

## 项目结构

```
leyoMVP/
├── api/                    # Vercel Serverless API（后端）
│   ├── locals.js           # GET /api/locals - 获取 Local 列表
│   ├── sessions.js         # GET /api/sessions - 获取 Session 列表
│   ├── sessions/
│   │   └── [id].js         # GET /api/sessions/:id - 获取 Session 详情
│   └── say-hi.js           # POST /api/say-hi - 提交 Say Hi
├── lib/
│   └── feishu.js           # 飞书 API 封装（Token + CRUD）
├── public/
│   └── index.html          # H5 前端页面
├── vercel.json             # Vercel 配置
├── package.json
└── .env.example            # 环境变量模板
```

## 部署到 Vercel

1. 注册 [vercel.com](https://vercel.com)，用 GitHub 登录
2. 在 GitHub 新建仓库 `leyo-vercel-api`，上传本项目所有文件
3. Vercel → Add New → Project → Import 你的仓库 → Deploy
4. Settings → Environment Variables 添加：

| 变量名 | 值 |
|--------|---|
| FEISHU_APP_ID | 你的飞书 App ID |
| FEISHU_APP_SECRET | 你的飞书 App Secret |
| BITABLE_APP_TOKEN | 飞书多维表格 app_token |
| TABLE_ID_LOCALS | Locals 表 table_id |
| TABLE_ID_SESSIONS | Sessions 表 table_id |
| TABLE_ID_SAYHI | SayHi 表 table_id |

5. Deployments 页面重新部署一次

## 数据管理

所有数据通过飞书多维表格管理，API 自动读取：
- 新增/修改 Local → H5 自动同步
- 新增/修改 Session → H5 自动同步
- Say Hi 提交 → 自动写入飞书表
